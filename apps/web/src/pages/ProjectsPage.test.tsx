// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { expect, it, vi } from "vitest";
import * as client from "../lib/client";
import { api } from "../lib/client";
import { desktop } from "../lib/desktop";
import { dropTargets } from "../lib/dropTargets";
import { pendingImports } from "../lib/pendingImports";
import * as upload from "../lib/upload";
import { createProject } from "@scarlet/timeline";
import type { ProjectSummary } from "@scarlet/shared";
import { buildDb, PRJ } from "../lib/mock/fixtures";
import { useProjectStore } from "../stores/project";
import { useUiStore } from "../stores/ui";
import { ImportUrlModal, ProjectsPage } from "./ProjectsPage";
import { UploadList, useUploader } from "../components/media/UploadDropzone";

it.each(["empty", "populated"])("can start a project from the %s library guide and creates it only on submit", async (library) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const previous = useProjectStore.getState();
  const previousUi = useUiStore.getState();
  const db = buildDb();
  const create = vi.fn().mockResolvedValue(db.projects.find(p => p.id === PRJ)!);
  const projects = library === "empty" ? [] : [{ ...db.summaries[PRJ]!, poster: null }];
  vi.spyOn(api, "projects").mockResolvedValue({ projects });
  useProjectStore.setState({ list: projects, listStatus: "ready", createProject: create });
  vi.spyOn(api, "trash").mockResolvedValue({ projects: [] });
  vi.spyOn(api, "settings").mockResolvedValue({ settings: db.settings });
  const picker = vi.spyOn(HTMLInputElement.prototype, "click");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const button = (text: string, within: ParentNode = container) => [...within.querySelectorAll("button")].find(b => b.textContent?.trim() === text)!;
  try {
    await act(async () => root.render(<MemoryRouter><Routes>
      <Route path="/" element={<ProjectsPage />} /><Route path="/p/:id" element={<p>Project workspace</p>} />
    </Routes></MemoryRouter>));
    expect(container.querySelector(".library-first-edit") !== null).toBe(library === "empty");
    expect(container.querySelector(".first-edit-steps")).toBeNull();
    await act(() => button("快速开始").click());
    const guide = container.querySelector("dialog[open]")!;
    expect(guide.querySelector("h2")?.textContent).toBe("快速开始");
    expect([...guide.querySelectorAll("li h3")].map(el => el.textContent)).toEqual(["添加素材", "提出剪辑要求", "播放成片"]);
    const skills = guide.querySelector("details")!;
    expect(skills.open).toBe(false);
    expect(skills.querySelector("summary")?.textContent?.trim()).toBe("教 Scarlet 了解你的剪辑风格");
    await act(() => skills.querySelector("summary")!.click());
    expect(skills.open).toBe(true);
    expect(guide.textContent).toMatch(/创建技能.*更多 → 学习.*批准/);
    await act(() => button("新建项目", guide).click());
    expect(container.querySelectorAll("dialog[open]")).toHaveLength(1);
    const name = container.querySelector<HTMLInputElement>("#np-name")!;
    expect(document.activeElement).toBe(name);
    expect(picker).not.toHaveBeenCalled();
    expect(button("创建项目").disabled).toBe(true);
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Interview");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(container.querySelector("#np-file-types")?.textContent).toMatch(/MP4.*WAV.*JPEG/);
    await act(() => button("选择文件…").click());
    expect(picker.mock.instances).toEqual([input]);
    const files = new DataTransfer();
    files.items.add(new File(["video"], "take-one.mov"));
    await act(() => {
      input.files = files.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(() => button("添加文件…").click());
    await act(() => { input.dispatchEvent(new Event("cancel", { bubbles: true })); });
    expect(name.value).toBe("Interview");
    expect(container.querySelector('[aria-label="已选文件"]')?.textContent).toBe("take-one.mov");
    expect(create).not.toHaveBeenCalled();
    expect(container.querySelector("dialog")?.textContent).not.toMatch(/optional|Clear|format will match|on this computer/);
    await act(() => container.querySelector<HTMLButtonElement>('[aria-label="移除 take-one.mov"]')!.click());
    await act(async () => button("创建项目").click());
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: "Interview" });
    expect(container.textContent).toContain("Project workspace");
    expect(useUiStore.getState().firstEditHint).toBe(library === "empty" ? PRJ : null);
  } finally {
    await act(() => root.unmount());
    container.remove();
    useProjectStore.setState(previous, true);
    useUiStore.setState(previousUi, true);
    localStorage.removeItem("scarlet.firstEditHint");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("offers New project in an empty library, names the project for the first video chosen, and takes videos dropped on the dialog", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const previous = useProjectStore.getState();
  const db = buildDb();
  useProjectStore.setState({ list: [], listStatus: "ready", createProject: vi.fn(), loadList: vi.fn() });
  vi.spyOn(api, "trash").mockResolvedValue({ projects: [] });
  vi.spyOn(api, "settings").mockResolvedValue({ settings: db.settings });
  vi.spyOn(client, "IS_DESKTOP", "get").mockReturnValue(true);
  const picked = vi.spyOn(desktop, "pickFiles").mockResolvedValue(["/clips/Sam interview.mov", "/clips/b-roll.mov"]);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const buttons = (text: string) => [...container.querySelectorAll("button")].filter(b => b.textContent?.trim() === text);
  const chosen = () => [...container.querySelectorAll('[aria-label="已选文件"] li')].map(li => li.textContent);
  try {
    await act(async () => root.render(<MemoryRouter><ProjectsPage /></MemoryRouter>));
    const welcome = container.querySelector(".library-first-edit")!;
    expect(welcome.textContent).toContain("把素材拖到这里");
    expect(buttons("新建项目")).toEqual([welcome.querySelector(".btn-primary")]);
    await act(() => buttons("新建项目")[0]!.click());
    const name = container.querySelector<HTMLInputElement>("#np-name")!;
    expect(buttons("创建项目")[0]!.disabled).toBe(true);
    // Choosing videos with no name typed names the project for the first, as dropping them on the library does.
    await act(async () => buttons("选择文件…")[0]!.click());
    expect(name.value).toBe("Sam interview");
    expect(buttons("创建并导入")[0]!.disabled).toBe(false);
    // Videos are added one pick at a time: each pick joins the list, once each.
    picked.mockResolvedValue(["/clips/Dana interview.mov", "/clips/b-roll.mov"]);
    await act(async () => buttons("添加文件…")[0]!.click());
    expect(chosen()).toEqual(["Sam interview.mov", "b-roll.mov", "Dana interview.mov"]);
    expect(name.value).toBe("Sam interview");
    // Each video has its own ×. Until the editor names it, the project follows the first video left.
    await act(() => container.querySelector<HTMLButtonElement>('[aria-label="移除 Sam interview.mov"]')!.click());
    expect(chosen()).toEqual(["b-roll.mov", "Dana interview.mov"]);
    expect(name.value).toBe("b-roll");
    // A name the editor typed is theirs: changing the videos leaves it.
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Episode 12");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(() => buttons("清除")[0]!.click());
    picked.mockResolvedValue(["/clips/wide.mov"]);
    await act(async () => buttons("选择文件…")[0]!.click());
    expect(name.value).toBe("Episode 12");
    expect(chosen()).toEqual(["wide.mov"]);
    // Videos dropped on the dialog join the ones chosen, once each.
    const zone = container.querySelector("dialog [data-file-drop]")!;
    await act(() => dropTargets.get(zone)!.drop(["/clips/cutaway.mov", "/clips/wide.mov"]));
    expect(chosen()).toEqual(["wide.mov", "cutaway.mov"]);
    expect(name.value).toBe("Episode 12");
  } finally {
    await act(() => root.unmount());
    container.remove();
    useProjectStore.setState(previous, true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("creates a named project from a drop, handles a bad file, and matches the first successfully probed video", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const previous = useProjectStore.getState();
  const db = buildDb();
  const project = db.projects.find(p => p.id === PRJ)!;
  const create = vi.fn().mockResolvedValue(project);
  useProjectStore.setState({ list: [], listStatus: "ready", createProject: create, loadList: vi.fn() });
  vi.spyOn(api, "trash").mockResolvedValue({ projects: [] });
  vi.spyOn(api, "settings").mockResolvedValue({ settings: { ...db.settings, transcription: { ...db.settings.transcription, provider: "openai" } }, transcriptionAvailable: true });
  const format = vi.spyOn(api, "updateProject").mockResolvedValue({ project });
  const video = { ...db.media[PRJ]!.find(m => m.kind === "video")!, width: 720, height: 1280, fps: 24 };
  let finishImport!: (media: typeof video) => void;
  const transfer = vi.spyOn(upload, "uploadMedia").mockImplementation((_id, file) => ({
    promise: file.name === "bad.mov" ? Promise.reject(new Error("Unreadable")) : new Promise(resolve => { finishImport = resolve; }),
    abort: vi.fn(),
  }));
  function Workspace() {
    const { items, dismiss } = useUploader(PRJ);
    const { search } = useLocation();
    return <><p>Project workspace{search}</p><UploadList items={items} onDismiss={dismiss} /></>;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><Routes>
      <Route path="/" element={<ProjectsPage />} /><Route path="/p/:id" element={<Workspace />} />
    </Routes></MemoryRouter>));
    expect(container.textContent).toContain("开始第一次剪辑");
    expect(container.textContent).not.toContain("发送到 OpenAI");
    const files = new DataTransfer();
    files.items.add(new File(["x"], "bad.mov"));
    files.items.add(new File(["y"], "portrait.mp4"));
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: files });
    await act(() => { container.querySelector("main")!.dispatchEvent(drop); });
    const name = container.querySelector<HTMLInputElement>("#np-name")!;
    expect(name.value).toBe("bad");
    expect(container.querySelector("dialog")?.textContent).toContain("发送到 OpenAI");
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "First interview");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(create).not.toHaveBeenCalled();
    await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent?.includes("创建并导入"))!.click());
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: "First interview" });
    expect(transfer).toHaveBeenCalledTimes(2);
    expect(format).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Project workspace?panel=media");
    expect(container.textContent).toContain("Unreadable");
    await act(async () => finishImport(video));
    expect(format).toHaveBeenCalledExactlyOnceWith(PRJ, { settings: { width: 720, height: 1280, fps: 24, aspect: "9:16" }, expectedFormat: { settings: project.settings, head: project.head } });
    await act(() => container.querySelectorAll<HTMLButtonElement>('[aria-label="关闭"]').forEach(button => button.click()));
  } finally {
    await act(() => root.unmount());
    container.remove();
    useProjectStore.setState(previous, true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("remembers a new project's chosen files as the ones that set its format, until the first video has", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const previous = useProjectStore.getState();
  const db = buildDb();
  const project = db.projects.find(p => p.id === PRJ)!;
  useProjectStore.setState({ list: [], listStatus: "ready", createProject: vi.fn().mockResolvedValue(project), loadList: vi.fn() });
  vi.spyOn(api, "trash").mockResolvedValue({ projects: [] });
  vi.spyOn(api, "settings").mockResolvedValue({ settings: db.settings });
  vi.spyOn(client, "IS_DESKTOP", "get").mockReturnValue(true);
  vi.spyOn(desktop, "pickFiles").mockResolvedValue(["/clips/take-one.mov", "/clips/take-two.mov"]);
  const format = vi.spyOn(api, "updateProject").mockResolvedValue({ project });
  const video = { ...db.media[PRJ]!.find(m => m.kind === "video")!, width: 720, height: 1280, fps: 24 };
  const finish: (() => void)[] = [];
  const imports = vi.spyOn(api, "importMedia").mockImplementation(() => new Promise(resolve => { finish.push(() => resolve({ media: video })); }));
  // What a quit at this moment would leave saved for the next launch.
  const saved = () => pendingImports(PRJ).map(i => [i.source, !!i.setsFormat]);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const button = (text: string) => [...container.querySelectorAll("button")].find(b => b.textContent?.trim() === text)!;
  try {
    await act(async () => root.render(<MemoryRouter><Routes>
      <Route path="/" element={<ProjectsPage />} /><Route path="/p/:id" element={<p>Project workspace</p>} />
    </Routes></MemoryRouter>));
    await act(() => button("新建项目").click());
    const name = container.querySelector<HTMLInputElement>("#np-name")!;
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Interview");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("选择文件…").click());
    await act(async () => button("创建并导入").click());
    expect(container.textContent).toContain("Project workspace");
    expect(imports.mock.calls.map(call => call[1].path)).toEqual(["/clips/take-one.mov"]);
    expect(saved()).toEqual([["/clips/take-one.mov", true], ["/clips/take-two.mov", true]]);
    await act(async () => {
      finish[0]!();
      await vi.waitFor(() => expect(finish).toHaveLength(2));
    });
    expect(format).toHaveBeenCalledExactlyOnceWith(PRJ, { settings: { width: 720, height: 1280, fps: 24, aspect: "9:16" }, expectedFormat: { settings: project.settings, head: project.head } });
    expect(saved()).toEqual([["/clips/take-two.mov", false]]);
    await act(async () => {
      finish[1]!();
      await vi.waitFor(() => expect(saved()).toEqual([]));
    });
    expect(format).toHaveBeenCalledTimes(1);
  } finally {
    await act(() => root.unmount());
    container.remove();
    localStorage.removeItem("scarlet.imports.v1");
    useProjectStore.setState(previous, true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("manages a project from either library layout", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const previous = useProjectStore.getState();
  const db = buildDb();
  const project = db.projects.find(p => p.id === PRJ)!;
  const summary = { ...db.summaries[PRJ]!, name: "Interview", poster: null };
  vi.spyOn(api, "projects").mockResolvedValue({ projects: [summary] });
  useProjectStore.setState({ list: [summary], listStatus: "ready", current: null });
  vi.spyOn(api, "settings").mockResolvedValue({ settings: db.settings });
  const trash = vi.spyOn(api, "trash").mockResolvedValue({ projects: [] });
  const update = vi.spyOn(api, "updateProject").mockImplementation(async (_id, patch) => ({
    project: { ...project, name: summary.name, ...patch },
  }));
  const remove = vi.spyOn(api, "deleteProject").mockResolvedValue({});
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const tap = (button: Element | null | undefined) => act(async () => {
    expect(button).toBeTruthy();
    (button as HTMLButtonElement).click();
  });
  const textButton = (text: string) => [...container.querySelectorAll("button")].find(b => b.textContent?.trim() === text);
  const actions = () => tap(container.querySelector('[aria-label="Interview的操作"]'));
  try {
    await act(async () => root.render(<MemoryRouter><ProjectsPage /></MemoryRouter>));
    expect(container.querySelector(".library-count")).toBeNull();
    // Idle project has no media work running, so Pause is omitted.
    await actions();
    expect(textButton("暂停")).toBeUndefined();
    expect(textButton("恢复")).toBeUndefined();
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    // Once media processing is active, Pause appears and switches to Resume while paused.
    await act(async () => useProjectStore.setState({ list: [{ ...summary, activity: [{ kind: "caching", fraction: 0.4 }] }] }));
    await actions();
    expect(textButton("暂停")?.title).toBe("暂停媒体处理");
    await tap(textButton("暂停"));
    expect(update).toHaveBeenLastCalledWith(PRJ, { mediaPaused: true });
    expect(useProjectStore.getState().list[0]?.mediaPaused).toBe(true);
    await tap(container.querySelector('[aria-label="网格视图"]'));
    await actions();
    expect(textButton("恢复")?.title).toBe("恢复媒体处理");
    await tap(textButton("恢复"));
    expect(update).toHaveBeenLastCalledWith(PRJ, { mediaPaused: false });
    await actions(); await tap(textButton("归档"));
    expect(update).toHaveBeenLastCalledWith(PRJ, { archived: true });
    expect(container.querySelector(".project-link")).toBeNull();
    await tap(textButton("已归档"));
    await tap(container.querySelector('[aria-label="列表视图"]'));
    await actions(); await tap(textButton("取消归档"));
    await tap(textButton("进行中"));
    await actions(); await tap(textButton("重命名"));
    expect(container.querySelector<HTMLInputElement>('dialog input')?.value).toBe("Interview");
    await tap(textButton("取消"));
    await actions(); await tap(textButton("移到废纸篓"));
    expect(remove).not.toHaveBeenCalled();
    trash.mockResolvedValue({ projects: [{ id: PRJ, name: summary.name, deletedAt: new Date().toISOString(), purgeAt: new Date().toISOString() }] });
    await tap(textButton("移到废纸篓"));
    expect(remove).toHaveBeenCalledWith(PRJ);
    expect(container.querySelector(".project-link")).toBeNull();
    expect(textButton("废纸篓 (1)")).toBeTruthy();
    const deletedAt = (await api.trash()).projects[0]!.deletedAt;
    const clean = vi.spyOn(api, "cleanStorage").mockResolvedValue({ projects: 1 });
    const measure = vi.spyOn(desktop, "measureProjectStorage").mockResolvedValue({ [PRJ]: { bytes: 3 * 1024 ** 3, files: 4, estimated: false } });
    await tap(textButton("废纸篓 (1)")); await tap(textButton("清空废纸篓"));
    expect(measure).toHaveBeenCalledWith([{ id: PRJ, deletedAt, segments: [] }]);
    expect(document.querySelector("dialog[open]")?.textContent).toContain("释放 3.00 GB，且无法撤销。");
    expect(clean).not.toHaveBeenCalled();
    await tap(textButton("取消"));
    expect(textButton("恢复")).toBeTruthy();
    await tap(textButton("清空废纸篓"));
    trash.mockResolvedValue({ projects: [] });
    await tap(textButton("永久删除"));
    expect(clean).toHaveBeenCalledWith({ kind: "trash", projects: [{ id: PRJ, deletedAt }] });
    expect(textButton("废纸篓 (1)")).toBeFalsy();
  } finally {
    await act(() => root.unmount());
    container.remove();
    localStorage.removeItem("scarlet.projectView");
    useProjectStore.setState(previous, true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("selects visible projects across layouts and retries only failed bulk actions", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const previous = useProjectStore.getState();
  const db = buildDb();
  const project = db.projects.find(p => p.id === PRJ)!;
  let library = ["A", "B", "C", "D", "E"].map(name => ({
    ...db.summaries[PRJ]!, id: name, name, archived: name === "E", poster: null,
  }));
  vi.spyOn(api, "projects").mockImplementation(async () => ({ projects: library }));
  vi.spyOn(api, "settings").mockResolvedValue({ settings: db.settings });
  vi.spyOn(api, "trash").mockResolvedValue({ projects: [] });
  const archive: typeof api.updateProject = async (id, patch) => {
    library = library.map(p => p.id === id ? { ...p, archived: !!patch.archived } : p);
    return { project: { ...project, id, name: id, ...patch } };
  };
  const update = vi.spyOn(api, "updateProject").mockImplementation(archive);
  const remove = vi.spyOn(api, "deleteProject").mockImplementation(async id => {
    library = library.filter(p => p.id !== id);
    return {};
  });
  useProjectStore.setState({ list: library, listStatus: "ready", current: null });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const check = (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  const button = (text: string, scope: ParentNode = container) =>
    [...scope.querySelectorAll("button")].find(b => b.textContent?.trim() === text)!;
  const click = (element: HTMLElement, modifiers: MouseEventInit = {}) => act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...modifiers }));
  });
  const row = (id: string) => check(`选择${id}`).closest(".project-entry")!.querySelector<HTMLElement>(".project-link")!;
  const selected = () => [...container.querySelectorAll<HTMLInputElement>(".project-selector input:checked")].map(el => el.id);
  const shortcut = (key: string, options: KeyboardEventInit = {}) => act(() => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
  });
  try {
    await act(async () => root.render(<MemoryRouter><Routes>
      <Route path="/" element={<ProjectsPage />} /><Route path="/p/:id" element={<p>Project workspace</p>} />
    </Routes></MemoryRouter>));
    // No row is kept for selecting: the box for every project is in the list's heading row, and the bar isn't there
    // until something is selected.
    const bar = () => container.querySelector(".library-selection-bar");
    expect(bar()).toBeNull();
    const everyBox = check("选择所有可见项目");
    expect(everyBox.closest(".project-columns")).toBeTruthy();
    expect(container.textContent).not.toContain("选择所有");
    await click(row("A"), { metaKey: true });
    await click(row("C"), { shiftKey: true });
    expect(selected()).toEqual(["project-select-A", "project-select-B", "project-select-C"]);
    expect(check("选择所有可见项目").indeterminate).toBe(true);
    expect(bar()?.textContent).toContain("已选择 3 项");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("已选择 3 项");
    // The one bar comes in on the heading row, beside the box that was there, and not as a row of its own above the
    // projects, which would move them from under the pointer.
    expect(container.querySelectorAll(".library-selection-bar")).toHaveLength(1);
    expect(bar()?.parentElement).toBe(everyBox.closest(".project-columns"));
    expect(check("选择所有可见项目")).toBe(everyBox);
    // The grid has no heading row, so its box sits beside the layout switch, and knows what is selected. Its bar is in
    // the page's top row too, straight after the title it lies over.
    await click(container.querySelector('[aria-label="网格视图"]')!);
    expect(container.querySelectorAll('input[aria-label="选择所有可见项目"]')).toHaveLength(1);
    expect(check("选择所有可见项目").closest(".library-heading")).toBeTruthy();
    expect(check("选择所有可见项目").indeterminate).toBe(true);
    expect(container.querySelectorAll(".library-selection-bar")).toHaveLength(1);
    expect(bar()?.closest(".library-heading")).toBeTruthy();
    expect(bar()?.parentElement?.previousElementSibling?.textContent).toBe("项目");
    await click(row("B"));
    expect(selected()).toEqual(["project-select-A", "project-select-C"]);
    // While the batch runs, the bar's buttons and the box are off there as they are in the list.
    let finish!: () => void;
    const held = new Promise<void>(resolve => { finish = resolve; });
    update.mockImplementationOnce(async (...args) => { await held; return archive(...args); });
    await click(button("归档"));
    expect([...bar()!.querySelectorAll("button")].map(b => b.disabled)).toEqual([true, true, true]);
    expect(check("选择所有可见项目").disabled).toBe(true);
    await act(async () => { finish(); await vi.waitFor(() => expect(bar()).toBeNull()); });
    expect(update.mock.calls).toEqual([["A", { archived: true }], ["C", { archived: true }]]);
    expect(selected()).toEqual([]);

    await click(check("选择B"));
    await click(button("已归档"));
    expect(selected()).toEqual([]);
    await shortcut("a", { ctrlKey: true });
    expect(selected()).toEqual(["project-select-A", "project-select-C", "project-select-E"]);
    await click(check("选择E"));
    await click(button("取消归档"));
    expect(update.mock.calls.slice(2)).toEqual([["A", { archived: false }], ["C", { archived: false }]]);

    await click(button("进行中"));
    await click(check("选择所有可见项目"));
    expect(check("选择所有可见项目").checked).toBe(true);
    await shortcut("Escape");
    expect(selected()).toEqual([]);
    await click(check("选择C"));
    await click(check("选择A"), { shiftKey: true });
    await click(button("移到废纸篓"));
    expect(container.querySelector("dialog")?.textContent).toContain("将 3 个项目移到废纸篓？");
    await shortcut("a", { metaKey: true });
    await click(button("取消"));
    expect(remove).not.toHaveBeenCalled();
    expect(selected()).toHaveLength(3);

    remove.mockRejectedValueOnce(new Error("Project is busy"));
    await click(button("移到废纸篓"));
    await click(button("移到废纸篓", container.querySelector("dialog")!));
    expect(remove.mock.calls.flat()).toEqual(["A", "B", "C"]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("A: Project is busy");
    expect(selected()).toEqual(["project-select-A"]);
    await click(button("移到废纸篓"));
    await click(button("移到废纸篓", container.querySelector("dialog")!));
    expect(remove.mock.calls.flat()).toEqual(["A", "B", "C", "A"]);
    expect(library.map(p => p.id)).toEqual(["D", "E"]);
    await click(row("D"));
    expect(container.textContent).toContain("Project workspace");
  } finally {
    await act(() => root.unmount());
    container.remove();
    localStorage.removeItem("scarlet.projectView");
    useProjectStore.setState(previous, true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("shows the welcome only after the engine confirms an empty library and keeps it through refreshes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const previous = useProjectStore.getState();
  const db = buildDb();
  let answer!: (value: { projects: [] }) => void;
  const projects = vi.spyOn(api, "projects").mockReturnValue(new Promise(resolve => { answer = resolve; }));
  vi.spyOn(api, "trash").mockResolvedValue({ projects: [] });
  vi.spyOn(api, "settings").mockResolvedValue({ settings: db.settings });
  // The window opens behind another one: the library still loads.
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  useProjectStore.setState({ list: [], listStatus: "idle", listError: null });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><ProjectsPage /></MemoryRouter>));
    expect(projects).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("开始第一次剪辑");
    await act(async () => answer({ projects: [] }));
    expect(container.querySelector("section h2")?.textContent).toBe("开始第一次剪辑");
    expect(container.querySelector(".first-edit-steps")).toBeNull();
    // A refresh of an empty library doesn't swap that for a spinner.
    hidden.mockReturnValue(false);
    projects.mockReturnValue(new Promise(() => {}));
    await act(async () => { void useProjectStore.getState().loadList(); });
    expect(useProjectStore.getState().listStatus).toBe("ready");
    expect(container.textContent).toContain("开始第一次剪辑");
  } finally {
    await act(() => root.unmount());
    container.remove();
    useProjectStore.setState(previous, true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("says a project's length, then its files, with its frame's size only when it isn't 16:9, and rewords Last edited as time passes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date("2030-01-10T12:00:00Z"));
  const previous = useProjectStore.getState();
  const db = buildDb();
  const base = db.projects.find(p => p.id === PRJ)!;
  const summary = { id: base.id, name: base.name, head: base.head, createdAt: base.createdAt, updatedAt: new Date(Date.now() - 10_000).toISOString(),
    settings: { ...base.settings, aspect: "custom" as const, width: 2560, height: 1600 }, mediaCount: 0, poster: null, pendingChanges: 0, openNotes: 0 };
  const wide = { ...base.settings, aspect: "16:9" as const, width: 1920, height: 1080 };
  const library = [summary, { ...summary, id: "prj_cut", settings: wide, duration: 1002, mediaCount: 3 },
    { ...summary, id: "prj_tall", settings: { ...wide, aspect: "9:16" as const, width: 1080, height: 1920 }, duration: 4000, mediaCount: 1 },
    // A frame given as a size is still 16:9, and a project with no video yet has no length.
    { ...summary, id: "prj_new", settings: { ...wide, aspect: "custom" as const, width: 3840, height: 2160 }, duration: 0, mediaCount: 2 }];
  vi.spyOn(api, "projects").mockResolvedValue({ projects: library });
  vi.spyOn(api, "trash").mockResolvedValue({ projects: [] });
  vi.spyOn(api, "settings").mockResolvedValue({ settings: db.settings });
  useProjectStore.setState({ list: library, listStatus: "ready", listError: null });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><ProjectsPage /></MemoryRouter>));
    // The frame reads as its size: "9:16" after a length would read as a second time.
    expect([...container.querySelectorAll(".project-caption p")].map(el => el.textContent)).toEqual(["2560×1600·0 个文件", "16:42·3 个文件", "1:06:40·1080×1920·1 个文件", "2 个文件"]);
    expect(container.querySelector(".project-date")?.textContent).toBe("刚刚");
    // The library is unchanged, so nothing else redraws the row.
    await act(async () => { vi.advanceTimersByTime(3 * 60_000); });
    expect(container.querySelector(".project-date")?.textContent).toBe("3 分钟前");
  } finally {
    await act(() => root.unmount());
    container.remove();
    useProjectStore.setState(previous, true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

it("says what waits on the editor in the chat's words, with no heading over that column", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const previous = useProjectStore.getState();
  const db = buildDb();
  const library = [5, 1, 0].map((pendingChanges, i) => ({ ...db.summaries[PRJ]!, id: `prj_${i}`, name: `Project ${i}`, pendingChanges, poster: null }));
  vi.spyOn(api, "projects").mockResolvedValue({ projects: library });
  vi.spyOn(api, "trash").mockResolvedValue({ projects: [] });
  vi.spyOn(api, "settings").mockResolvedValue({ settings: db.settings });
  useProjectStore.setState({ list: library, listStatus: "ready", listError: null });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><ProjectsPage /></MemoryRouter>));
    // The engine counts as the project's chat does, so the row reads as the chat's "N need you".
    expect([...container.querySelectorAll(".project-review")].map(el => el.textContent)).toEqual(["5 项待审阅", "1 项待审阅", "暂无待处理事项"]);
    expect(container.querySelectorAll(".review-badge")).toHaveLength(2);
    expect([...container.querySelectorAll(".project-columns span")].map(el => el.textContent)).toEqual(["项目", "", "最后编辑"]);
    expect(container.textContent).not.toContain("to review");
  } finally {
    await act(() => root.unmount());
    container.remove();
    useProjectStore.setState(previous, true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("says under a project's details what Scarlet is doing in it, and nothing while it is idle", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const previous = useProjectStore.getState();
  const db = buildDb();
  const activities: Array<ProjectSummary["activity"]> = [
    [{ kind: "editing", count: 1 }, { kind: "transcribing", count: 2, fraction: 0.425 }],
    [{ kind: "importing", count: 2 }, { kind: "caching", count: 1 }],
    [{ kind: "caching", count: 1, fraction: 0.999, paused: true }],
    undefined,
  ];
  const library = activities.map((activity, i) => ({ ...db.summaries[PRJ]!, id: `prj_${i}`, name: `Project ${i}`, poster: null, ...(activity && { activity }) }));
  vi.spyOn(api, "projects").mockResolvedValue({ projects: library });
  vi.spyOn(api, "trash").mockResolvedValue({ projects: [] });
  vi.spyOn(api, "settings").mockResolvedValue({ settings: db.settings });
  useProjectStore.setState({ list: library, listStatus: "ready", listError: null });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><ProjectsPage /></MemoryRouter>));
    const rows = [...container.querySelectorAll(".project-card")];
    // A job under way gives its figure once the engine has one, never 100%; a paused one says so and its ring stands still.
    expect(rows.map(row => row.querySelector(".project-activity")?.textContent ?? null))
      .toEqual(["剪辑中·转写中 42%", "正在导入 2 个文件·缓存中", "缓存中已暂停", null]);
    expect(rows.slice(0, 3).map(row => row.querySelector(".project-activity-mark")?.getAttribute("data-state"))).toEqual(["working", "working", "paused"]);
    // The row's link reads the status with its details.
    expect(rows[0]!.querySelector(".project-link")!.getAttribute("aria-describedby")).toBe("project-meta-prj_0 project-activity-prj_0 project-review-prj_0");
    expect(rows[3]!.querySelector(".project-link")!.getAttribute("aria-describedby")).toBe("project-meta-prj_3 project-review-prj_3");
  } finally {
    await act(() => root.unmount());
    container.remove();
    useProjectStore.setState(previous, true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("queues a link on Enter and closes its dialog at once, while the link still downloads", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const previous = useProjectStore.getState();
  const video = buildDb().media[PRJ]!.find(m => m.kind === "video")!;
  const link = "https://example.com/a.mp4";
  let finish!: () => void;
  const imports = vi.spyOn(api, "importMedia").mockImplementation(() => new Promise(resolve => { finish = () => resolve({ media: video }); }));
  const upsert = vi.fn();
  // The project on screen is still as it was created, with no video yet.
  const fresh = { ...createProject("Interview"), id: PRJ };
  const updateProject = vi.fn(async () => {});
  useProjectStore.setState({ upsertMedia: upsert, updateProject, current: { id: PRJ, project: fresh, media: [] } as never });
  const onClose = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const button = (text: string) => [...container.querySelectorAll("button")].find(b => b.textContent?.trim() === text)!;
  const enter = () => act(async () => { container.querySelector<HTMLFormElement>("#import-link")!.requestSubmit(); });
  try {
    await act(async () => root.render(<ImportUrlModal projectId={PRJ} open notice="" onClose={onClose} />));
    // The dialog is named for the button that opens it, and its own button for what it does.
    expect(container.querySelector("dialog h2")?.textContent).toBe("从链接导入");
    expect(button("导入")).toBeDefined();
    const field = container.querySelector<HTMLInputElement>("#import-url")!;
    // Enter with nothing typed imports nothing.
    await enter();
    expect(imports).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, ` ${link} `);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await enter();
    // The link joined the project's queue, remembered like a file until it is in. The dialog didn't wait for it:
    // it closed with the field empty, and nothing in it spins or is switched off.
    expect(imports).toHaveBeenCalledExactlyOnceWith(PRJ, { url: link, importId: pendingImports(PRJ)[0]?.importId }, expect.any(AbortSignal));
    expect(pendingImports(PRJ).map(i => i.source)).toEqual([link]);
    expect(onClose).toHaveBeenCalledOnce();
    expect(field.value).toBe("");
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(button("取消").disabled).toBe(false);
    // Cancel, the × and Esc put the dialog away at any time.
    await act(async () => button("取消").click());
    await act(async () => container.querySelector<HTMLButtonElement>("[data-close]")!.click());
    await act(async () => { container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })); });
    expect(onClose).toHaveBeenCalledTimes(4);
    expect(imports).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(upsert).toHaveBeenCalledExactlyOnceWith(PRJ, video);
    expect(pendingImports(PRJ)).toEqual([]);
    // As a file does, the first video added to a project that is still new gives it its format.
    expect(updateProject).toHaveBeenCalledExactlyOnceWith({ settings: expect.objectContaining({ width: video.width, height: video.height }),
      expectedFormat: { settings: fresh.settings, head: fresh.head } }, PRJ);
  } finally {
    await act(() => root.unmount());
    container.remove();
    localStorage.removeItem("scarlet.imports.v1");
    useProjectStore.setState(previous, true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("shows one window-wide update on Projects while building and when ready", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const previous = useProjectStore.getState();
  const db = buildDb();
  // A library with a project in it: an empty one has its New project in its card, not in the heading.
  const library = [{ ...db.summaries[PRJ]!, poster: null }];
  vi.spyOn(api, "projects").mockResolvedValue({ projects: library });
  useProjectStore.setState({ list: library, listStatus: "ready" });
  vi.spyOn(api, "trash").mockResolvedValue({ projects: [] });
  vi.spyOn(api, "settings").mockResolvedValue({ settings: db.settings });
  const status = vi.spyOn(desktop, "updateStatus").mockResolvedValue({ ready: null, building: null });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const { enableUpdateStatus, refreshUpdateStatus } = await import("../lib/updateStatus");
  const { UpdateButton } = await import("../components/shell/UpdateButton");
  enableUpdateStatus();
  try {
    await act(async () => root.render(<><UpdateButton /><MemoryRouter><ProjectsPage /></MemoryRouter></>));
    const controls = () => container.querySelectorAll('[aria-label="Scarlet 更新"]');
    expect(controls()).toHaveLength(0);
    const revision = "d".repeat(40);
    status.mockResolvedValue({ ready: null, building: { revision, done: 0.6, step: 0, stepStarted: 0, stepSeconds: 1 } });
    await act(async () => refreshUpdateStatus());
    expect(controls()).toHaveLength(1);
    expect(controls()[0]!.querySelector("[role=status]")?.textContent).toBe("更新中60%");
    status.mockResolvedValue({ ready: revision, building: null });
    await act(async () => refreshUpdateStatus());
    expect(controls()).toHaveLength(1);
    expect(controls()[0]!.querySelector("button")?.textContent).toBe("重启并更新");
  } finally {
    await act(() => root.unmount());
    container.remove();
    useProjectStore.setState(previous, true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("lists each short under the video it was made from, in the order they were made, and a short whose video isn't listed on its own", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const previous = useProjectStore.getState();
  const db = buildDb();
  const base = db.projects.find(p => p.id === PRJ)!;
  const tall = { ...base.settings, aspect: "9:16" as const, width: 1080, height: 1920 };
  const row = (id: string, name: string, extra: Partial<ProjectSummary> = {}): ProjectSummary => ({ id, name, head: base.head, settings: base.settings,
    mediaCount: 1, poster: null, pendingChanges: 0, openNotes: 0, duration: 41, createdAt: "2030-01-10T12:00:00.000Z", ...extra });
  const from = (projectId: string, name: string) => ({ settings: tall, source: { projectId, name } });
  // Newest first, as the engine lists them: the shorts were edited after the long video.
  const library = [
    row("prj_s2", "The wrong flight", { ...from("prj_long", "Weekly interview"), createdAt: "2030-01-10T12:00:02.000Z" }),
    row("prj_s1", "Agents fail without tools", { ...from("prj_long", "Weekly interview"), createdAt: "2030-01-10T12:00:01.000Z" }),
    row("prj_other", "Tech brief"),
    row("prj_long", "Weekly interview", { duration: 2400, mediaCount: 3 }),
    row("prj_lost", "From an archived video", from("prj_archived", "Old talk")),
  ];
  vi.spyOn(api, "projects").mockResolvedValue({ projects: library });
  vi.spyOn(api, "trash").mockResolvedValue({ projects: [] });
  vi.spyOn(api, "settings").mockResolvedValue({ settings: db.settings });
  useProjectStore.setState({ list: library, listStatus: "ready", listError: null });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><ProjectsPage /></MemoryRouter>));
    const cards = [...container.querySelectorAll(".project-card")];
    expect(cards.map(card => [card.querySelector("h2")?.textContent, card.classList.contains("is-short")])).toEqual([
      ["Tech brief", false], ["Weekly interview", false], ["Agents fail without tools", true], ["The wrong flight", true], ["From an archived video", false]]);
    expect(cards.map(card => card.querySelector(".project-caption p")?.textContent)).toEqual([
      "0:41·1 个文件", "40:00·3 个文件·2 条短视频", "0:41·1080×1920·来自 Weekly interview", "0:41·1080×1920·来自 Weekly interview", "0:41·1080×1920·来自 Old talk"]);
  } finally {
    await act(() => root.unmount());
    container.remove();
    useProjectStore.setState(previous, true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
