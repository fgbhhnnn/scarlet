// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MediaAsset } from "@scarlet/timeline";
import { ManualTimeline } from "./ManualTimeline";

const manual = vi.hoisted(() => ({ apply: vi.fn(), undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false, busy: false, error: null }));
vi.mock("./useManualEdits", () => ({ useManualEdits: () => manual }));

let container: HTMLDivElement;
let root: Root;
const video = { id: "med_first", kind: "video", name: "口播.mp4", path: "口播.mp4", status: "ready", duration: 20, fps: 30, hasAudio: true } as MediaAsset;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  manual.apply.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

it("keeps the V1 entry point enabled even when the empty workspace is read-only", async () => {
  const onAddFirstVideo = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(<ManualTimeline open projectId="prj_first" timeline={undefined} media={[video]} fps={30}
    canEdit={false} onClose={vi.fn()} onMedia={vi.fn()} onAddFirstVideo={onAddFirstVideo} />));

  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("将首个视频添加到 V1"));
  expect(button).toBeDefined();
  expect(button!.disabled).toBe(false);
  await act(async () => button!.click());
  expect(onAddFirstVideo).toHaveBeenCalledOnce();
});
