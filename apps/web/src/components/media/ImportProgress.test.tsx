// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { MediaAsset } from "@scarlet/timeline";
import { useProjectStore } from "../../stores/project";
import { ImportProgress, preparationLabel, preparationStep } from "./ImportProgress";

afterEach(() => vi.unstubAllGlobals());

const file = (preparation?: MediaAsset["preparation"]) => ({ id: "med_a", name: "Interview.mov", kind: "video", path: "/media/a", preparation }) as MediaAsset;

/** The card as read: the file's name, where it is in the batch, the step in words, and the bar's value. */
async function read(props: ComponentProps<typeof ImportProgress>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(<ImportProgress {...props} />));
  // A card with no bar has no label for one.
  const bar = container.querySelector("progress");
  const out = { name: container.querySelector("span[title]")?.textContent ?? container.querySelector("span")?.textContent, step: container.querySelector('[role="status"]')?.textContent,
    value: bar?.hasAttribute("value") ? Number(bar.getAttribute("value")) : undefined, label: bar?.getAttribute("aria-label"), place: container.querySelector(".tnum.shrink-0")?.textContent };
  await act(async () => root.unmount());
  return out;
}

it("names the step a file's preparation is on and how far along it is, with no guess at the time left", () => {
  expect(preparationLabel(file())).toBe("正在准备素材…");
  expect(preparationLabel(file({ stage: "fingerprint", fraction: 0.25 }))).toBe("正在检查文件 · 25%");
  // The engine's estimate of the time left isn't said.
  expect(preparationLabel(file({ stage: "preview", fraction: 0.5, remainingSeconds: 90 }))).toBe("正在创建视频预览 · 50%");
  // A step still under way never says 100%.
  expect(preparationLabel(file({ stage: "waveform", fraction: 1, remainingSeconds: 0 }))).toBe("正在读取音频波形 · 99%");
  // Media's row draws the same step as a word, a bar and a percent.
  expect(preparationStep(file({ stage: "fingerprint", fraction: 0.42, remainingSeconds: 185 }))).toEqual({ text: "正在检查文件", percent: "42%" });
  expect(preparationStep(file())).toEqual({ text: "正在准备素材" });
});

it("says what a file chosen by path is going through, with a bar only while there is a share to show", async () => {
  const local = { projectId: "p", name: "Interview.mov", path: "/Volumes/Card/Interview.mov", position: 2, total: 5 };
  // Until the engine reports, the copy is all that is known: the bar runs without a value.
  expect(await read({ localImport: local })).toEqual({ name: "Interview.mov", place: "文件 2/5", step: "正在复制原文件到项目…", value: undefined, label: "导入进度：Interview.mov" });
  expect(await read({ localImport: { ...local, checked: 0 } })).toMatchObject({ step: "正在读取媒体信息…", value: undefined });
  expect(await read({ localImport: { ...local, checked: 0.4 } })).toMatchObject({ step: "正在检查文件 · 40%", value: 0.4 });
  expect(await read({ localImport: { ...local, checked: 1 } })).toMatchObject({ step: "正在完成导入…", value: undefined });
  // A link has nothing on this computer to copy. It downloads, and the engine reports no share of that.
  expect(await read({ localImport: { projectId: "p", name: "Interview.mov", path: "https://example.com/Interview.mov", position: 1, total: 1 } }))
    .toEqual({ name: "Interview.mov", place: "文件 1/1", step: "正在下载…", value: undefined, label: "导入进度：Interview.mov" });
});

it("says how an upload or a preparation is going, and something sensible before any file is known", async () => {
  const upload = { id: 1, name: "Broll.mp4", size: 10, progress: 0.3, state: "uploading" as const };
  expect(await read({ upload })).toMatchObject({ name: "Broll.mp4", step: "正在上传 · 30%", value: 0.3, place: undefined });
  expect(await read({ upload: { ...upload, progress: 1, state: "preparing" } })).toMatchObject({ step: "正在读取媒体信息…", value: undefined });
  expect(await read({ preparing: file({ stage: "fingerprint", fraction: 0.25 }) })).toMatchObject({ name: "Interview.mov", step: "正在检查文件 · 25%", value: 0.25 });
  // A file by path comes first: its own steps are the ones on screen while it is copied in.
  expect(await read({ localImport: { projectId: "p", name: "A.mov", path: "/a", position: 1, total: 1 }, upload, preparing: file() })).toMatchObject({ name: "A.mov", step: "正在复制原文件到项目…" });
  expect(await read({})).toEqual({ name: "正在添加素材", place: undefined, step: "正在开始导入…", value: undefined, label: "导入进度" });
});

it("says a file's read is paused while the project is, with no step, percent or bar", async () => {
  const reading = file({ stage: "fingerprint", fraction: 0.25 });
  expect(preparationStep(reading, true)).toEqual({ text: "读取已暂停", held: true });
  expect(preparationLabel(file(), true)).toBe("读取已暂停");
  const previous = useProjectStore.getState();
  useProjectStore.setState({ current: { project: { mediaPaused: true } } as never });
  try {
    // The engine holds the read until resume, so a bar here would only stand still.
    expect(await read({ preparing: reading })).toEqual({ name: "Interview.mov", place: undefined, step: "读取已暂停", value: undefined, label: undefined });
    // A file still being copied in or uploaded isn't held by the pause, and says its own step.
    expect(await read({ localImport: { projectId: "p", name: "A.mov", path: "/a", position: 1, total: 1, checked: 0.4 }, preparing: reading })).toMatchObject({ step: "正在检查文件 · 40%", value: 0.4 });
    expect(await read({ upload: { id: 1, name: "Broll.mp4", size: 10, progress: 0.3, state: "uploading" } })).toMatchObject({ step: "正在上传 · 30%", value: 0.3 });
  } finally {
    useProjectStore.setState(previous, true);
  }
});
