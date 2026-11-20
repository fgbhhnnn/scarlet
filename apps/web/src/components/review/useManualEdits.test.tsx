// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TimelineOp } from "@scarlet/timeline";
import { api } from "../../lib/client";
import { MockClient } from "../../lib/mock/MockClient";
import { PRJ } from "../../lib/mock/fixtures";
import { useProjectStore } from "../../stores/project";
import { useManualEdits } from "./useManualEdits";

const initial = useProjectStore.getState();
let root: Root;
let container: HTMLDivElement;
let mock: MockClient;
let editor: ReturnType<typeof useManualEdits>;

function Probe() {
  const timeline = useProjectStore(state => state.current?.timeline ?? undefined);
  editor = useManualEdits(PRJ, timeline);
  return null;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mock = new MockClient(() => "mock");
  vi.spyOn(api, "proposeChange").mockImplementation(mock.proposeChange.bind(mock));
  vi.spyOn(api, "historyEdit").mockImplementation(mock.historyEdit.bind(mock));
  vi.spyOn(api, "workspace").mockImplementation(mock.workspace.bind(mock));
  const { project, timeline } = await mock.workspace(PRJ);
  useProjectStore.setState({ current: { id: PRJ, project: { ...project }, timeline, media: project.media,
    changes: [], notes: [], tasks: [], renders: [], taskEvents: {} } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useProjectStore.setState(initial, true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const marker: TimelineOp = { op: "addMarker", marker: { id: "mrk_manual", time: 0.5, text: "手动标记", kind: "note", resolved: false } };

function hasMarker() {
  return useProjectStore.getState().current?.timeline?.markers.some(item => item.id === "mrk_manual");
}

it("saves once, then undo and redo create new saved versions with the expected timeline contents", async () => {
  await act(async () => {
    const first = editor.apply([marker], "添加标记");
    await expect(editor.apply([marker], "添加标记")).resolves.toBe(false);
    await expect(first).resolves.toBe(true);
  });
  const saved = useProjectStore.getState().current?.project.head;
  expect(api.proposeChange).toHaveBeenCalledTimes(1);
  expect(hasMarker()).toBe(true);
  expect(editor.canUndo).toBe(true);

  await act(async () => editor.undo());
  expect(useProjectStore.getState().current?.project.head).not.toBe(saved);
  expect(hasMarker()).toBe(false);
  expect(editor.canRedo).toBe(true);

  await act(async () => editor.redo());
  expect(useProjectStore.getState().current?.project.head).not.toBe(saved);
  expect(hasMarker()).toBe(true);
  expect(editor.canUndo).toBe(true);
  expect(editor.canRedo).toBe(false);
});

it("keeps the manual undo stack from restoring over an independently saved timeline", async () => {
  await act(async () => { await expect(editor.apply([marker], "添加标记")).resolves.toBe(true); });
  const saved = useProjectStore.getState().current?.project.head ?? undefined;
  await mock.proposeChange(PRJ, { fromVersion: saved, description: "外部编辑", autoApprove: true,
    ops: [{ op: "addMarker", marker: { id: "mrk_external", time: 1.5, text: "外部标记", kind: "note", resolved: false } }] });
  await act(async () => editor.undo());
  expect(editor.error).toBe("时间线已更新，请在最新版本上重试。");

  await act(async () => useProjectStore.getState().refreshHead(PRJ));
  expect(editor.canUndo).toBe(false);
  expect(hasMarker()).toBe(true);
  expect(useProjectStore.getState().current?.timeline?.markers.some(item => item.id === "mrk_external")).toBe(true);
});
