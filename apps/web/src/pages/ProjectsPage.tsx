import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import type { ProjectActivity, ProjectSummary } from "@scarlet/shared";
import { api, errorMessage, IS_DESKTOP } from "../lib/client";
import { absTime, clock, relTime } from "../lib/format";
import { zh } from "../lib/zh";
import { isEditableTarget } from "../lib/hotkeys";
import { useProjectStore } from "../stores/project";
import { useUiStore } from "../stores/ui";
import { matchFirstClip } from "../lib/firstClipFormat";
import { rememberProject } from "../lib/updatePlace";
import { useHoverFrames } from "../lib/hoverFrames";
import { interactiveFrameUrl } from "../components/review/thumbs";
import { Dropzone, enqueueImports, filename, UploadList, useImportCount, useUploader, type ImportSource } from "../components/media/UploadDropzone";
import { ACCEPTED_MEDIA, MEDIA_FORMAT_HINT } from "../lib/upload";
import { desktop } from "../lib/desktop";
import { useImportTranscription } from "../components/media/TranscriptionAction";
import { Dropdown, MenuItem, WindowActions } from "../components/shell/WorkspaceNavigation";
import { TrashButton } from "../components/shell/TrashButton";
import { ConfirmDialog, EmptyState, ErrorState, Field, Icon, InlineError, Loading, Modal, Spinner } from "../components/ui/primitives";

/**
 * Under a project's name: how long its video runs, then how many files it has. Its frame is there only when it isn't
 * 16:9, which nearly every project is, and reads as its size: beside a length, "9:16" reads as a second time. Its
 * frame rate is in Project settings.
 */
function projectFacts(p: ProjectSummary, shorts = 0): string[] {
  const { width, height } = p.settings;
  return [p.duration ? clock(p.duration) : "", width * 9 === height * 16 ? "" : `${width}×${height}`,
    // A short shares its video's footage, so where it came from says more than how many files it has.
    p.source ? `来自 ${p.source.name}` : `${p.mediaCount} 个文件`, shorts ? `${shorts} 条短视频` : ""].filter(Boolean);
}

/**
 * The library's order, with each short right under the video it was made from, in the order they were made. A short
 * whose video isn't listed here (archived, in the trash) is listed on its own.
 */
export function withShorts(projects: ProjectSummary[]): Array<{ p: ProjectSummary; nested: boolean; shorts: number }> {
  const listed = new Set(projects.map(p => p.id));
  const under = new Map<string, ProjectSummary[]>();
  for (const p of projects) if (p.source && listed.has(p.source.projectId)) under.set(p.source.projectId, [...under.get(p.source.projectId) ?? [], p]);
  const made = (p: ProjectSummary) => p.createdAt ?? "";
  return projects.filter(p => !(p.source && listed.has(p.source.projectId))).flatMap(p => {
    const shorts = (under.get(p.id) ?? []).sort((a, b) => made(a).localeCompare(made(b)) || a.name.localeCompare(b.name));
    return [{ p, nested: false, shorts: shorts.length }, ...shorts.map(short => ({ p: short, nested: true, shorts: 0 }))];
  });
}

