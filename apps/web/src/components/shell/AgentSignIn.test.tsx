// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentAvailability } from "@scarlet/shared";
import { desktop, type AgentLoginStatus, type HostStatus } from "../../lib/desktop";
import { AgentSignIn, authLabel, canSignIn, useLocalHost } from "./AgentSignIn";

let root: Root;
let container: HTMLDivElement;
/** What the desktop app reports about a sign-in, as the row hears it. */
let report: (status: AgentLoginStatus) => void;
const inDesktop = (on: boolean) => {
  if (on) (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  else delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  inDesktop(true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  report = () => {};
  vi.spyOn(desktop, "onAgentLogin").mockImplementation(async cb => { report = cb; return () => { report = () => {}; }; });
  vi.spyOn(desktop, "agentLoginStatus").mockResolvedValue(null);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  inDesktop(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const claude: AgentAvailability = { id: "claude", installed: true, loggedIn: false };
const show = (agent: AgentAvailability = claude, compact = false) => act(async () => root.render(<AgentSignIn agent={agent} compact={compact} />));
const button = (text: string) => [...container.querySelectorAll("button")].find(b => b.textContent?.trim() === text);
const click = (text: string) => act(async () => button(text)!.click());
const alert = () => container.querySelector('[role="alert"]')?.textContent;
const waiting = () => !!container.textContent?.includes("请在浏览器中完成登录…");

it("says what an agent is signed in with", () => {
  expect(authLabel({ id: "claude", installed: false })).toBe("未安装");
  expect(authLabel({ id: "claude", installed: true, loggedIn: false })).toBe("未登录");
  expect(authLabel({ id: "claude", installed: true, auth: "subscription", plan: "max" })).toBe("Max 订阅");
  expect(authLabel({ id: "codex", installed: true, auth: "subscription" })).toBe("订阅");
  expect(authLabel({ id: "claude", installed: true, auth: "api_key" })).toBe("API 密钥（按量付费）");
  expect(authLabel({ id: "gemini", installed: true })).toBe("已登录");
  expect([canSignIn("claude"), canSignIn("codex"), canSignIn("gemini")]).toEqual([true, true, true]);
});

it("offers installation and Google sign-in for Gemini", async () => {
  await show({ id: "gemini", installed: false });
  expect(button("安装 Gemini")).toBeDefined();
  const start = vi.spyOn(desktop, "agentLoginStart").mockResolvedValue({ agent: "gemini", state: "waiting", acceptsCode: true });
  await show({ id: "gemini", installed: true, loggedIn: false });
  expect(button("使用 Google 登录")?.title).toBe("使用你的 Google AI 订阅并打开浏览器");
  await click("使用 Google 登录");
  expect(start).toHaveBeenCalledWith("gemini");
  expect(waiting()).toBe(true);
});

it("starts the sign-in, waits on the browser, and goes back to the button when the app says it failed", async () => {
  const start = vi.spyOn(desktop, "agentLoginStart").mockResolvedValue({ agent: "claude", state: "waiting", acceptsCode: true });
  await show();
  expect(button("使用 Claude 登录")?.title).toBe("使用你的 Claude Pro 或 Max 订阅并打开浏览器");
  await click("使用 Claude 登录");
  expect(start).toHaveBeenCalledWith("claude");
  expect(waiting()).toBe(true);
  // Another agent's sign-in is not this row's.
  await act(async () => report({ agent: "codex", state: "failed", acceptsCode: false, message: "Not this one" }));
  expect(waiting()).toBe(true);
  // The page can be opened again once the app knows its address.
  const open = vi.spyOn(desktop, "openUrl").mockResolvedValue(undefined);
  expect(button("再次打开页面")).toBeUndefined();
  await act(async () => report({ agent: "claude", state: "waiting", acceptsCode: true, url: "https://example.test/sign-in" }));
  await click("再次打开页面");
  expect(open).toHaveBeenCalledWith("https://example.test/sign-in");
  await act(async () => report({ agent: "claude", state: "failed", acceptsCode: true, message: "The browser was closed." }));
  expect(waiting()).toBe(false);
  expect(alert()).toBe("The browser was closed.");
  expect(button("使用 Claude 登录")).toBeDefined();
  // A failure with nothing to say still says it failed.
  await act(async () => report({ agent: "claude", state: "failed", acceptsCode: true }));
  expect(alert()).toBe("登录失败");
});

it("says why a sign-in couldn't start, and clears that when the next one does", async () => {
  const start = vi.spyOn(desktop, "agentLoginStart").mockRejectedValueOnce(new Error("claude isn't on this computer's PATH"));
  await show();
  await click("使用 Claude 登录");
  expect(waiting()).toBe(false);
  expect(alert()).toBe("claude isn't on this computer's PATH");
  start.mockResolvedValue({ agent: "claude", state: "waiting", acceptsCode: true });
  await click("使用 Claude 登录");
  expect(waiting()).toBe(true);
  expect(alert()).toBeUndefined();
});

it("says why a sign-in failed in a menu too, on a row of its own after the button", async () => {
  vi.spyOn(desktop, "agentLoginStart").mockRejectedValueOnce(new Error("claude isn't on this computer's PATH")).mockResolvedValue({ agent: "claude", state: "waiting", acceptsCode: true });
  await show(claude, true);
  // One that couldn't start: the button is back, with the reason. Before, the press looked like it did nothing.
  await click("使用 Claude 登录");
  expect(waiting()).toBe(false);
  expect(alert()).toBe("claude isn't on this computer's PATH");
  // The reason isn't in a block with the button, which a long one widens until the name beside it gives way. It is the
  // menu row's next item, across the whole row, and breaks anywhere: a sign-in address has no spaces to break at.
  const reason = container.querySelector('[role="alert"]')!.parentElement!;
  expect([reason.parentElement, reason.previousElementSibling, reason.className]).toEqual([container, button("使用 Claude 登录"), "col-span-full min-w-0 wrap-anywhere"]);
  // One that started and then failed says so as well, and the next try clears it.
  await click("使用 Claude 登录");
  expect(alert()).toBeUndefined();
  await act(async () => report({ agent: "claude", state: "failed", acceptsCode: true, message: "The browser was closed." }));
  expect(alert()).toBe("The browser was closed.");
});

it("picks up a sign-in already under way when the row appears", async () => {
  vi.spyOn(desktop, "agentLoginStatus").mockResolvedValue({ agent: "claude", state: "waiting", acceptsCode: true });
  await show();
  expect(waiting()).toBe(true);
});

it("stops waiting when Cancel works, and when it doesn't: the row goes back to its button and says why", async () => {
  vi.spyOn(desktop, "agentLoginStart").mockResolvedValue({ agent: "claude", state: "waiting", acceptsCode: true });
  const cancel = vi.spyOn(desktop, "agentLoginCancel").mockImplementation(async agent => { report({ agent, state: "cancelled", acceptsCode: true }); });
  await show();
  await click("使用 Claude 登录");
  await click("取消");
  expect(cancel).toHaveBeenCalledWith("claude");
  expect(waiting()).toBe(false);
  expect(alert()).toBeUndefined();
  // The app can't be told to stop, so it reports nothing. The row doesn't go on waiting for a sign-in nobody is finishing.
  cancel.mockRejectedValue(new Error("The app isn't answering."));
  await click("使用 Claude 登录");
  expect(waiting()).toBe(true);
  await click("取消");
  expect(waiting()).toBe(false);
  expect(alert()).toBe("The app isn't answering.");
  expect(button("使用 Claude 登录")).toBeDefined();
});

it("takes a pasted code when the browser showed one, and says when the app refuses it", async () => {
  vi.spyOn(desktop, "agentLoginStart").mockResolvedValue({ agent: "claude", state: "waiting", acceptsCode: true });
  const send = vi.spyOn(desktop, "agentLoginCode").mockRejectedValueOnce(new Error("That code has expired.")).mockResolvedValue(undefined);
  await show();
  await click("使用 Claude 登录");
  expect(container.querySelector("input")).toBeNull();
  await click("浏览器显示了代码？");
  const field = container.querySelector("input")!;
  const submit = () => act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  // Nothing typed, nothing sent.
  expect(button("提交")?.disabled).toBe(true);
  await submit();
  expect(send).not.toHaveBeenCalled();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "pasted-test-code");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await submit();
  expect(send).toHaveBeenCalledWith("claude", "pasted-test-code");
  expect(alert()).toBe("That code has expired.");
  await submit();
  expect(alert()).toBeUndefined();
  // Starting over puts the code box away, empty.
  await act(async () => report({ agent: "claude", state: "cancelled", acceptsCode: true }));
  await click("使用 Claude 登录");
  expect(container.querySelector("input")).toBeNull();
});

it("offers what fits how the agent is signed in, and only the button in a menu", async () => {
  vi.spyOn(desktop, "agentLoginStart").mockResolvedValue({ agent: "claude", state: "waiting", acceptsCode: true });
  await show({ id: "claude", installed: true, auth: "subscription", plan: "max" });
  expect([...container.querySelectorAll("button")].map(b => b.textContent)).toEqual(["切换账号"]);
  await show({ id: "claude", installed: true, auth: "subscription" }, true);
  expect(container.textContent).toBe("");
  await show({ id: "claude", installed: true, auth: "api_key" });
  expect(button("改用我的订阅")).toBeDefined();
  await show({ id: "codex", installed: true, auth: "api_key" });
  expect(button("使用 ChatGPT 登录")?.title).toBe("使用你的 ChatGPT 订阅并打开浏览器");
  // Both sign in with the same verb.
  await show({ id: "codex", installed: true, loggedIn: false });
  expect([...container.querySelectorAll("button")].map(b => b.textContent)).toEqual(["使用 ChatGPT 登录"]);
  // In a menu the wait is the line and Cancel: no link to the page, no code box.
  await show(claude, true);
  await click("使用 Claude 登录");
  await act(async () => report({ agent: "claude", state: "waiting", acceptsCode: true, url: "https://example.test/sign-in" }));
  expect([...container.querySelectorAll("button")].map(b => b.textContent?.trim())).toEqual(["取消"]);
});

it("offers to install a missing agent in the app, and says what else is needed", async () => {
  const install = vi.spyOn(desktop, "agentInstall").mockResolvedValueOnce("needsNode").mockRejectedValueOnce(new Error("The download stopped.")).mockResolvedValue("installed");
  await show({ id: "codex", installed: false }, true);
  expect(container.textContent).toBe("");
  await show({ id: "codex", installed: false });
  await click("安装 Codex");
  expect(install).toHaveBeenCalledWith("codex");
  expect(container.textContent).toContain("请安装 Node.js LTS，然后返回此处完成设置。");
  const open = vi.spyOn(desktop, "openUrl").mockRejectedValue(new Error("only https links can be opened"));
  await click("获取 Node.js");
  expect(open).toHaveBeenCalledWith("https://nodejs.org/en/download");
  expect(alert()).toBe("only https links can be opened");
  await click("安装 Codex");
  expect(alert()).toBe("The download stopped.");
  await click("安装 Codex");
  expect(alert()).toBeUndefined();
  expect(container.textContent).not.toContain("请安装 Node.js");
});

it("names the terminal command outside the desktop app, where the app can't run the sign-in", async () => {
  inDesktop(false);
  await show();
  expect(container.textContent).toBe("在该电脑上运行 npx scarlet-agent auth claude");
  expect(container.querySelector("button")).toBeNull();
  await show({ id: "claude", installed: true, auth: "api_key" });
  expect(container.textContent).toContain("npx scarlet-agent auth claude");
  // Signed in with a subscription, not installed, or in a menu: nothing to say.
  await show({ id: "claude", installed: true, auth: "subscription" });
  expect(container.textContent).toBe("");
  await show({ id: "claude", installed: false });
  expect(container.textContent).toBe("");
  await show(claude, true);
  expect(container.textContent).toBe("");
});

it("follows this app's own agent host: what it last reported, then each report after", async () => {
  const host = (name: string): HostStatus => ({ hostId: "local", agents: [], running: [], connected: true, serverUrl: null, name, error: null, mcpCommand: null, configured: true });
  let tell: (status: HostStatus) => void = () => {};
  const stopped = vi.fn();
  vi.spyOn(desktop, "onHostStatus").mockImplementation(async cb => { tell = cb; return stopped; });
  vi.spyOn(desktop, "hostStatus").mockResolvedValue(host("as it stood"));
  function Host() { return <p>{useLocalHost()?.name ?? "none"}</p>; }
  await act(async () => root.render(<Host />));
  expect(container.textContent).toBe("as it stood");
  await act(async () => tell(host("as it is now")));
  expect(container.textContent).toBe("as it is now");
  await act(async () => root.render(<p />));
  expect(stopped).toHaveBeenCalledTimes(1);
  // Outside the desktop app there is no host of its own to follow.
  inDesktop(false);
  await act(async () => root.render(<Host />));
  expect(container.textContent).toBe("none");
});
