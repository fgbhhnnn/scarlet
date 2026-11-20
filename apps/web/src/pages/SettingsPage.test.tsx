// @vitest-environment happy-dom
import { openOptions, selectOption } from "../../test/selectOption";
import type { ServerSettings } from "@scarlet/shared";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, createRoutesFromElements, Route, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../lib/client";
import { desktop } from "../lib/desktop";
import { buildDb } from "../lib/mock/fixtures";
import { useHostsStore } from "../stores/hosts";
import { useUiStore } from "../stores/ui";
import { SettingsPage } from "./SettingsPage";

const defaults = buildDb().settings;
const freshLocalSettings: ServerSettings = { ...defaults, transcription: { provider: "whispercpp", openaiModel: "whisper-1" } };
const settings = { ...defaults, transcription: { ...defaults.transcription, provider: "openai" as const } };

let el: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(api, "settings").mockResolvedValue({ settings, transcriptionAvailable: true });
  vi.spyOn(api, "localModelStatus").mockResolvedValue({ state: "ready" });
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
});
afterEach(async () => {
  await act(async () => root.unmount());
  el.remove();
  useUiStore.setState(useUiStore.getInitialState());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const open = (path = "/settings") => act(async () => root.render(<RouterProvider router={createMemoryRouter(createRoutesFromElements(<>
  <Route path="/settings" element={<SettingsPage />} /><Route path="/" element={<p>Project library</p>} />
</>), { initialEntries: [path] })} />));
// A key press goes to whatever has focus and bubbles from there.
const esc = () => act(async () => {
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
});
const heading = () => el.querySelector("h1")?.textContent;
const saveButton = () => el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const transcribeWith = () => el.querySelector<HTMLButtonElement>("#tr-provider")!;
// Advanced is the tab with a Save: its dropdowns wait for it, as its typed fields do.
const previewHeight = () => el.querySelector<HTMLButtonElement>("#rd-height")!;

it("saves the telemetry switch from About and links the filler-word model credit", async () => {
  const save = vi.spyOn(api, "updateSettings").mockImplementation(async patch => ({ settings: { ...settings, ...patch } }));
  const browse = vi.spyOn(desktop, "openUrl").mockResolvedValue();
  await open("/settings#about");
  const toggle = el.querySelector<HTMLButtonElement>('[role="switch"][aria-label="发送使用情况报告"]')!;
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  await act(async () => toggle.click());
  expect(save).toHaveBeenCalledExactlyOnceWith({ telemetryEnabled: false });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  const credit = el.querySelector<HTMLAnchorElement>('a[href="https://desertant.com"]')!;
  expect(credit.textContent).toBe("Desert Ant Labs 的 Uhm");
  await act(async () => credit.click());
  expect(browse).toHaveBeenCalledExactlyOnceWith("https://desertant.com");
});

it("shows reporting locked off by the environment even with a saved opt-in", async () => {
  vi.mocked(api.settings).mockResolvedValue({ settings, telemetryUnavailable: "environment" });
  await open("/settings#about");
  const toggle = el.querySelector<HTMLButtonElement>('[aria-label="发送使用情况报告"]')!;
  expect(toggle.disabled).toBe(true);
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(el.textContent).toContain("引擎环境已关闭使用情况报告。");
});

it("leaves Settings on Esc when nothing is unsaved", async () => {
  await open("/settings#advanced");
  expect(saveButton().disabled).toBe(true);
  await esc();
  expect(el.textContent).toBe("Project library");
});

it("keeps Settings open on Esc while a change is unsaved and moves focus to Save", async () => {
  await open("/settings#advanced");
  await selectOption(previewHeight(), "720p");
  expect(document.activeElement).toBe(previewHeight());
  await esc();
  expect(heading()).toBe("设置");
  expect(document.activeElement).toBe(saveButton());
  await esc();
  expect(heading()).toBe("设置");
  expect(document.activeElement).toBe(saveButton());
});

it("leaves on Esc again once the change is saved", async () => {
  let finish!: () => void;
  const save = vi.spyOn(api, "updateSettings").mockImplementation(patch => new Promise(resolve => {
    finish = () => resolve({ settings: { ...settings, ...patch } as typeof settings });
  }));
  await open("/settings#advanced");
  await selectOption(previewHeight(), "720p");
  await esc();
  await act(async () => saveButton().click());
  expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ render: expect.objectContaining({ previewHeight: 720 }) }));
  // The change isn't saved until the engine answers.
  await esc();
  expect(heading()).toBe("设置");
  await act(async () => finish());
  expect(saveButton().disabled).toBe(true);
  await esc();
  expect(el.textContent).toBe("Project library");
});