/** First video in the project, for a poster frame. */
function usePoster(projectId: string, mediaCount: number, poster: ProjectSummary["poster"]): string | undefined {
  const [src, setSrc] = useState<string | undefined>();
  useEffect(() => {
    if (poster !== undefined) return;
    if (!mediaCount) { setSrc(undefined); return; }
    let live = true;
    api
      .media(projectId)
      .then(({ media }) => {
        const v = media.find((m) => m.kind === "video");
        if (live) setSrc(v ? interactiveFrameUrl(api.frameUrl(v.id, Math.min(2, (v.duration ?? 4) / 2), 480)) : undefined);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [projectId, mediaCount, poster]);
  // The library's pictures are the editor's own view. Behind a pass's frames they held the window's connections,
  // and the library's list waited 11 s for one (2026-11-12).
  return poster === undefined ? src : poster ? interactiveFrameUrl(api.frameUrl(poster.mediaId, poster.time, 480)) : undefined;
}

/**
 * What Scarlet is doing in the project, as the engine counted it, in a few words: "Editing", "Transcribing 42%",
 * "Caching paused". A job under way gives how far it has got once there is a figure, and never says 100%.
 */
function activityLabel(activity: ProjectActivity): string {
  const name = { editing: "剪辑中", importing: zh.terms.import, transcribing: "转写中", caching: "缓存中" }[activity.kind];
  if (activity.paused) return `${name}已暂停`;
  if (activity.kind === "importing") return `正在${zh.terms.import} ${activity.count ?? 1} 个文件`;
  return activity.fraction === undefined ? name : `${name} ${Math.min(99, Math.floor(activity.fraction * 100))}%`;
}

/** The project's status under its details while Scarlet works on it, led by a ring drawn as the chat's step under way is. */
function ProjectActivityLine({ p }: { p: ProjectSummary }) {
  const activity = p.activity ?? [];
  if (!activity.length) return null;
  const working = activity.some(a => !a.paused);
  return <p className="project-activity" id={`project-activity-${p.id}`}>
    <span className="project-activity-mark" data-state={working ? "working" : "paused"} aria-hidden />
    {activity.map((a, i) => <span key={a.kind} className={a.kind === "editing" ? "is-editing" : undefined}>
      {i > 0 && <i aria-hidden>·</i>}{activityLabel(a)}
    </span>)}
  </p>;
}

function ProjectActions({ project }: { project: ProjectSummary }) {
  const update = useProjectStore(s => s.updateProject);
  const remove = useProjectStore(s => s.deleteProject);
  const [dialog, setDialog] = useState<"rename" | "trash" | null>(null);
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(patch: Partial<Pick<ProjectSummary, "name" | "archived" | "mediaPaused">>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await update(patch, project.id);
      setDialog(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="project-actions">
      <Dropdown label={`${project.name}的操作`} align="right" width={176}
        button={<span className="btn-icon" title={zh.project.actions}><Icon name="more" size={18} /></span>}>
        {close => <>
          <MenuItem onClick={() => { close(); setName(project.name); setError(""); setDialog("rename"); }}>{zh.project.rename}</MenuItem>
          <MenuItem onClick={() => { close(); void save({ archived: !project.archived }); }}>{project.archived ? zh.project.unarchive : zh.project.archive}</MenuItem>
          {(project.mediaPaused || project.activity?.some(a => a.kind !== "editing")) && (
            <MenuItem disabled={busy} title={project.mediaPaused ? zh.project.resumeMedia : zh.project.pauseMedia}
              onClick={() => { close(); void save({ mediaPaused: !project.mediaPaused }); }}>
              {project.mediaPaused ? zh.project.resume : zh.project.pause}
            </MenuItem>
          )}
          <MenuItem danger onClick={() => { close(); setError(""); setDialog("trash"); }}>{zh.project.moveToTrash}</MenuItem>
        </>}
      </Dropdown>
    </div>
    {!dialog && <InlineError>{error}</InlineError>}
    {/* A rename given up on takes its failure with it: left behind, it would show under the project's row. */}
    <Modal open={dialog === "rename"} onClose={() => { if (!busy) { setDialog(null); setError(""); } }} title={zh.project.rename}>
      <form onSubmit={e => { e.preventDefault(); if (name.trim()) void save({ name: name.trim() }); }}>
        <Field label={zh.project.projectName} htmlFor={`rename-${project.id}`}>
          <input autoFocus id={`rename-${project.id}`} className="field" value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <InlineError>{error}</InlineError>
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => { setDialog(null); setError(""); }}>{zh.common.cancel}</button>
          <button className="btn-primary" disabled={busy || !name.trim()}>{zh.common.save}</button>
        </div>
      </form>
    </Modal>
    {dialog === "trash" && <ConfirmDialog open onClose={() => setDialog(null)} danger
      title={zh.project.moveToTrashQuestion(project.name)} confirmLabel={zh.project.moveToTrash}
      body="项目和素材可在废纸篓中恢复 30 天。"
      onConfirm={() => remove(project.id)} />}
  </>;
}

function ProjectCard({ p, notice, selected, selecting, onSelect, nested = false, shorts = 0 }: {
  p: ProjectSummary; notice: string; selected: boolean; selecting: boolean; onSelect: (range: boolean) => void; nested?: boolean; shorts?: number;
}) {
  const { items, start, startPaths, dismiss } = useUploader(p.id, p);
  const pending = useImportCount(p.id);
  const poster = usePoster(p.id, p.mediaCount, p.poster);
  const [failedPoster, setFailedPoster] = useState<string>();
  const showsPoster = !!poster && poster !== failedPoster;
  const { frame, ...flip } = useHoverFrames(p.id, p.poster, showsPoster);
  const portrait = p.settings.height > p.settings.width;
  const checkbox = useRef<HTMLInputElement>(null);
  const checkboxId = `project-select-${p.id}`;
  function onRowClick(e: ReactMouseEvent) {
    if (selecting || e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault();
      checkbox.current?.focus();
      onSelect(e.shiftKey);
    }
  }
  const contents = <>
    <div className="project-still">
      {showsPoster ? <>
        <img src={poster} loading="lazy" decoding="async" alt="" className={portrait ? "portrait" : ""} onError={() => setFailedPoster(poster)} />
        {/* While the pointer rests on the card, a few frames of the footage play over the poster. */}
        {frame && <img src={frame} alt="" className={portrait ? "project-flip portrait" : "project-flip"} />}
      </> : (
        <div className="project-placeholder"><Icon name="film" size={34} /></div>
      )}
    </div>
    <div className="project-caption">
      <h2 title={p.name}>{p.name}</h2>
      <p id={`project-meta-${p.id}`}>{projectFacts(p, shorts).map((fact, i) => <Fragment key={i}>{i > 0 && <span>·</span>}{fact}</Fragment>)}</p>
      <ProjectActivityLine p={p} />
    </div>
    {/* The count and the words of the project's chat: the calls, questions and suggestions that wait on the editor. */}
    <div className="project-review" id={`project-review-${p.id}`}>
      {p.pendingChanges > 0
        ? <span className="review-badge"><i aria-hidden />{zh.project.needsYou(p.pendingChanges)}</span>
        : <span className="sr-only">{zh.project.nothingNeedsYou}</span>}
    </div>
    <time className="project-date" dateTime={p.updatedAt} title={absTime(p.updatedAt)}>{relTime(p.updatedAt)}</time>
  </>;
  return (
    <Dropzone onFiles={start} onPaths={startPaths} label={zh.project.addFiles(p.name)} notice={notice} className={`project-card${selected ? " is-selected" : ""}${nested ? " is-short" : ""}`}>
      <div className="project-entry" {...flip}>
        <label className="project-selector" title={`选择${p.name} · 按住 Shift 点击可选择范围`}>
          <input ref={checkbox} id={checkboxId} type="checkbox" aria-label={zh.project.selectProject(p.name)} checked={selected}
            onChange={e => onSelect((e.nativeEvent as MouseEvent).shiftKey)} />
        </label>
        {selecting
          ? <label className="project-link" htmlFor={checkboxId} onClickCapture={onRowClick}>{contents}</label>
          : <Link to={`/p/${p.id}`} className="project-link" aria-label={zh.project.openProject(p.name)}
              aria-describedby={`project-meta-${p.id}${p.activity?.length ? ` project-activity-${p.id}` : ""} project-review-${p.id}`} onClick={onRowClick}>{contents}</Link>}
        {!selecting && <ProjectActions project={p} />}
      </div>
      {pending > 0 && <small role="status">{zh.project.adding(pending)}</small>}
      <UploadList items={items} onDismiss={dismiss} />
    </Dropzone>
  );
}

function ProjectCollection({ projects, view, archived, notice, selectionSlot, selectAllSlot }: {
  projects: ProjectSummary[]; view: "list" | "grid"; archived: boolean; notice: string;
  selectionSlot: HTMLElement | null; selectAllSlot: HTMLElement | null;
}) {
  const update = useProjectStore(s => s.updateProject);
  const remove = useProjectStore(s => s.deleteProject);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const [batchSize, setBatchSize] = useState(0);
  const busy = batchSize > 0;
  const [trashOpen, setTrashOpen] = useState(false);
  const [error, setError] = useState("");
  const targets = useMemo(() => projects.filter(p => selected.has(p.id)), [projects, selected]);
  const count = targets.length;

  useEffect(() => {
    if (selected.size !== count) setSelected(new Set(targets.map(p => p.id)));
    if (!count) {
      anchor.current = null;
      setTrashOpen(false);
    }
  }, [count, projects.length, selected, targets]);

  function select(id: string, range: boolean) {
    if (busy) return;
    const next = new Set(selected);
    // A range runs down the rows as they are listed, shorts under their video.
    const shown = withShorts(projects).map(row => row.p);
    const from = shown.findIndex(p => p.id === anchor.current);
    if (range && from >= 0) {
      const to = shown.findIndex(p => p.id === id);
      for (const p of shown.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(p.id);
    } else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
      anchor.current = id;
    }
    setError("");
    setSelected(next);
  }

  function selectVisible(all: boolean) {
    anchor.current = null;
    setError("");
    setSelected(new Set(all ? projects.map(p => p.id) : []));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (busy || e.defaultPrevented || e.altKey || e.shiftKey ||
        document.querySelector('dialog[open], [role="dialog"], [role="menu"], [data-shortcut-overlay]')) return;
      if (isEditableTarget(e.target) && !(e.target instanceof HTMLInputElement && e.target.type === "checkbox")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectVisible(true);
      } else if (e.key === "Escape" && count) {
        e.preventDefault();
        selectVisible(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [projects, busy, count]);

  async function apply(action: "archive" | "trash") {
    if (busy || !count) return;
    setBatchSize(count);
    setError("");
    const failed = new Set<string>();
    const errors: string[] = [];
    for (const project of targets) {
      try {
        if (action === "trash") await remove(project.id);
        else await update({ archived: !archived }, project.id);
      } catch (e) {
        failed.add(project.id);
        errors.push(`${project.name}: ${errorMessage(e)}`);
      }
    }
    setSelected(failed);
    setError(errors.join(" · "));
    setBatchSize(0);
    void useProjectStore.getState().loadList();
  }

  // The box that selects every project shown. The list has it in its heading row, in line with each row's own box. The
  // grid has no heading row, so there it sits beside the layout switch. No row is kept for it.
  const selectAll = (className: string) => <label className={className} title={zh.project.selectAll}>
    <input type="checkbox" aria-label={zh.project.selectAll} disabled={busy} checked={count === projects.length}
      ref={box => { if (box) box.indeterminate = count > 0 && count < projects.length; }} onChange={e => selectVisible(e.target.checked)} />
  </label>;
  // How many are selected and what can be done with them, there only while something is. It sits on the row that
  // holds that box, over the row's words: the list's headings, or the page's title in the grid. It takes no room of
  // its own, so no project moves from under the pointer when it comes in. In the grid it is outside the fieldset, so
  // its buttons are turned off here while a batch runs.
  const selection = count > 0 && <div className="library-selection-bar">
    <span aria-hidden>{zh.project.selected(count)}</span>
    <button className="btn-ghost" disabled={busy} onClick={() => void apply("archive")}>{archived ? zh.project.unarchive : zh.project.archive}</button>
    <button className="btn-ghost" disabled={busy} onClick={() => setTrashOpen(true)}><Icon name="trash" size={14} /> {zh.project.moveToTrash}</button>
    <button className="btn-quiet" disabled={busy} onClick={() => selectVisible(false)}>{zh.common.clear}</button>
    {busy && <Spinner />}
  </div>;
  return <>
    {view === "grid" && selectionSlot && createPortal(selection, selectionSlot)}
    {view === "grid" && selectAllSlot && createPortal(selectAll("library-select-all"), selectAllSlot)}
    <fieldset disabled={busy} className="min-w-0" aria-label="项目库">
      <span className="sr-only" role="status">{count ? zh.project.selected(count) : ""}</span>
      <InlineError>{error}</InlineError>
      <div className={`project-collection ${view}`}>
        {/* The column of what needs the editor has no heading: a row that has something there says so in its own words. */}
        {view === "list" && <div className="project-columns">
          {selectAll("project-selector")}
          <span aria-hidden>{zh.common.project}</span><span /><span aria-hidden>{zh.project.lastEdited}</span>
          {selection}
        </div>}
        {withShorts(projects).map(({ p, nested, shorts }) => <ProjectCard key={p.id} p={p} notice={notice} selected={selected.has(p.id)}
          selecting={count > 0 || busy} onSelect={range => select(p.id, range)} nested={nested} shorts={shorts} />)}
      </div>
    </fieldset>
    {trashOpen && count > 0 && <ConfirmDialog open danger onClose={() => { if (!busy) setTrashOpen(false); }}
      title={`将 ${batchSize || count} 个项目移到废纸篓？`} confirmLabel={zh.project.moveToTrash}
      body="项目和素材可在废纸篓中恢复 30 天。"
      onConfirm={() => apply("trash")} />}
  </>;
}

export function ImportUrlModal({ projectId, open, notice, onClose }: { projectId: string; open: boolean; notice: string; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const { startPaths } = useUploader(projectId);
  // The link joins the project's queue like a dropped file, and the dialog goes at once: a download can take minutes.
  // Media shows it being added once its turn comes, counts it in "File 1 of 2" while another is added first, and
  // says there if it failed. As a file does, the first video added to a project that is still new gives it its format.
  const run = () => {
    const link = url.trim();
    if (!link) return;
    void startPaths([link]);
    setUrl("");
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={zh.create.addFromLink}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {zh.common.cancel}
          </button>
          <button type="submit" form="import-link" className="btn-primary" disabled={!url.trim()}>
            {zh.create.add}
          </button>
        </>
      }
    >
      {notice && <p className="text-muted text-[12px] mb-3">{notice}</p>}
      <form id="import-link" onSubmit={e => { e.preventDefault(); run(); }}>
        <Field label={zh.create.linkOrPath} htmlFor="import-url">
          <input id="import-url" className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/file/d/…" autoFocus />
        </Field>
      </form>
    </Modal>
  );
}

function FirstEditGuide() {
  return (
    <>
      <ol className="first-edit-steps">
        <li>
          <h3>{zh.create.addFootage}</h3>
          <p>把素材拖到项目库，或选择<strong>{zh.create.newProject}</strong>。</p>
        </li>
        <li>
          <h3>{zh.create.askEdit}</h3>
          <p>关闭媒体面板，然后输入或说出剪辑要求。</p>
          <p>如有提示，请在<strong>更多 → 设置模型</strong>中连接 Claude、ChatGPT 或 Google。</p>
        </li>
        <li>
          <h3>{zh.create.playback}</h3>
          <p>在时间线上播放成片，选择<strong>审阅</strong>进行调整，或选择<strong>{zh.terms.export}</strong>保存 MP4。</p>
        </li>
      </ol>
      <details className="first-edit-skills">
        <summary>教 Scarlet 了解你的剪辑风格 <Icon name="chevron" size={13} /></summary>
        <p>要重复使用剪辑指令，请在聊天中输入<strong>/</strong>并选择<strong>创建技能</strong>。</p>
        <p>当你提出类似剪辑要求时，Scarlet 也会建议规则。</p>
        <blockquote>“采访中遇到难答的问题后，始终保留一拍停顿。”</blockquote>
        <p>在<strong>更多 → 学习</strong>中审阅规则，选择技能并按<strong>批准</strong>保存。</p>
      </details>
    </>
  );
}


/** One file chosen twice is listed once: a path is itself, a browser file its name, size and date. */
const sourceKey = (source: ImportSource) => typeof source === "string" ? source : `${source.name}:${source.size}:${source.lastModified}`;

export function ProjectsPage() {
  // Back at the library: a quit from here reopens the library, not the last project.
  useEffect(() => rememberProject(null), []);
  const list = useProjectStore((s) => s.list);
  const status = useProjectStore((s) => s.listStatus);
  const error = useProjectStore((s) => s.listError);
  const loadList = useProjectStore((s) => s.loadList);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) void loadList(); };
    // The first load doesn't wait for the window to show: a library opened behind another window is there when looked at.
    void loadList();
    // The library can stay open while a background edit finishes.
    const timer = window.setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadList]);
  // "Last edited" is worded from now. An unchanged refresh draws nothing, so the page redraws each minute.
  const [, setMinute] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setMinute(n => n + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const createProject = useProjectStore((s) => s.createProject);
  const navigate = useNavigate();
  const [archived, setArchived] = useState(false);
  const projects = useMemo(() => list.filter(p => Boolean(p.archived) === archived), [list, archived]);
  const [view, setView] = useState<"list" | "grid">(() => {
    try { return localStorage.getItem("scarlet.projectView") === "grid" ? "grid" : "list"; }
    catch { return "list"; }
  });
  const chooseView = (next: typeof view) => {
    setView(next);
    try { localStorage.setItem("scarlet.projectView", next); } catch { /* Storage is optional. */ }
  };
  const [dialog, setDialog] = useState<"create" | "guide" | null>(null);
  const [name, setName] = useState("");
  const [files, setFiles] = useState<ImportSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { notice, local } = useImportTranscription();
  // Where the grid puts what the list has in its heading row: the box that selects every project beside the layout
  // switch, and what is selected over the title.
  const [selectAllSlot, setSelectAllSlot] = useState<HTMLElement | null>(null);
  const [selectionSlot, setSelectionSlot] = useState<HTMLElement | null>(null);

  /** A project is named for its first video until the editor names it. */
  const nameFrom = (sources: ImportSource[]) => filename(sources[0]!).replace(/\.[^.]+$/, "") || "未命名项目";
  // The name the first video last gave, so another selection renames a project the editor hasn't named themselves.
  const given = useRef("");

  const begin = (sources: ImportSource[]) => {
    setFiles(sources);
    given.current = sources.length ? nameFrom(sources) : "";
    setName(given.current);
    setErr(null);
    setDialog("create");
  };

  const selectFootage = (sources: ImportSource[]) => {
    setFiles(sources);
    // Videos chosen in the dialog name the project as videos dropped on the library do. A name the editor typed stays.
    const was = given.current, next = sources.length ? nameFrom(sources) : "";
    given.current = next;
    setName(typed => !typed.trim() || typed === was ? next : typed);
  };

  /** Videos chosen or dropped on the open dialog join the ones already there, once each. */
  const addFootage = (sources: ImportSource[]) => {
    if (busy || !sources.length) return;
    const has = new Set(files.map(sourceKey));
    selectFootage([...files, ...sources.filter(source => !has.has(sourceKey(source)))]);
  };

  const removeFootage = (index: number) => {
    if (!busy) selectFootage(files.filter((_, at) => at !== index));
  };

  const pick = async () => {
    if (!IS_DESKTOP) {
      fileInput.current?.click();
      return;
    }
    setErr(null);
    try {
      addFootage(await desktop.pickFiles());
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  const create = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const project = await createProject({ name: name.trim() });
      if (empty) useUiStore.getState().offerFirstEditHint(project.id);
      void enqueueImports(project.id, files, matchFirstClip(project));
      navigate(`/p/${project.id}?panel=media`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const empty = !list.length && !archived && status === "ready";
  const newProject = <button type="button" className="btn-primary" onClick={() => begin([])}>
    <Icon name="plus" size={15} /> {zh.create.newProject}
  </button>;
  const quickStart = <button type="button" className="btn-quiet" aria-haspopup="dialog" onClick={() => setDialog("guide")}>
    {zh.create.quickStart} {empty && <Icon name="arrow" size={14} />}
  </button>;

  return (
    <div className="flex-1 overflow-y-auto">
      <Dropzone onFiles={sources => begin(Array.from(sources))} onPaths={begin} label={zh.create.dropToCreate} notice={notice} className="min-h-full">
        <main className={empty ? "library-page library-welcome" : "library-page"}>
          <header className="library-heading">
            <h1>{zh.common.projects}</h1>
            <span ref={setSelectionSlot} className="contents" />
            <div className="flex-1" />
            {list.length > 0 && quickStart}
            {(archived || list.some(p => p.archived)) && <div className="view-switch library-filter" role="group" aria-label="项目状态">
              <button aria-pressed={!archived} onClick={() => setArchived(false)}>{zh.project.active}</button>
              <button aria-pressed={archived} onClick={() => setArchived(true)}>{zh.project.archived}</button>
            </div>}
            <TrashButton />
            <span ref={setSelectAllSlot} className="contents" />
            {list.length > 0 && <div className="view-switch" role="group" aria-label="项目视图">
              <button aria-label={zh.project.listView} aria-pressed={view === "list"} title={zh.project.listView} onClick={() => chooseView("list")}><Icon name="diff" size={15} /></button>
              <button aria-label={zh.project.gridView} aria-pressed={view === "grid"} title={zh.project.gridView} onClick={() => chooseView("grid")}><Icon name="library" size={14} /></button>
            </div>}
            {!empty && newProject}
            <WindowActions />
          </header>
          {(status === "loading" || status === "idle") && !list.length ? (
            // Wait for the library before offering a first project.
            <Loading />
          ) : status === "error" && !list.length ? (
            <ErrorState body={error ?? undefined} onRetry={() => void loadList(true)} />
          ) : archived && !projects.length ? (
            <EmptyState title={zh.project.noArchived} action={<button className="btn-ghost" onClick={() => setArchived(false)}>{zh.project.viewActive}</button>} />
          ) : list.length > 0 && !projects.length ? (
            <EmptyState title={zh.project.noActive} action={<button className="btn-ghost" onClick={() => setArchived(true)}>{zh.project.viewArchived}</button>} />
          ) : empty ? (
            <section className="library-first-edit" aria-labelledby="first-edit-title">
              <h2 id="first-edit-title">{zh.create.firstEdit}</h2>
              <p>{zh.create.firstEditBody}</p>
              <div className="first-edit-actions">{newProject}{quickStart}</div>
            </section>
          ) : (
            <ProjectCollection key={String(archived)} projects={projects} view={view} archived={archived} notice={notice}
              selectionSlot={selectionSlot} selectAllSlot={selectAllSlot} />
          )}
        </main>
      </Dropzone>

      <Modal open={dialog === "guide"} onClose={() => setDialog(null)} title={zh.create.quickStart} width={480} footer={newProject}>
        <FirstEditGuide />
      </Modal>
      <Modal
        open={dialog === "create"}
        onClose={() => { if (!busy) { setDialog(null); setErr(null); } }}
        title={zh.create.newProject}
        footer={
          <>
            <button className="btn-ghost" disabled={busy} onClick={() => { setDialog(null); setErr(null); }}>{zh.common.cancel}</button>
            <button type="submit" form="new-project" className="btn-primary" disabled={!name.trim() || busy}>
              {busy && <Spinner className="size-3" />} {files.length ? zh.create.createAndImport : zh.create.create}
            </button>
          </>
        }
      >
        <form id="new-project" onSubmit={e => { e.preventDefault(); void create(); }}>
          <Dropzone onFiles={sources => addFootage(Array.from(sources))} onPaths={addFootage} label={zh.create.dropVideos} notice={notice}>
            <Field label={zh.project.projectName} htmlFor="np-name">
              <input id="np-name" className="field" value={name} required disabled={busy} onChange={e => setName(e.target.value)} placeholder={zh.create.enterName} />
            </Field>
            <fieldset>
              <legend className="label">{zh.create.mediaFiles}</legend>
              <input ref={fileInput} type="file" hidden multiple accept={ACCEPTED_MEDIA} onChange={e => {
                if (e.target.files) addFootage(Array.from(e.target.files));
                e.target.value = "";
              }} />
              <button type="button" className="btn-ghost" aria-describedby="np-file-types" disabled={busy} onClick={() => void pick()}>
                {files.length ? zh.create.addFiles : zh.create.chooseFiles}
              </button>
              {/* Each file has its own ×: Clear is for a longer list. */}
              {files.length > 1 && <button type="button" className="btn-quiet" disabled={busy} onClick={() => selectFootage([])}>{zh.common.clear}</button>}
              <p id="np-file-types" className="sr-only">{MEDIA_FORMAT_HINT}</p>
            </fieldset>
            {files.length > 0 && <>
              <ul aria-label={zh.create.selectedFiles} className="new-project-files">
                {files.map((file, index) => <li key={sourceKey(file)}>
                  <span>{filename(file)}</span>
                  <button type="button" className="new-project-file-remove" aria-label={`移除 ${filename(file)}`} title={zh.common.remove} disabled={busy}
                    onClick={() => removeFootage(index)}><Icon name="x" size={11} /></button>
                </li>)}
              </ul>
              {/* Said only when audio leaves this computer or can't be transcribed: local transcription is the quiet default. */}
              {notice && !local && <p className="mt-2 text-[12px] text-muted">{notice}</p>}
            </>}
            <InlineError>{err}</InlineError>
          </Dropzone>
        </form>
      </Modal>
    </div>
  );
}
