// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Skill } from "@scarlet/shared";
import { buildDb } from "../lib/mock/fixtures";
import { useSkillsStore } from "../stores/skills";
import { SkillsPage } from "./SkillsPage";

const fixture = buildDb().skills[0]!;
const initial = useSkillsStore.getState();
let root: Root;
let container: HTMLDivElement;

const skill = (name: string, over: Partial<Skill> = {}, category?: string): Skill => ({ ...fixture, id: `skl_${name}`, name, description: `What ${name} does`,
  enabled: true, source: undefined, content: `---\nname: ${name}\n${category ? `category: ${category}\n` : ""}---\nSteps.`, ...over });

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useSkillsStore.setState(initial, true);
  vi.unstubAllGlobals();
});

const show = () => act(async () => root.render(<MemoryRouter><SkillsPage /></MemoryRouter>));
const sections = () => [...container.querySelectorAll("section section")].map(s => [s.getAttribute("aria-label"), [...s.querySelectorAll(".skill-row a .font-mono")].map(n => n.textContent)]);

it("loads the skills once, says so while it does, and offers Retry when they can't be read", async () => {
  const load = vi.fn();
  useSkillsStore.setState({ skills: [], status: "idle", error: null, load });
  await show();
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => useSkillsStore.setState({ status: "loading" }));
  expect(container.textContent).toContain("正在加载技能…");
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => useSkillsStore.setState({ status: "error", error: "The engine isn’t answering." }));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("The engine isn’t answering.");
  await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "重试")!.click());
  expect(load).toHaveBeenCalledTimes(2);
  // Skills already on screen stay there through a reload that fails.
  await act(async () => useSkillsStore.setState({ skills: [skill("tighten-pauses")] }));
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("tighten-pauses");
});

it("groups skills by the category they name, in the app's order, by name within each, with the rest last", async () => {
  useSkillsStore.setState({ status: "ready", error: null, load: vi.fn(), skills: [
    skill("zoom-in", {}, "Picture and graphics"), skill("clean-audio", { enabled: false, description: "" }, "Sound"), skill("balance-voices", {}, "Sound"),
    skill("house-style", { source: "change:chg_1" }), skill("first-cut", {}, "Getting started"), skill("my-own", {}, "Mine"),
    skill("preset", {}, "constructor")] });
  await show();
  // Empty categories aren't drawn. One the app doesn't know comes after its own, and a skill with none is under Other.
  expect(sections()).toEqual([["入门", ["first-cut"]], ["声音", ["balance-voices", "clean-audio"]], ["画面与图形", ["zoom-in"]],
    ["其他技能", ["house-style"]], ["Mine", ["my-own"]], ["constructor", ["preset"]]]);
  const row = (name: string) => container.querySelector(`a[href="/settings/skills/skl_${name}"]`)!.closest("li")!;
  expect(row("clean-audio").textContent).toContain("暂无说明");
  expect(row("clean-audio").querySelector('[role="switch"]')?.getAttribute("aria-label")).toBe("启用 clean-audio");
  expect(row("house-style").textContent).toContain("来自已应用的剪辑");
  expect(row("zoom-in").textContent).not.toContain("来自已应用的剪辑");
});

it("says which skill couldn't be turned on or off and why, until the next switch is tried", async () => {
  const update = vi.fn().mockRejectedValueOnce(new Error("The skill file is read-only.")).mockResolvedValue(skill("zoom-in"));
  useSkillsStore.setState({ status: "ready", error: null, load: vi.fn(), update, skills: [skill("zoom-in"), skill("clean-audio", { enabled: false })] });
  await show();
  const toggle = (label: string) => act(async () => container.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${label}"]`)!.click());
  await toggle("停用 zoom-in");
  expect(update).toHaveBeenCalledWith("skl_zoom-in", { enabled: false });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("zoom-in: The skill file is read-only.");
  await toggle("启用 clean-audio");
  expect(update).toHaveBeenLastCalledWith("skl_clean-audio", { enabled: true });
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("says no skills match a search that finds none, by name or by what the skill does", async () => {
  useSkillsStore.setState({ status: "ready", error: null, load: vi.fn(), skills: [skill("zoom-in", { description: "Punch in on the speaker" }), skill("clean-audio")] });
  await show();
  const field = container.querySelector<HTMLInputElement>('[aria-label="搜索技能"]')!;
  expect(field.placeholder).toBe("搜索技能…");
  expect(container.querySelector('section[aria-label="技能"] h3')?.textContent).toBe("剪辑技能");
  expect(container.querySelector('a[href="/settings/skills/new"]')?.textContent?.trim()).toBe("新建技能");
  const search = (text: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await search("SPEAKER");
  expect(sections().flatMap(([, names]) => names)).toEqual(["zoom-in"]);
  await search("colour");
  expect(sections()).toEqual([]);
  expect(container.textContent).toContain("没有匹配的技能");
});
