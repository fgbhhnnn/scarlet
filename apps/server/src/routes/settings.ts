import { Hono } from "hono";
import { z } from "zod/v3";
import type { AppEnv } from "../auth.js";
import type { Ctx } from "../context.js";
import { badRequest } from "../errors.js";
import { availableTranscriptionProvider, transcriptionProviderIssue } from "../transcribe/index.js";
import { localRuntimeStatus, resolveLocalRuntime, localRuntimeIssue } from "../transcribe/localRuntime.js";
import { jsonBody } from "./util.js";

/** Why nothing can transcribe, in the editor's words, so Media can say it and offer the fix. */
async function transcriptionIssue(ctx: Ctx): Promise<string> {
  if (ctx.settings().transcription.provider === "none") {
    return await localRuntimeIssue(resolveLocalRuntime(ctx, { ...ctx.settings().transcription, provider: "whispercpp" }))
      ?? "Local transcription is unavailable.";
  }
  return transcriptionProviderIssue(ctx);
}

export function settingsRoutes(ctx: Ctx) {
  const r = new Hono<AppEnv>();

  r.get("/settings", async (c) => {
    const settings = ctx.settings();
    const transcriptionAvailable = !!await availableTranscriptionProvider(ctx);
    return c.json({ settings, transcriptionAvailable, telemetryUnavailable: ctx.telemetry.unavailable,
      ...!transcriptionAvailable && { transcriptionIssue: await transcriptionIssue(ctx) } });
  });

  r.get("/settings/local-model", async (c) => c.json(await localRuntimeStatus(ctx)));

  r.patch("/settings", async (c) => {
    const patch = await jsonBody(c, z.record(z.unknown()));
    if ("dialogue" in patch) throw badRequest("dialogue_settings_moved", "Edit the Dialogue pass skill to change dialogue preferences.");
    const previous = ctx.settings().render;
    const settings = ctx.repos.settings.update(patch);
    ctx.telemetry.refreshPreference();
    if (previous.hwaccel !== settings.render.hwaccel || previous.previewHeight !== settings.render.previewHeight) {
      ctx.bus.publish({ type: "render.settings.updated" });
    }
    return c.json({ settings });
  });

  return r;
}
