// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTimeline, makeMediaClip, type MediaAsset, type Timeline } from "@scarlet/timeline";
import { ManualTimeline } from "./ManualTimeline";

const manual = vi.hoisted(() => ({ apply: vi.fn() }));

vi.mock("./useManualEdits", () => ({
  useManualEdits: () => ({
    apply: manual.apply,
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    busy: false,
    error: null,
  }),
}));

const media: MediaAsset[] = [{
  id: "video-1",
  kind: "video",
  name: "口播.mp4",
  path: "口播.mp4",
  status: "ready",
  duration: 12,
}];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  manual.apply.mockReset().mockResolvedValue(true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function show(props: Partial<ComponentProps<typeof ManualTimeline>> = {}) {
  const timeline = props.timeline ?? emptyTimeline("project");
  return act(async () => root.render(<ManualTimeline open projectId="project" timeline={timeline}
    media={media} fps={30} canEdit onClose={vi.fn()} onMedia={vi.fn()} {...props} />));
}

function firstVideoButton() {
  return [...container.querySelectorAll("button")].find(button => button.textContent?.trim() === "将首个视频添加到 V1");
}

describe("ManualTimeline first video", () => {
  it("offers the first ready video and adds it to V1 from source zero", async () => {
    await show();
    const button = firstVideoButton();
    expect(button).toBeTruthy();
    await act(async () => button!.click());

    expect(manual.apply).toHaveBeenCalledOnce();
    const [ops, label] = manual.apply.mock.calls[0]!;
    expect(label).toBe("将首个视频添加到 V1");
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      op: "addClip",
      trackId: "v1",
      clip: { kind: "media", mediaId: "video-1", sourceIn: 0, sourceOut: 12, timelineIn: 0, label: "口播.mp4" },
    });
  });

  it("hides the first-video action once V1 already has a clip", async () => {
    const timeline = emptyTimeline("project") as Timeline;
    timeline.tracks[0]!.clips.push(makeMediaClip("video-1", 0, 12, 0));
    await show({ timeline });
    expect(firstVideoButton()).toBeUndefined();
    expect(manual.apply).not.toHaveBeenCalled();
  });
});

it("keeps the V1 entry point enabled even when the empty workspace is read-only", async () => {
  const onAddFirstVideo = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(<ManualTimeline open projectId="prj_first" timeline={undefined} media={media} fps={30}
    canEdit={false} onClose={vi.fn()} onMedia={vi.fn()} onAddFirstVideo={onAddFirstVideo} />));

  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("将首个视频添加到 V1"));
  expect(button).toBeDefined();
  expect(button!.disabled).toBe(false);
  await act(async () => button!.click());
  expect(onAddFirstVideo).toHaveBeenCalledOnce();
});
