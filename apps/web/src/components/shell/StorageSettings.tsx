import { useEffect, useState } from "react";
import type { StorageCleanup } from "@scarlet/shared";
import { api, errorMessage } from "../../lib/client";
import { desktop, type DeveloperStorage } from "../../lib/desktop";
import { fmtBytes, trashedLine } from "../../lib/format";
import { freedSpace, invalidateStorageScan, lastStorageScan, scanStorage, type MeasuredProject } from "../../lib/storage";
import { ConfirmDialog, InlineError, SectionTitle } from "../ui/primitives";
import { shellZh } from "../../lib/zh-shell";

const total = (rows: {bytes: number}[]) => fmtBytes(rows.reduce((sum,r) => sum + r.bytes, 0));

function DeveloperCaches() {
  const [rows, setRows] = useState<DeveloperStorage[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true); setError("");
    try { setRows(await desktop.developerStorage()); } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  };
  return <section className="card p-5 space-y-3" aria-label={shellZh.storage.developerCaches}>
    <div className="flex items-center justify-between gap-3"><SectionTitle>{shellZh.storage.developerCaches}</SectionTitle>
      <button className="btn-quiet" disabled={loading} onClick={() => void load()}>{loading ? "正在扫描…" : "扫描文件夹"}</button></div>
    <p className="text-sm text-muted">{shellZh.storage.developerHint}</p>
    {error && <InlineError>{error}</InlineError>}
    {rows?.length === 0 && <p className="text-sm text-muted">{shellZh.storage.noFolders}</p>}
    {rows?.map(r => <div className="flex items-center gap-4 border-t border-line py-2" key={r.kind+r.path}>
      <div className="min-w-0 flex-1"><b className="text-sm">{r.kind === "cargo" ? "编译器缓存" : "测试工作区"}</b>
        <div className="break-all text-xs text-muted">{r.path}</div></div>
      <span className="text-sm tabular-nums">{r.estimated ? "≈ " : ""}{fmtBytes(r.bytes)}</span>
      <button className="btn-quiet" onClick={() => void desktop.revealPath(r.path).catch(e => setError(errorMessage(e)))}>{shellZh.storage.showFolder}</button>
    </div>)}
  </section>;
}

export function StorageSettings() {
  const [scan, setScan] = useState(lastStorageScan);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selection, select] = useState<{kind: StorageCleanup["kind"]; rows: MeasuredProject[]}>();
  async function refresh() {
    setLoading(true); setError("");
    try { setScan(await scanStorage()); } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  const trash = scan?.projects.filter(p => p.deletedAt) ?? [];
  const active = scan?.projects.filter(p => !p.deletedAt) ?? [];
  const eligible = scan?.projects.filter(p => !p.busy && !p.missingSource) ?? [];
  const lock = loading || !!error;
  return <div className="space-y-4">
    <section className="card p-5" aria-label={shellZh.storage.overview}>
      {/* The figure is what the two lists under it can give back, not what the projects take up. */}
      <div className="flex items-center justify-between gap-3"><SectionTitle>{shellZh.storage.free}</SectionTitle>
        <button className="btn-quiet" disabled={loading} onClick={() => void refresh()}>{loading ? "正在扫描…" : "重新扫描"}</button></div>
      <div className="text-3xl font-semibold tabular-nums">{scan ? total(eligible) : "—"}</div>
      <p className="text-sm text-muted">{eligible.some(p => p.estimated) ? "预计可释放的空间。共享存储可能使实际释放空间减少。" : "来自无任务正在运行的项目。"}</p>
    </section>
    {error && <InlineError>{error}</InlineError>}{notice && <p role="status" className="text-sm">{notice}</p>}
    {[{kind:"cache" as const,title:"渲染缓存",rows:active},
      {kind:"trash" as const,title:"废纸篓",rows:trash,body:"项目会在这里保留 30 天。清空废纸篓会永久删除其中的剪辑和导入的素材。"}].map(group =>
      <section className="card p-5 space-y-3" key={group.kind} aria-label={group.title}>
        <div className="flex items-center justify-between gap-3"><SectionTitle>{group.title}</SectionTitle>
          {group.kind === "trash" && trash.length > 0 && <button className="btn-ghost" disabled={lock || trash.some(p => p.busy)} onClick={() => select({kind:"trash",rows:trash})}>{shellZh.storage.emptyTrash}</button>}</div>
        {group.body && <p className="text-sm text-muted">{group.body}</p>}
        {scan && !group.rows.length && <p className="text-sm text-muted">{group.kind === "trash" ? "废纸篓为空。" : "项目库中暂无项目。"}</p>}
        {group.rows.map(p => <div key={p.id} className="flex items-center gap-3 border-t border-line py-2">
          <div className="min-w-0 flex-1"><div className="break-words text-sm font-medium">{p.name}</div>
          <span className="text-xs text-muted">{p.busy ? "任务运行期间暂停清理" : p.missingSource ? "重新连接缺失素材后可清除此缓存" : p.deletedAt ? trashedLine(p.deletedAt, p.purgeAt) : `${p.files} 个缓存文件`}</span></div>
          <span className="text-sm tabular-nums">{p.estimated ? "≈ " : ""}{fmtBytes(p.bytes)}</span>
          {group.kind === "cache" && <button className="btn-quiet" disabled={lock || p.busy || p.missingSource || !p.files} onClick={() => select({kind:"cache", rows:[p]})}>{shellZh.storage.clearCache}</button>}
        </div>)}
      </section>)}
    {import.meta.env.DEV && <DeveloperCaches />}
    {selection && <ConfirmDialog open danger={selection.kind === "trash"} onClose={() => select(undefined)}
      title={selection.kind === "trash" ? "清空废纸篓？" : "清除渲染缓存？"}
      body={selection.kind === "trash" ? `永久删除${selection.rows.map(r => r.name).join("、")}？${freedSpace(selection.rows) ? `可释放 ${freedSpace(selection.rows)}。` : ""}此操作无法撤销。` : `清除“${selection.rows[0]!.name}”的渲染缓存？Scarlet 可以使用项目素材重新生成。`}
      confirmLabel={selection.kind === "trash" ? "永久删除" : shellZh.storage.clearCache}
      onConfirm={async () => {
        // What the last cleanup said doesn't stand beside this one's failure.
        setNotice("");
        try {
          await api.cleanStorage({kind:selection.kind, projects:selection.rows.map(({id,deletedAt}) => ({id,deletedAt}))});
          setNotice(selection.kind === "trash" ? "废纸篓已清空。" : "渲染缓存已清除。");
        } finally { invalidateStorageScan(); await refresh(); }
      }}/>}
  </div>;
}