it("only blurs a changed text field on the first Esc and moves focus to Save on the next", async () => {
  await open("/settings#advanced");
  const language = el.querySelector<HTMLInputElement>("#tr-lang")!;
  await act(async () => {
    language.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(language, "fr");
    language.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(saveButton().disabled).toBe(false);
  await esc();
  expect(document.activeElement).toBe(document.body);
  await esc();
  expect(heading()).toBe("设置");
  expect(document.activeElement).toBe(saveButton());
});

it("leaves Esc to an open list, which closes without leaving Settings", async () => {
  await open();
  await act(async () => transcribeWith().click());
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  // Transcription can't be turned off: the list offers only the ways to run it.
  expect([...document.querySelectorAll('[role="option"]')].map(o => o.textContent))
    .toEqual(["CrisperWhisper 2.0（默认）", "Whisper large-v3-turbo（内置）", "自定义本地模型", "OpenAI Whisper（云端）"]);
  await esc();
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(heading()).toBe("设置");
  await esc();
  expect(el.textContent).toBe("Project library");
});

it("says who is signed in once on General, in the card, and has no default to pick that the selector would override", async () => {
  const save = vi.spyOn(api, "updateSettings").mockImplementation(async patch => ({ settings: { ...settings, ...patch } as typeof settings }));
  await open();
  // No menu over the card lists the same sign-ins again.
  expect(el.querySelector('[aria-haspopup="menu"]')).toBeNull();
  expect(el.querySelectorAll("#hosts")).toHaveLength(1);
  expect(el.querySelector(".settings-page")!.firstElementChild!.nextElementSibling!.id).toBe("hosts");
  // The model is picked in the selector, which a default here never changed once one was picked.
  expect(el.querySelector("form h2")?.textContent).toBe("语音转写");
  expect([...el.querySelectorAll<HTMLLabelElement>("form label")].map(label => [label.htmlFor, label.textContent])).toEqual([["tr-provider", "首选模型"]]);
  // The one choice left is saved as it is made, and nothing else goes with it.
  await selectOption(transcribeWith(), "CrisperWhisper 2.0（默认）");
  expect(save).toHaveBeenCalledExactlyOnceWith({ transcription: expect.objectContaining({ provider: "whispercpp", localModel: "crisperwhisper" }) });
});

it("picks how much Scarlet checks with the editor on General, saved as it is chosen", async () => {
  const save = vi.spyOn(api, "updateSettings").mockImplementation(async patch => ({ settings: { ...settings, ...patch } as typeof settings }));
  await open();
  const card = el.querySelector(".check-in-preferences")!;
  expect(card.querySelector("h2")?.textContent).toBe("剪点确认");
  expect(card.querySelector("label")?.textContent).toBe("请我确认");
  const pick = card.querySelector<HTMLElement>("#check-in")!;
  // Balanced until the editor says otherwise, and the line under it says what that step brings them.
  expect(pick.textContent).toBe("适中");
  expect(card.querySelector(".transcription-status")?.textContent).toBe("Scarlet 会从删去台词的剪点中，挑出约四分之一最可能需要调整的剪点请你确认。这些剪辑会先应用到视频，并保留在待审阅列表中，直到你确认保留。");
  expect((await openOptions(pick)).map(option => option.textContent)).toEqual(["较少", "适中", "较多"]);
  await act(async () => pick.click());
  await selectOption(pick, "较多");
  expect(save).toHaveBeenCalledExactlyOnceWith({ checkIn: "more" });
  expect(pick.textContent).toBe("较多");
  expect(card.querySelector(".transcription-status")?.textContent).toContain("Scarlet 会从删去台词的剪点中，挑出约一半最可能需要调整的剪点请你确认。");
});

const typeInto = (field: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
});

it("shows the settings once Retry gets through after a failed load", async () => {
  vi.spyOn(api, "settings").mockRejectedValueOnce(new Error("Engine unreachable"));
  await open("/settings#advanced");
  expect(el.textContent).toContain("无法加载服务器设置");
  expect(el.textContent).toContain("Engine unreachable");
  await act(async () => [...el.querySelectorAll("button")].find(b => b.textContent?.trim() === "重试")!.click());
  expect(el.textContent).not.toContain("无法加载服务器设置");
  expect(el.querySelector("#tr-lang")).not.toBeNull();
});

it("tells the engine to clear Language and the note cleanup Model when their fields are emptied", async () => {
  expect(settings).toMatchObject({ transcription: { language: "en" }, noteCleanup: { enabled: true, model: "claude-haiku-4-5" } });
  const save = vi.spyOn(api, "updateSettings").mockImplementation(async () => ({
    settings: { ...settings, transcription: { provider: "openai", openaiModel: "whisper-1" }, noteCleanup: { enabled: true, provider: "anthropic" } },
  }));
  await open("/settings#advanced");
  const language = el.querySelector<HTMLInputElement>("#tr-lang")!;
  const model = el.querySelector<HTMLInputElement>("#nc-model")!;
  expect([language.value, model.value]).toEqual(["en", "claude-haiku-4-5"]);
  await typeInto(language, "");
  await typeInto(model, "");
  await act(async () => saveButton().click());
  // What goes over the wire: JSON drops an undefined field, and the engine then keeps the value it had.
  const sent = JSON.parse(JSON.stringify(save.mock.calls[0]![0]));
  expect(sent).toMatchObject({ transcription: { provider: "openai", language: null }, noteCleanup: { enabled: true, model: null } });
  expect([language.value, model.value]).toEqual(["", ""]);
  expect(saveButton().disabled).toBe(true);
});

it("holds what is typed in a number field until Save, instead of refilling one that was emptied", async () => {
  const save = vi.spyOn(api, "updateSettings").mockImplementation(async patch => ({ settings: { ...settings, ...patch } }));
  await open("/settings#advanced");
  const concurrency = el.querySelector<HTMLInputElement>("#rd-conc")!;
  const handle = el.querySelector<HTMLInputElement>("#rd-handle")!;
  expect([concurrency.value, handle.value]).toEqual(["2", "1.5"]);
  // Emptied, the field stays empty for the next digit: it used to put 1 back at once, so typing 4 made 14.
  await typeInto(concurrency, "");
  expect(concurrency.value).toBe("");
  expect(saveButton().disabled).toBe(false);
  await typeInto(concurrency, "4");
  expect(concurrency.value).toBe("4");
  // A field left empty keeps the value it had.
  await typeInto(handle, "");
  expect(handle.value).toBe("");
  await act(async () => saveButton().click());
  expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ render: expect.objectContaining({ concurrency: 4, handleSeconds: 1.5 }) }));
  expect([concurrency.value, handle.value]).toEqual(["4", "1.5"]);
});

