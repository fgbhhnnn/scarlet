// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { applyOps, emptyTimeline, makeMediaClip, type MediaAsset, type TimelineOp } from "@scarlet/timeline";
import { ManualAudioControls } from "./ManualAudioControls";

const media: MediaAsset[] = [
  { id: "picture", kind: "video", name: "口播.mp4", path: "picture.mp4", hasAudio: true },
  { id: "music", kind: "audio", name: "配乐.wav", path: "music.wav", duration: 40 },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function show(props: Partial<ComponentProps<typeof ManualAudioControls>> = {}) {
  return act(async () => root.render(<ManualAudioControls timeline={emptyTimeline("project")}
    media={media} cursorSeconds={0} fps={30} onApply={async () => true} disabled={false} {...props} />));
}

function button(label: string) {
  return [...container.querySelectorAll("button")].find(item => item.textContent === label)!;
}

it("places music on an available track without extending the picture", async () => {
  const timeline = emptyTimeline("project");
  timeline.tracks[0]!.clips.push(makeMediaClip("picture", 0, 12, 0));
  timeline.tracks[1]!.clips.push(makeMediaClip("picture", 0, 12, 0));
  const apply = vi.fn(async (ops: TimelineOp[]) => {
    const next = applyOps(timeline, ops);
    expect(next.tracks).toHaveLength(3);
    expect(next.tracks[2]).toMatchObject({
      kind: "audio",
      clips: [{ mediaId: "music", timelineIn: 8, sourceIn: 0, sourceOut: 4 }],
    });
    return true;
  });

  await show({ timeline, cursorSeconds: 8, onApply: apply });
  await act(async () => button("添加到播放头").click());
  expect(apply).toHaveBeenCalledOnce();
});

it("applies volume percentages to the selected clip, including mute", async () => {
  const timeline = emptyTimeline("project");
  timeline.tracks[0]!.clips.push(makeMediaClip("picture", 0, 12, 0, { id: "speech", volume: 0.35 }));
  const apply = vi.fn(async () => true);

  await show({ timeline, onApply: apply });
  const input = container.querySelector<HTMLInputElement>("input[type=number]")!;
  expect(input.value).toBe("35");
  expect(button("应用音量").disabled).toBe(true);

  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "0");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("应用音量").click());
  expect(apply).toHaveBeenCalledWith([{ op: "updateClip", clipId: "speech", patch: { volume: 0 } }], "调整音量");
});
