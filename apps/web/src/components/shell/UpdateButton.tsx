import { clearUpdatePlace, saveUpdatePlace } from "../../lib/updatePlace";
import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { desktop } from "../../lib/desktop";
import { buildPercent, refreshUpdateStatus, useUpdateStatus } from "../../lib/updateStatus";
import { changesSince, parseChangelog, plainChange } from "../../lib/changelog";
import { shellZh } from "../../lib/zh-shell";

const RING = 2 * Math.PI * 5;
const build = (revision: string) => <span className="font-mono">{revision.slice(0, 7)}</span>;
const MOST_CHANGES = 6;

// What each build's changelog adds to this one's, read once per build from the updater's checkout.
const changes = new Map<string, Promise<string[]>>();
function changesIn(revision: string) {
  let read = changes.get(revision);
  if (!read) {
    // Nothing read is not kept: the updater can name a build before its checkout has fetched it.
    read = desktop.updateChangelog(revision).then(text => text ? changesSince(parseChangelog(text)) : undefined, () => undefined)
      .then(list => { if (!list) changes.delete(revision); return list ?? []; });
    changes.set(revision, read);
  }
  return read;
}
/** How long the hover waits before reading again a build's changelog that wasn't there yet, and how many times. */
const REREAD_MS = 15_000, REREADS = 8;

function useChanges(revision: string) {
  const [found, setFound] = useState<{ revision: string; changes: string[] } | null>(null);
  const [reread, setReread] = useState(0);
  useEffect(() => setReread(0), [revision]);
  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void changesIn(revision).then(list => {
      if (!current) return;
      setFound({ revision, changes: list });
      if (!changes.has(revision) && reread < REREADS) timer = setTimeout(() => setReread(n => n + 1), REREAD_MS);
    });
    return () => { current = false; clearTimeout(timer); };
  }, [revision, reread]);
  return found?.revision === revision ? found.changes : [];
}

/**
 * What hovering the control says: which build it is about, which one is running now, what happens next, and what the
 * build brings, in the changelog's words.
 */
function UpdateHint({ id, revision, title, children }: { id: string; revision: string; title: ReactNode; children: ReactNode }) {
  const news = useChanges(revision);
  return <span id={id} role="tooltip" className="update-hint"><span>
    <span className="text-fg">{title}</span>
    <span>当前版本为 {__SCARLET_VERSION__}{__SCARLET_REVISION__ && <>，构建 {build(__SCARLET_REVISION__)}</>}.</span>
    {children}
    {news.length > 0 && <span className="update-hint-news">
      <span className="text-fg">{shellZh.changelog.whatsNew}</span>
      <ul>{news.slice(0, MOST_CHANGES).map(change => <li key={change}>{plainChange(change)}</li>)}</ul>
      {news.length > MOST_CHANGES && <span>安装后可在「设置 → 关于」查看其余 {news.length - MOST_CHANGES} 项更新。</span>}
    </span>}
  </span></span>;
}

// The restart belongs to the app, not to one copy of the control: it can only be started once.
// `about` is the build a refusal was about, so the reason goes when the updater offers another.
let restart = { restarting: false, error: "", about: null as string | null };
const watchers = new Set<() => void>();
const watch = (watcher: () => void) => { watchers.add(watcher); return () => { watchers.delete(watcher); }; };
function setRestart(next: Partial<typeof restart>) {
  restart = { ...restart, ...next };
  watchers.forEach(watcher => watcher());
}

/**
 * The update, as one small control. It appears when the updater starts building a new version and shows how far along
 * the build is. Once the build is verified it becomes the button that restarts into it. A newer build takes over the control
 * while it is under way. It sits at the top right of the window.
 */
export function UpdateButton() {
  const { ready, building, source } = useUpdateStatus();
  const release = source === "release";
  const { restarting, error: refused, about } = useSyncExternalStore(watch, () => restart);
  const error = about === ready ? refused : "";
  const [now, setNow] = useState(Date.now);
  const showProgress = !!building && building.revision !== ready && !restarting;
  const hint = useId();

  useEffect(() => {
    if (!showProgress) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [showProgress]);

  async function install() {
    if (!ready || restart.restarting) return;
    if (!window.dispatchEvent(new Event("beforeunload", { cancelable: true }))) {
      setRestart({ error: "请先保存更改再重启。", about: ready });
      return;
    }
    setRestart({ restarting: true, error: "" });
    try {
      saveUpdatePlace();
      await desktop.restartForUpdate(ready);
    } catch (err) {
      clearUpdatePlace();
      setRestart({ restarting: false, error: err instanceof Error ? err.message : String(err), about: ready });
      refreshUpdateStatus();
    }
  }

  if (restarting || (ready && !showProgress)) return <aside className="update-control update-corner" aria-label={shellZh.updates.update}
    onPointerLeave={() => { if (error) setRestart({ error: "" }); }} onBlur={() => { if (error) setRestart({ error: "" }); }}>
    <button type="button" className="update-button" disabled={restarting} onClick={install}
      aria-describedby={ready && !error ? hint : undefined}>
      <span className="update-button-dot" aria-hidden="true" />
      {restarting ? "正在重启…" : "重启并更新"}
    </button>
    {error ? <span role="alert" className="update-button-error">{error}</span>
      : ready && <UpdateHint id={hint} revision={ready} title={release ? <>版本 {ready} 已就绪</> : <>构建 {build(ready)} 已就绪</>}>
        <span>重启会安装更新并返回此处，Scarlet 正在处理的剪辑会从中断处继续。</span>
      </UpdateHint>}
  </aside>;
  if (!building) return null;
  const percent = buildPercent(building, now);
  return <aside className="update-control update-corner" aria-label={shellZh.updates.update}>
    <span role="status" className="update-button" aria-label={`正在更新 Scarlet, ${percent}% ${release ? "已下载" : "已构建"}`} aria-describedby={hint}>
      <svg className="update-button-ring" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="5" />
        <circle cx="7" cy="7" r="5" strokeDasharray={RING} strokeDashoffset={RING * (1 - percent / 100)} />
      </svg>
      更新中
      <span className="update-button-figure">{percent}%</span>
    </span>
    <UpdateHint id={hint} revision={building.revision} title={release ? <>正在更新至版本 {building.revision}</> : <>正在更新至构建 {build(building.revision)}</>}>
      <span>Scarlet 正在后台{release ? "下载" : "构建"}更新。你可以继续编辑，更新就绪后即可重启安装。</span>
    </UpdateHint>
  </aside>;
}
