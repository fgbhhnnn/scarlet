// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { desktop } from "../../lib/desktop";
import { ExportLogs } from "./DesktopSettings";

it("saves the logs, shows the file and reports a failed save", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  const exportLogs = vi.spyOn(desktop, "exportLogs").mockResolvedValueOnce(null).mockResolvedValueOnce("C:\\Users\\tester\\Desktop\\scarlet-logs.zip").mockRejectedValueOnce("Disk full");
  const reveal = vi.spyOn(desktop, "revealPath").mockResolvedValue();
  const container = document.createElement("div");
  const root = createRoot(container);
  const button = (label: string) => [...container.querySelectorAll("button")].find(b => b.textContent === label);
  try {
    await act(async () => root.render(<ExportLogs />));
    await act(async () => button("导出日志…")!.click());
    expect(container.textContent).not.toContain("Saved");
    await act(async () => button("导出日志…")!.click());
    expect(container.textContent).toContain("已保存 scarlet-logs.zip");
    await act(async () => button("在文件夹中显示")!.click());
    expect(reveal).toHaveBeenCalledWith("C:\\Users\\tester\\Desktop\\scarlet-logs.zip");
    await act(async () => button("导出日志…")!.click());
    expect(container.textContent).toContain("Disk full");
    expect(exportLogs).toHaveBeenCalledTimes(3);
  } finally {
    await act(async () => root.unmount());
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