const press = (text: string) => act(async () => {
  [...document.querySelectorAll<HTMLElement>("a, button")].find(c => c.textContent?.trim() === text)!.click();
});
const asking = () => document.querySelector("dialog[open]")?.textContent ?? "";

it("asks before a tab or the back link drops an unsaved change", async () => {
  const save = vi.spyOn(api, "updateSettings").mockImplementation(async patch => ({ settings: { ...settings, ...patch } as typeof settings }));
  await open("/settings#advanced");
  expect(previewHeight().textContent).toContain("540p");
  await selectOption(previewHeight(), "720p");
  await press("关于");
  expect(asking()).toContain("当前设置有未保存的更改。");
  expect(el.querySelector('[aria-current="true"]')?.textContent).toBe("高级");
  // Stay keeps the change where it was.
  await press("留在此页");
  expect(asking()).toBe("");
  expect(previewHeight().textContent).toContain("720p");
  // Discard leaves without saving, and the old value is what comes back.
  await press("关于");
  await press("放弃更改");
  expect(el.querySelector('[aria-current="true"]')?.textContent).toBe("关于");
  expect(save).not.toHaveBeenCalled();
  await press("高级");
  expect(previewHeight().textContent).toContain("540p");
  // Save and leave saves first.
  await selectOption(previewHeight(), "720p");
  await press("← 项目");
  expect(asking()).toContain("当前设置有未保存的更改。");
  await press("保存并离开");
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ render: expect.objectContaining({ previewHeight: 720 }) }));
  expect(el.textContent).toBe("Project library");
});

