// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { desktop } from "../../lib/desktop";
import { StartupRecovery } from "./StartupRecovery";

it("opens native logs while the engine is offline and can copy an error without the native bridge", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const info = vi.spyOn(desktop, "info").mockResolvedValue({
    logDir: "/fixture/logs", configFile: "", dataDir: "", workDir: "", platform: "windows", version: "test", arch: "x64",
  });
  const open = vi.spyOn(desktop, "openPath").mockResolvedValue();
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const container = document.createElement("div");
  const root = createRoot(container);
  const button = (label: string) => [...container.querySelectorAll("button")].find(b => b.textContent === label);
  try {
    await act(async () => root.render(<StartupRecovery title="Reconnecting" detail="Engine stopped" showLogs />));
    await act(async () => button("打开日志")!.click());
    expect(open).toHaveBeenCalledWith("/fixture/logs");
    info.mockClear();
    await act(async () => root.render(<StartupRecovery title="Scarlet couldn’t start" detail="Bridge unavailable" />));
    expect(button("打开日志")).toBeUndefined();
    await act(async () => button("复制诊断信息")!.click());
    expect(copy).toHaveBeenCalledWith("Scarlet couldn’t start\nBridge unavailable");
    expect(info).not.toHaveBeenCalled();
    expect(container.textContent).toContain("已复制诊断信息。");
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
