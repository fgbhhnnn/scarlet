// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { desktop } from "../../lib/desktop";
import { publishedUpdate, type ReleaseChannel } from "../../lib/publishedUpdate";
import { ReleaseUpdateNotice } from "./ReleaseUpdateNotice";
import { UpdateSettings } from "./UpdateSettings";

function release(version: string, channel: ReleaseChannel = "stable") {
  const suffix = { stable: "", "early-access": "-early-access.1", "linux-preview": "-linux-preview.1" }[channel];
  const prefix = channel === "early-access" ? "Scarlet-Early-Access-" : "Scarlet-";
  const files = channel === "linux-preview" ? ["Ubuntu-24.04-amd64.deb"]
    : ["macOS-Apple-Silicon.dmg", "macOS-Intel.dmg", "Windows-x64-Setup.exe", "Windows-x64.msi"];
  return { tag_name: "v" + version + suffix, draft: false, prerelease: !!suffix,
    assets: files.map(file => ({ name: prefix + version + "-" + file, state: "uploaded", size: 1024 })) };
}

const fetchRelease = vi.fn<typeof fetch>();
let root: Root, element: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchRelease.mockReset());
  element = document.createElement("div");
  root = createRoot(element);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("only offers a newer stable version with all its published installers", async () => {
  const current = "0.1.99";
  const next = release("0.1.100");
  for (const candidate of [release(current), release("0.1.9"), { ...next, draft: true }, { ...next, prerelease: true },
    { ...next, tag_name: "v0.1.100-rc.1" }, { ...next, assets: next.assets.slice(1) },
    { ...next, assets: next.assets.map(a => ({ ...a, size: 0 })) }]) {
    fetchRelease.mockResolvedValueOnce(Response.json(candidate));
    expect(await publishedUpdate("stable", current)).toBeNull();
  }
  fetchRelease.mockResolvedValueOnce(Response.json(next));
  expect(await publishedUpdate("stable", current)).toEqual({ version: "0.1.100", url: "https://github.com/Forward-Future/scarlet/releases/tag/v0.1.100" });
  expect(fetchRelease.mock.lastCall?.[0]).toBe("https://api.github.com/repos/Forward-Future/scarlet/releases/latest");
});

it.each(["early-access", "linux-preview"] as const)("keeps %s on its own feed and checks all pages", async channel => {
  const other = channel === "early-access" ? "linux-preview" : "early-access";
  fetchRelease.mockResolvedValueOnce(Response.json(Array(100).fill(release("2.3.4", other))))
    .mockResolvedValueOnce(Response.json([release("1.0.9", channel), release("1.0.12", channel), release("2.3.4")]));
  const result = await publishedUpdate(channel, "1.0.8");
  expect(result?.version).toBe("1.0.12");
  expect(result?.url).toBe("https://github.com/Forward-Future/scarlet-releases/releases/tag/v1.0.12-" + channel + ".1");
  expect(fetchRelease.mock.lastCall?.[0]).toBe("https://api.github.com/repos/Forward-Future/scarlet-releases/releases?per_page=100&page=2");
});

it("automatically retries after going online and discovers a release while the editor stays open", async () => {
  vi.useFakeTimers();
  fetchRelease.mockRejectedValueOnce(new TypeError("offline"))
    .mockResolvedValueOnce(Response.json(release(__SCARLET_VERSION__)))
    .mockResolvedValueOnce(Response.json(release("9.1.100")));
  const open = vi.spyOn(desktop, "openUrl").mockResolvedValue();
  await act(async () => root.render(<ReleaseUpdateNotice channel="stable" />));
  expect(element.textContent).toBe("");
  await act(async () => { window.dispatchEvent(new Event("online")); });
  expect(element.textContent).toBe("");
  await act(async () => { await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000); });
  expect(element.textContent).toContain("获取 Scarlet 9.1.100");
  expect(open).not.toHaveBeenCalled();
  await act(async () => element.querySelector("button")!.click());
  expect(open).toHaveBeenCalledExactlyOnceWith("https://github.com/Forward-Future/scarlet/releases/tag/v9.1.100");
});

it("checks the published edition from About and offers the same release as the notification", async () => {
  vi.stubGlobal("__SCARLET_RELEASE_CHANNEL__", "stable");
  fetchRelease.mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json(release("9.0.1")));
  const git = vi.spyOn(desktop, "latestUpdateRevision");
  const open = vi.spyOn(desktop, "openUrl").mockResolvedValue();
  await act(async () => root.render(<UpdateSettings />));
  const check = element.querySelector("button")!;
  await act(async () => check.click());
  expect(element.textContent).toContain("Couldn’t check Scarlet releases");
  await act(async () => check.click());
  expect(element.textContent).toContain("Scarlet 9.0.1 已发布。");
  await act(async () => element.querySelectorAll("button")[1]!.click());
  expect(open).toHaveBeenCalledExactlyOnceWith("https://github.com/Forward-Future/scarlet/releases/tag/v9.0.1");
  expect(git).not.toHaveBeenCalled();
});
