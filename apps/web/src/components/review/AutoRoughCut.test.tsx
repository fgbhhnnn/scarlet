// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { isAutomaticFirstCut } from "@scarlet/shared";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../../lib/client";
import { buildDb, PRJ } from "../../lib/mock/fixtures";
import { useProjectStore } from "../../stores/project";
import { useSkillsStore } from "../../stores/skills";
import { AutoRoughCut } from "./AutoRoughCut";

vi.mock("../agent/AgentChip", () => ({
  useAgentAvailability: () => ({ effective: { agent: "claude", model: "opus" } }),
}));

const initialProjectStore = useProjectStore.getState();
const initialSkillsStore = useSkillsStore.getState();
const db = buildDb();
const project = db.projects.find(project => project.id === PRJ)!;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const refreshHead = vi.fn().mockResolvedValue(undefined);
  useProjectStore.setState({ refreshHead, current: {
    id: PRJ, project, media: project.media, timeline: db.timelines[project.head!]!,
    notes: [], changes: [], tasks: [], taskEvents: {}, renders: [], versions: [],
  } });
  useSkillsStore.setState({ skills: [], status: "ready", error: null });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useProjectStore.setState(initialProjectStore, true);
  useSkillsStore.setState(initialSkillsStore, true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const open = () => act(async () => container.querySelector<HTMLButtonElement>("[aria-haspopup=dialog]")!.click());
const start = () => document.querySelector<HTMLButtonElement>("dialog button.btn-primary")!;

it("queues Scarlet's dialogue pass for the current version and blocks a duplicate while it runs", async () => {
  const onQueued = vi.fn();
  useSkillsStore.setState({ status: "error", error: "无法读取技能" });
  const createTask = vi.spyOn(api, "createTask").mockImplementation(async (_projectId, body) => ({
    task: { ...db.tasks[0]!, kind: "edit", instruction: body.instruction, context: { ...body.context, dialogueOperation: "first-cut" }, state: "queued" },
  }));
  await act(async () => root.render(<AutoRoughCut importing={0} onQueued={onQueued} />));
  await open();
  await act(async () => start().click());

  expect(createTask).toHaveBeenCalledExactlyOnceWith(PRJ, expect.objectContaining({
    kind: "edit", agent: "claude", model: "opus", context: { version: project.head, message: "Make first cut" },
  }));
  expect(isAutomaticFirstCut(createTask.mock.calls[0]![1])).toBe(true);
  expect(createTask.mock.calls[0]![1].instruction).toContain("保留原意、否定词、数字");
  expect(onQueued).toHaveBeenCalledOnce();
  expect(document.querySelector("dialog")).toBeNull();

  await open();
  expect(start().disabled).toBe(true);
  expect(document.querySelector("dialog [role=status]")?.textContent).toContain("已有粗剪任务");
});

it("waits for imports to finish before enabling the request", async () => {
  const onQueued = vi.fn();
  await act(async () => root.render(<AutoRoughCut importing={1} onQueued={onQueued} />));
  await open();
  expect(start().disabled).toBe(true);

  await act(async () => root.render(<AutoRoughCut importing={0} onQueued={onQueued} />));
  expect(start().disabled).toBe(false);
});

it("queues against the initialized head even when the workspace refresh fails", async () => {
  const fresh = { ...project, head: null };
  const refreshHead = vi.fn().mockRejectedValue(new Error("The workspace could not refresh"));
  const timeline = vi.spyOn(api, "timeline").mockResolvedValue({ timeline: { ...db.timelines[project.head!]!, version: "ver_initialized" } });
  const createTask = vi.spyOn(api, "createTask").mockImplementation(async (_projectId, body) => ({
    task: { ...db.tasks[0]!, kind: "edit", instruction: body.instruction, context: { ...body.context, dialogueOperation: "first-cut" }, state: "queued" },
  }));
  useProjectStore.setState({ refreshHead, current: {
    id: PRJ, project: fresh, media: fresh.media, timeline: null,
    notes: [], changes: [], tasks: [], taskEvents: {}, renders: [], versions: [],
  } });
  const onQueued = vi.fn();
  await act(async () => root.render(<AutoRoughCut importing={0} onQueued={onQueued} />));
  await open();
  await act(async () => start().click());

  expect(timeline).toHaveBeenCalledWith(PRJ, "head");
  expect(refreshHead).toHaveBeenCalledWith(PRJ);
  expect(onQueued).toHaveBeenCalledOnce();
  expect(createTask).toHaveBeenCalledWith(PRJ, expect.objectContaining({ context: { version: "ver_initialized", message: "Make first cut" } }));
});

it("shows a task creation error and lets the editor retry", async () => {
  const onQueued = vi.fn();
  const createTask = vi.spyOn(api, "createTask").mockRejectedValueOnce(new Error("模型连接已断开"))
    .mockImplementation(async (_projectId, body) => ({
      task: { ...db.tasks[0]!, kind: "edit", instruction: body.instruction, context: body.context ?? {}, state: "queued" },
    }));
  await act(async () => root.render(<AutoRoughCut importing={0} onQueued={onQueued} />));
  await open();
  await act(async () => start().click());

  expect(document.querySelector("dialog")?.textContent).toContain("模型连接已断开");
  expect(start().disabled).toBe(false);
  expect(onQueued).not.toHaveBeenCalled();

  await act(async () => start().click());
  expect(createTask).toHaveBeenCalledTimes(2);
  expect(onQueued).toHaveBeenCalledOnce();
  expect(document.querySelector("dialog")).toBeNull();
});