it("holds Restart to update while a change is unsaved, as the skill editor does", async () => {
  vi.spyOn(api, "updateSettings").mockImplementation(async patch => ({ settings: { ...settings, ...patch } as typeof settings }));
  // Restart to update asks the page first, and restarts only if nothing cancels.
  const restartAllowed = () => window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
  await open("/settings#advanced");
  expect(restartAllowed()).toBe(true);
  await typeInto(el.querySelector<HTMLInputElement>("#rd-conc")!, "4");
  expect(restartAllowed()).toBe(false);
  await act(async () => saveButton().click());
  expect(saveButton().disabled).toBe(true);
  expect(restartAllowed()).toBe(true);
});

it("saves a General dropdown as it is chosen, with no Save to press", async () => {
  const save = vi.spyOn(api, "updateSettings").mockImplementation(async patch => ({ settings: { ...settings, ...patch } as typeof settings }));
  await open();
  expect(el.querySelector('button[type="submit"]')).toBeNull();
  await selectOption(transcribeWith(), "CrisperWhisper 2.0（默认）");
  expect(save).toHaveBeenCalledExactlyOnceWith({ transcription: expect.objectContaining({ provider: "whispercpp", localModel: "crisperwhisper" }) });
  expect(transcribeWith().textContent).toContain("CrisperWhisper");
  // Put back, it is saved again, and nothing is left to ask about on the way to another tab.
  await selectOption(transcribeWith(), "OpenAI Whisper（云端）");
  expect(save).toHaveBeenLastCalledWith({ transcription: expect.objectContaining({ provider: "openai" }) });
  await press("关于");
  expect(asking()).toBe("");
  expect(el.querySelector('[aria-current="true"]')?.textContent).toBe("关于");
});

it.each(["高级", "← 项目"])("waits for General to save before going to %s", async destination => {
  let finish!: () => void;
  const save = vi.spyOn(api, "updateSettings").mockImplementation(patch => new Promise(resolve => {
    finish = () => {
      const saved = { ...settings, ...patch };
      vi.mocked(api.settings).mockResolvedValue({ settings: saved, transcriptionAvailable: true });
      resolve({ settings: saved });
    };
  }));
  await open();
  await selectOption(transcribeWith(), "CrisperWhisper 2.0（默认）");
  expect(save).toHaveBeenCalledOnce();
  await press(destination);
  expect(el.querySelector('[aria-current="true"]')?.textContent).toBe("常规");
  expect(el.textContent).toContain("正在保存…");
  await act(async () => finish());
  expect(el.querySelector('[aria-current="true"]')?.textContent ?? el.textContent)
    .toBe(destination === "高级" ? destination : "Project library");
});

it("shows a General save error if the editor tried to change tabs during the save", async () => {
  let fail!: () => void;
  vi.spyOn(api, "updateSettings").mockImplementation(() => new Promise((_resolve, reject) => {
    fail = () => reject(new Error("Engine unreachable"));
  }));
  await open();
  await selectOption(transcribeWith(), "CrisperWhisper 2.0（默认）");
  await press("高级");
  await act(async () => fail());
  expect(el.querySelector('[aria-current="true"]')?.textContent).toBe("常规");
  expect(el.querySelector('form [role="alert"]')?.textContent).toBe("Engine unreachable");
  expect(transcribeWith().textContent).toContain("OpenAI Whisper");
  await press("高级");
  expect(el.querySelector('[aria-current="true"]')?.textContent).toBe("高级");
});

