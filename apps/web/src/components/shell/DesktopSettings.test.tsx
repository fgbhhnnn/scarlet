// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { desktop, type EngineStatus, type HostStatus } from "../../lib/desktop";
import { DesktopAgents, DesktopDiagnostics } from "./DesktopSettings";

it("counts restarts and running tasks in words, not with (s)", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  let engine: EngineStatus = { url: null, userId: null, state: "ready", error: null, dataDir: "/data", workDir: "/work", logDir: "/logs",
    engine: null, engineKind: "sidecar", pid: 10, restarts: 1, version: "1.0.0" };
  let host: HostStatus = { hostId: "local", agents: [], running: ["tsk_1"], connected: true, serverUrl: null, name: null, error: null, mcpCommand: null, configured: true };
  vi.spyOn(desktop, "onEngineStatus").mockResolvedValue(() => {});
  vi.spyOn(desktop, "engineStatus").mockImplementation(async () => engine);
  vi.spyOn(desktop, "onHostStatus").mockResolvedValue(() => {});
  vi.spyOn(desktop, "hostStatus").mockImplementation(async () => host);
  const container = document.createElement("div");
  /** Diagnostics as it reads once the shell has reported the engine and the host. */
  const shown = async () => {
    const root = createRoot(container);
    await act(async () => root.render(<DesktopDiagnostics />));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const text = container.textContent ?? "";
    await act(async () => root.unmount());
    return text;
  };
  try {
    const one = await shown();
    expect(one).toMatch(/进程 ID 10\s*已重启 1 次/);
    expect(one).toContain("正在运行 1 个任务：tsk_1");
    engine = { ...engine, restarts: 3 };
    host = { ...host, running: ["tsk_1", "tsk_2"] };
    const several = await shown();
    expect(several).toContain("已重启 3 次");
    expect(several).toContain("正在运行 2 个任务：tsk_1、tsk_2");
    expect(one + several).not.toContain("(s)");
  } finally {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("names Claude Code, Codex and Gemini in the sign-in card's sentence as its rows do, and signs in to all three with one verb", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  const host: HostStatus = { hostId: "local", running: [], connected: true, serverUrl: null, name: null, error: null, mcpCommand: null, configured: true, agents: [
    { id: "claude", installed: true, loggedIn: false }, { id: "codex", installed: true, loggedIn: false }, { id: "gemini", installed: true, loggedIn: false }] };
  vi.spyOn(desktop, "onEngineStatus").mockResolvedValue(() => {});
  vi.spyOn(desktop, "engineStatus").mockResolvedValue({ state: "ready" } as EngineStatus);
  vi.spyOn(desktop, "onHostStatus").mockResolvedValue(() => {});
  vi.spyOn(desktop, "hostStatus").mockResolvedValue(host);
  vi.spyOn(desktop, "onAgentLogin").mockResolvedValue(() => {});
  vi.spyOn(desktop, "agentLoginStatus").mockResolvedValue(null);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<DesktopAgents />));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(container.querySelector("h3")?.textContent).toBe("登录");
    expect(container.querySelector("p")?.textContent).toBe("选择 Claude Code、Codex 或 Gemini。安装后使用你的订阅账号登录。");
    expect([...container.querySelectorAll("li")].map(row => [row.querySelector("div > div")?.textContent, row.querySelector("button")?.textContent]))
      .toEqual([["Claude Code", "使用 Claude 登录"], ["Codex", "使用 ChatGPT 登录"], ["Gemini", "使用 Google 登录"]]);
    expect(container.textContent).not.toMatch(/assistant|\bAI\b|Connect/);
  } finally {
    await act(async () => root.unmount());
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
