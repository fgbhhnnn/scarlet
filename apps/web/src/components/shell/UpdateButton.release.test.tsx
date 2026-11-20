// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { desktop } from "../../lib/desktop";
import { enableUpdateStatus } from "../../lib/updateStatus";
import { UpdateButton } from "./UpdateButton";
import { UpdateSettings } from "./UpdateSettings";

it("shows a release downloading by how much of it is here, then restarts into it by its version", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const download = { revision: "0.2.0", done: 0.42, step: 0, stepStarted: 0, stepSeconds: 0 };
  const status = vi.spyOn(desktop, "updateStatus").mockResolvedValue({ ready: null, building: null, source: "release" });
  vi.spyOn(desktop, "updateChangelog").mockResolvedValue("");
  const restart = vi.spyOn(desktop, "restartForUpdate").mockResolvedValue();
  const container = document.createElement("div");
  const root = createRoot(container);
  const poll = () => act(async () => vi.advanceTimersByTimeAsync(5000).then(() => undefined));
  const hint = () => [...container.querySelector("[role=tooltip]")!.firstElementChild!.children].map(line => line.textContent);
  const on = `当前版本为 ${__SCARLET_VERSION__}${__SCARLET_REVISION__ ? `，构建 ${__SCARLET_REVISION__.slice(0, 7)}` : ""}.`;
  enableUpdateStatus("release");
  try {
    await act(async () => { root.render(<UpdateButton />); });
    expect(container.childElementCount).toBe(0);
    // The same control and labels as a build from main: only what it says on hover names a release and its download.
    status.mockResolvedValue({ ready: null, building: download, source: "release" });
    await poll();
    expect(container.querySelector("[role=status]")!.textContent).toBe("更新中42%");
    expect(container.querySelector("[role=status]")!.getAttribute("aria-label")).toBe("正在更新 Scarlet, 42% 已下载");
    expect(hint()).toEqual(["正在更新至版本 0.2.0", on,
      "Scarlet 正在后台下载更新。你可以继续编辑，更新就绪后即可重启安装。"]);
    // The figure is the download's own: it doesn't move between reports.
    await act(async () => vi.advanceTimersByTimeAsync(4000).then(() => undefined));
    expect(container.querySelector(".update-button-figure")!.textContent).toBe("42%");
    status.mockResolvedValue({ ready: "0.2.0", building: null, source: "release" });
    await poll();
    const button = container.querySelector("button")!;
    expect(button.textContent).toBe("重启并更新");
    expect(hint()).toEqual(["版本 0.2.0 已就绪", on, "重启会安装更新并返回此处，Scarlet 正在处理的剪辑会从中断处继续。"]);
    await act(async () => button.click());
    expect(restart).toHaveBeenCalledWith("0.2.0");
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

it("checks the release manifest from Settings, not Git", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  enableUpdateStatus("release");
  const git = vi.spyOn(desktop, "latestUpdateRevision");
  const check = vi.spyOn(desktop, "checkForRelease").mockResolvedValueOnce("0.2.0").mockResolvedValueOnce(null);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => { root.render(<UpdateSettings />); });
    const button = container.querySelector("button")!;
    await act(async () => button.click());
    expect(container.querySelector("[role=status]")!.textContent).toBe("版本 0.2.0 已发布，Scarlet 正在准备更新。");
    await act(async () => button.click());
    expect(container.querySelector("[role=status]")!.textContent).toBe("Scarlet 已是最新版本。");
    expect(check).toHaveBeenCalledTimes(2);
    expect(git).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