it("shows the bundled fallback for first-install CrisperWhisper and opens its pinned model files through the desktop", async () => {
  vi.mocked(api.settings).mockResolvedValue({ settings: freshLocalSettings, transcriptionAvailable: true });
  vi.mocked(api.localModelStatus).mockResolvedValue({ state: "ready", selected: "crisperwhisper", active: "whispercpp", fallback: true });
  const browse = vi.spyOn(desktop, "openUrl").mockResolvedValue();
  await open();
  expect(transcribeWith().textContent).toBe("CrisperWhisper 2.0（默认）");
  expect(el.querySelector('form [role="status"]')?.textContent).toContain("正在使用内置 Whisper");
  const guide = el.querySelector<HTMLDetailsElement>("form details")!;
  const summary = guide.querySelector("summary")!;
  expect(guide.open).toBe(false);
  expect(summary.textContent).toContain("设置 CrisperWhisper");
  const license = "商用需要单独授权。";
  expect(el.querySelector("form")?.textContent).toContain(license);
  expect([...guide.children].filter(child => child !== summary).some(child => child.textContent?.includes(license))).toBe(false);
  await act(async () => summary.click());
  expect(guide.open).toBe(true);
  expect(guide.textContent).toContain("Python 3.12");
  expect(guide.textContent).toContain("下载运行库");
  await press("CrisperWhisper 2.0 large 模型文件");
  expect(browse).toHaveBeenCalledWith("https://huggingface.co/nyralabs/CrisperWhisper2.0_large/tree/f4334f6e8193f2691212d49b20fa12d370e13896");
});

it("names the bundled Whisper fallback while its download is still in progress", async () => {
  vi.mocked(api.settings).mockResolvedValue({ settings: freshLocalSettings, transcriptionAvailable: true });
  vi.mocked(api.localModelStatus).mockResolvedValue({
    state: "downloading", selected: "crisperwhisper", active: "whispercpp", fallback: true, received: 35, total: 100,
  });
  await open();
  expect(transcribeWith().textContent).toContain("CrisperWhisper");
  const status = el.querySelector('form [role="status"]')?.textContent;
  expect(status).toMatch(/内置 Whisper/);
  expect(status).toMatch(/下载/);
  expect(status).toContain("35%");
  expect(status).not.toMatch(/正在使用内置 Whisper/);
});

it("shows where audio goes when switching between cloud, bundled and custom transcription", async () => {
  vi.spyOn(api, "updateSettings").mockImplementation(async patch => ({ settings: { ...settings, ...patch } }));
  await open();
  const form = el.querySelector("form")!;
  const cloud = "音频会发送至 OpenAI 进行转写。";
  const local = "音频保留在这台电脑上。";
  expect(form.textContent).toContain(cloud);
  expect(form.textContent).not.toContain(local);
  await selectOption(transcribeWith(), "Whisper large-v3-turbo（内置）");
  expect(form.textContent).toContain(local);
  expect(form.textContent).not.toContain(cloud);
  await selectOption(transcribeWith(), "自定义本地模型");
  expect(form.textContent).toContain("Scarlet 会将音频交给选定的本地运行程序。");
  expect(form.textContent).not.toContain(local);
});

const setupButton = (label: string) => [...el.querySelectorAll<HTMLButtonElement>("form details button")]
  .find(button => button.textContent?.trim() === label)!;

it("cancels the native folder picker without starting or saving an installation", async () => {
  vi.mocked(api.settings).mockResolvedValue({ settings: freshLocalSettings, transcriptionAvailable: true });
  const pick = vi.spyOn(desktop, "pickFolder").mockResolvedValue(null);
  const install = vi.spyOn(desktop, "installCrisperModel");
  const save = vi.spyOn(api, "updateSettings");
  await open();
  await act(async () => el.querySelector<HTMLElement>("form summary")!.click());
  await press("从文件夹安装…");
  expect(pick).toHaveBeenCalledExactlyOnceWith("选择 CrisperWhisper 模型文件夹");
  expect(install).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  expect(setupButton("从文件夹安装…").disabled).toBe(false);
});

it("can retry an installation error and keeps showing a pending install when General reopens", async () => {
  vi.mocked(api.settings).mockResolvedValue({ settings: freshLocalSettings, transcriptionAvailable: true });
  vi.mocked(api.localModelStatus).mockResolvedValue({ state: "ready", selected: "crisperwhisper", active: "whispercpp", fallback: true });
  const pick = vi.spyOn(desktop, "pickFolder").mockResolvedValueOnce("/models/partial").mockResolvedValueOnce("/models/complete checkpoint");
  const issue = "The model folder is missing tokenizer.json.";
  let finish!: () => void;
  const install = vi.spyOn(desktop, "installCrisperModel").mockRejectedValueOnce(issue).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await open();
  const expand = () => act(async () => el.querySelector<HTMLElement>("form summary")!.click());
  await expand();
  await press("从文件夹安装…");
  expect(el.querySelector("form details [role=alert]")?.textContent).toBe(issue);
  await press("重新选择安装文件夹…");
  expect(install.mock.calls).toEqual([["/models/partial"], ["/models/complete checkpoint"]]);
  expect(el.querySelector("form details [role=alert]")).toBeNull();
  await press("关于");
  await press("常规");
  await expand();
  const pending = setupButton("正在安装 CrisperWhisper…");
  expect(pending.disabled).toBe(true);
  await act(async () => pending.click());
  expect(pick).toHaveBeenCalledTimes(2);
  vi.mocked(api.localModelStatus).mockResolvedValue({ state: "ready", selected: "crisperwhisper", active: "crisperwhisper", fallback: false });
  await act(async () => finish());
  expect(el.querySelector('form [role="status"]')?.textContent).toBe("CrisperWhisper 已就绪。");
  expect(pending.disabled).toBe(false);
});

