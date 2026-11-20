// Run from the repo root on macOS or Linux with the workspace dependencies installed.
// node --import tsx apps/server/scripts/verify-whisper-fallback.ts <koubo.mp4> <whisper-cli> <pinned-model.bin> <output-parent>
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hashFile } from "@scarlet/render";
import type { Task } from "@scarlet/shared";
import type { MediaAsset, Project, Transcript } from "@scarlet/timeline";
import { createApp } from "../src/app.js";
import { accessToken } from "../src/auth.js";
import { bundledWhisperModel } from "../src/transcribe/localModel.js";

const args = process.argv.slice(2);
assert(process.platform !== "win32" && args.length === 4,
  "Usage (macOS or Linux): node --import tsx apps/server/scripts/verify-whisper-fallback.ts <koubo.mp4> <whisper-cli> <pinned-model.bin> <output-parent>");
const [input, cpuCli, model, outputParent] = args.map(path => resolve(path)) as [string, string, string, string];
await Promise.all([access(input, constants.R_OK), access(cpuCli, constants.X_OK), access(model, constants.R_OK)]);
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
await mkdir(outputParent, { recursive: true });
const output = await mkdtemp(join(outputParent, "f02-whisper-fallback-"));
console.log(`Evidence directory: ${output}`);
const library = join(output, "library");
const cpu = join(output, "whisper-cpu");
const gpu = join(output, "whisper-gpu");
const cpuArgs = join(output, "cpu.args");
const gpuArgs = join(output, "gpu.args");
const cpuLog = join(output, "cpu.log");
const log = join(output, "engine.log");
const lines: string[] = [];
let workspace: ReturnType<typeof createApp> | undefined;

try {
  // Both wrappers record the real engine's arguments before simulating the GPU exit or handing off to Whisper.
  process.env.SCARLET_VERIFY_CPU_CLI = cpuCli;
  process.env.SCARLET_VERIFY_CPU_ARGS = cpuArgs;
  process.env.SCARLET_VERIFY_CPU_LOG = cpuLog;
  process.env.SCARLET_VERIFY_GPU_ARGS = gpuArgs;
  await Promise.all([
    writeFile(gpu, '#!/bin/sh\nset -eu\nprintf "%s\\n" "$@" >> "$SCARLET_VERIFY_GPU_ARGS"\necho "injected Whisper GPU process failure" >&2\nexit 86\n', { mode: 0o700 }),
    writeFile(cpu, '#!/bin/sh\nset -eu\nset -- -ng "$@"\nprintf "%s\\n" "$@" >> "$SCARLET_VERIFY_CPU_ARGS"\nexec "$SCARLET_VERIFY_CPU_CLI" "$@" 2>> "$SCARLET_VERIFY_CPU_LOG"\n', { mode: 0o700 }),
  ]);
  // Run with the supplied model cache and avoid fetching the optional speaker models.
  globalThis.fetch = async () => { throw new Error("Network disabled for the local Whisper fallback check."); };
  const { app, ctx } = workspace = createApp({
    dataDir: library,
    env: { SCARLET_TELEMETRY_ENABLED: "false" },
    log(message) {
      const line = `${new Date().toISOString()} ${message}`;
      lines.push(line);
      if (message.startsWith("[whisper]")) console.log(line);
    },
  });
  await mkdir(join(library, "models"), { recursive: true });
  await copyFile(model, join(library, "models", bundledWhisperModel.name), constants.COPYFILE_FICLONE);
  ctx.whisperCli = cpu;
  ctx.whisperGpu = gpu;
  ctx.repos.settings.update({ transcription: { provider: "whispercpp", localModel: "whispercpp", language: "auto" } });

  async function api<T>(path: string, status: number, body?: object): Promise<T> {
    const response = await app.request("/api" + path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${accessToken(ctx)}`, ...(body && { "Content-Type": "application/json" }) },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    assert.equal(response.status, status, `${path}: ${text}`);
    return JSON.parse(text) as T;
  }

  const { project } = await api<{ project: Project }>("/projects", 201, { name: "F02 Whisper fallback verification" });
  const { media } = await api<{ media: MediaAsset }>(`/projects/${project.id}/media/import`, 201, { path: input, name: "koubo-raw.mp4" });
  const deadline = Date.now() + 15 * 60_000;
  let task: Task | undefined;
  while (Date.now() < deadline) {
    const { tasks } = await api<{ tasks: Task[] }>(`/projects/${project.id}/tasks`, 200);
    task = tasks.find(row => row.kind === "transcribe" && row.context.mediaId === media.id);
    if (task && ["done", "failed", "cancelled"].includes(task.state)) break;
    await delay(250);
  }
  assert.ok(task?.state === "done", task?.error ?? `Expected a completed transcription task, got ${task?.state ?? "no task"}.`);
  const transcript = await api<Transcript>(`/media/${media.id}/transcript`, 200);
  assert.equal(transcript.mediaId, media.id);
  assert.equal(transcript.language, "zh");
  assert.ok(transcript.segments.some(segment => /\p{Script=Han}/u.test(segment.text)), "Expected Chinese speech in the saved transcript.");
  assert.equal(transcript.provider, "whispercpp");
  assert.equal(transcript.aligning, undefined);

  const [gpuInvocation, cpuInvocation] = await Promise.all(
    [gpuArgs, cpuArgs].map(async path => (await readFile(path, "utf8")).trimEnd().split("\n")),
  );
  assert.ok(cpuInvocation.includes("-ng"), "The retry must run on CPU.");
  for (const flag of ["-f", "-m", "-l"]) {
    const gpuValue = gpuInvocation[gpuInvocation.indexOf(flag) + 1];
    assert.ok(gpuInvocation.includes(flag) && cpuInvocation.includes(flag) && gpuValue);
    assert.equal(cpuInvocation[cpuInvocation.indexOf(flag) + 1], gpuValue, `The retry changed ${flag}.`);
  }
  const failure = lines.findIndex(line => line.includes("[whisper] A run failed on the GPU build") &&
    line.includes("exited with code 86: injected Whisper GPU process failure"));
  const fallback = lines.findIndex(line => line.includes("[whisper] That run finished on the CPU build"));
  const finished = lines.findIndex(line => line.includes(`[transcribe] ${media.id} done in`));
  assert.ok(failure >= 0 && fallback > failure && finished > fallback, "Expected GPU failure, CPU success and transcription completion in order.");

  const result = {
    revision,
    input: { name: media.name, duration: media.duration, sha256: await hashFile(input) },
    gpu: { faultInjected: true, exitCode: 86 },
    cpu: { cliSha256: await hashFile(cpuCli), noGpu: true, sameWav: true },
    task: { id: task.id, state: task.state, summary: task.summary },
    transcript: { id: transcript.id, provider: transcript.provider, model: transcript.modelLabel,
      modelSha256: bundledWhisperModel.sha256, language: transcript.language, segments: transcript.segments.length },
  };
  const summary = JSON.stringify(result, null, 2);
  await writeFile(join(output, "result.json"), summary + "\n");
  console.log(summary);
} finally {
  try {
    await workspace?.ctx.close();
  } finally {
    await writeFile(log, lines.join("\n") + "\n");
    await Promise.all([library, cpu, gpu].map(path => rm(path, { force: true, recursive: true })));
  }
}