it("can turn on the local default from a previously disabled transcription provider", async () => {
  const disabled: ServerSettings = { ...defaults, transcription: { ...defaults.transcription, provider: "none" } };
  vi.mocked(api.settings).mockResolvedValue({ settings: disabled, transcriptionAvailable: false });
  const save = vi.spyOn(api, "updateSettings").mockImplementation(async patch => ({ settings: { ...disabled, ...patch } }));
  await open();
  expect(transcribeWith().textContent).toBe("转写不可用");
  await selectOption(transcribeWith(), "CrisperWhisper 2.0（默认）");
  expect(save).toHaveBeenCalledExactlyOnceWith({ transcription: expect.objectContaining({ provider: "whispercpp", localModel: "crisperwhisper" }) });
});

it("uses the engine's recognized preset for older paths and explains when there is no local runtime", async () => {
  const previous = { ...defaults, transcription: { ...defaults.transcription, whisperModelPath: "/data/preset/model.safetensors" } };
  vi.mocked(api.settings).mockResolvedValue({ settings: previous, transcriptionAvailable: true });
  const reason = "CrisperWhisper is not installed and the bundled Whisper runtime is unavailable.";
  vi.mocked(api.localModelStatus).mockResolvedValue({ state: "missing", selected: "crisperwhisper", fallback: false, reason });
  await open();
  expect(transcribeWith().textContent).toBe("CrisperWhisper 2.0（默认）");
  expect(el.querySelector('form [role="status"]')?.textContent).toBe(reason);
});

it("discovers existing custom paths, browses for replacements and saves them across local and cloud choices", async () => {
  const paths = { whisperModelPath: "/models/old.bin", whisperCppPath: "/adapters/old" };
  let current: ServerSettings = { ...defaults, transcription: { ...defaults.transcription, ...paths } };
  vi.mocked(api.settings).mockImplementation(async () => ({ settings: current, transcriptionAvailable: true }));
  const save = vi.spyOn(api, "updateSettings").mockImplementation(async patch => {
    current = { ...current, ...patch };
    return { settings: current };
  });
  const pick = vi.spyOn(desktop, "pickFile").mockResolvedValueOnce(null).mockResolvedValueOnce("/models/my model.bin").mockResolvedValueOnce("/adapters/my adapter");
  await open();
  expect(transcribeWith().textContent).toBe("自定义本地模型");
  await press("配置模型文件和适配器");
  const model = el.querySelector<HTMLInputElement>("#tr-modelpath")!;
  const adapter = el.querySelector<HTMLInputElement>("#tr-bin")!;
  expect([model.value, adapter.value]).toEqual([paths.whisperModelPath, paths.whisperCppPath]);
  const selectFile = (label: string) => act(async () => el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
  await selectFile("选择模型文件");
  expect(saveButton().disabled).toBe(true);
  await selectFile("选择模型文件");
  await selectFile("选择适配器程序");
  expect(pick.mock.calls).toEqual([["选择模型文件"], ["选择模型文件"], ["选择适配器程序"]]);
  expect(save).not.toHaveBeenCalled();
  await act(async () => saveButton().click());
  const replacement = { whisperModelPath: "/models/my model.bin", whisperCppPath: "/adapters/my adapter" };
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ transcription: expect.objectContaining({ ...replacement, localModel: "custom" }) }));
  await press("常规");
  await selectOption(transcribeWith(), "Whisper large-v3-turbo（内置）");
  expect(save).toHaveBeenLastCalledWith({ transcription: expect.objectContaining({ ...replacement, provider: "whispercpp", localModel: "whispercpp" }) });
  await selectOption(transcribeWith(), "OpenAI Whisper（云端）");
  expect(save).toHaveBeenLastCalledWith({ transcription: expect.objectContaining({ ...replacement, provider: "openai" }) });
  await selectOption(transcribeWith(), "自定义本地模型");
  await press("配置模型文件和适配器");
  expect(el.querySelector<HTMLInputElement>("#tr-modelpath")?.value).toBe(replacement.whisperModelPath);
  expect(el.querySelector<HTMLInputElement>("#tr-bin")?.value).toBe(replacement.whisperCppPath);
});

it("puts a General dropdown back and says why when its choice can't be saved", async () => {
  vi.spyOn(api, "updateSettings").mockRejectedValue(new Error("Engine unreachable"));
  await open();
  await selectOption(transcribeWith(), "CrisperWhisper 2.0（默认）");
  expect(transcribeWith().textContent).toContain("OpenAI Whisper");
  expect(el.querySelector('form [role="alert"]')?.textContent).toBe("Engine unreachable");
  // Esc still leaves: nothing here is waiting to be saved.
  await esc();
  expect(el.textContent).toBe("Project library");
});

it("counts a change that was put back as no change: Save goes dim and leaving doesn't ask", async () => {
  await open("/settings#advanced");
  const language = el.querySelector<HTMLInputElement>("#tr-lang")!;
  const concurrency = el.querySelector<HTMLInputElement>("#rd-conc")!;
  await typeInto(language, "fr");
  expect(saveButton().disabled).toBe(false);
  await typeInto(language, "en");
  expect(saveButton().disabled).toBe(true);
  // A dropdown, a switch and a number field the same.
  await selectOption(previewHeight(), "720p");
  await selectOption(previewHeight(), "540p");
  const cleanup = el.querySelector<HTMLButtonElement>('[aria-label="启用语音备注整理"]')!;
  await act(async () => cleanup.click());
  expect(saveButton().disabled).toBe(false);
  await act(async () => cleanup.click());
  await typeInto(concurrency, "4");
  expect(saveButton().disabled).toBe(false);
  await typeInto(concurrency, "2");
  expect(saveButton().disabled).toBe(true);
  await press("关于");
  expect(asking()).toBe("");
  expect(el.querySelector('[aria-current="true"]')?.textContent).toBe("关于");
});

it("leaves by a tab without asking when nothing is unsaved", async () => {
  await open();
  await press("关于");
  expect(asking()).toBe("");
  expect(el.querySelector('[aria-current="true"]')?.textContent).toBe("关于");
});

it("says on Models what is true signed in or not: no models until Claude Code or Codex is online", async () => {
  const hosts = useHostsStore.getState();
  const said = () => el.querySelector(".settings-page section.card p")?.textContent;
  try {
    // Signed in, on a computer that isn't connected just now. The sign-in card says signed in and the message box
    // says the model is offline, so Models doesn't say to sign in.
    const signedIn = buildDb().hosts[0]!;
    expect(signedIn.agents[0]).toMatchObject({ id: "claude", installed: true, loggedIn: true });
    useHostsStore.setState({ status: "ready", error: null, hosts: [{ ...signedIn, online: false }] });
    await open("/settings#models");
    expect(said()).toBe("Claude Code、Codex 或 Gemini 在线时会显示可用模型。 管理登录");
    // The same under the reason, when the list of computers couldn't be read.
    await act(async () => useHostsStore.setState({ status: "error", error: "Engine unreachable", hosts: [] }));
    expect(el.querySelector('[role="alert"]')?.textContent).toBe("Engine unreachable");
    expect(said()).toBe("Claude Code、Codex 或 Gemini 在线时会显示可用模型。 管理登录");
    // And with nobody signed in, where the link beside it is the way on.
    await act(async () => useHostsStore.setState({ status: "ready", error: null, hosts: [] }));
    expect(said()).toBe("Claude Code、Codex 或 Gemini 在线时会显示可用模型。 管理登录");
    expect(el.querySelector('.settings-page section.card p a')?.getAttribute("href")).toBe("/settings#hosts");
  } finally {
    await act(async () => useHostsStore.setState(hosts, true));
  }
});
