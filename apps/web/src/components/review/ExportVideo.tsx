import { useEffect, useMemo, useState } from "react";
import { fullRenderContext, type RenderRequest } from "@scarlet/shared";
import { captionExportHasCues, captionTracks, handoffLosses, NO_CAPTION_TRACK, NO_CAPTIONS_IN_RANGE, snapToFrame, timelineDuration, usedMedia } from "@scarlet/timeline";
import { errorMessage, IS_MOCK } from "../../lib/client";
import { desktop } from "../../lib/desktop";
import { exportCounting, exportFailureSeen, exportFile, PICTURE_DONE, useExports, type ExportFile } from "../../lib/exportJobs";
import { clock, fmtBytes, pct, playbackClock } from "../../lib/format";
import { useProjectStore, type ProjectData } from "../../stores/project";
import { ActivityProgress, Field, Icon, InlineError, Modal } from "../ui/primitives";
import { PreferenceSelect } from "../ui/PreferenceSelect";
import { zh } from "../../lib/zh";

type ExportQuality = RenderRequest["quality"] | "best";

/** The export's quality levels, smallest first. Original quality encodes in software; High uses the computer's video encoder. */
/** While the loaded timeline is behind the project's head, caption export waits for it. */
export const LOADING_LATEST_EDIT = "Loading the latest edit before exporting captions…";

const QUALITY: Record<ExportQuality, { label: string; hint: string }> = {
  preview: { label: zh.export.compressed, hint: "适合分享草稿的较小文件，画面更柔和。" },
  delivery: { label: zh.export.high, hint: "画面接近原片，文件更小。" },
  best: { label: zh.export.original, hint: "保留原片质量，适合继续编辑或调色。" },
};

function parseClock(value: string): number {
  if (!/^(?:\d+:)?(?:\d+:)?\d+(?:\.\d+)?$/.test(value.trim())) return NaN;
  const parts = value.trim().split(":").map(Number);
  if (parts.slice(1).some(part => part >= 60)) return NaN;
  return parts.reduce((seconds, part) => seconds * 60 + part, 0);
}

export function ExportSheet({ hasCut, onClose }: { hasCut: boolean; onClose(): void }) {
  const current = useProjectStore(s => s.current);
  return current && <ExportForm key={current.id} current={current} hasCut={hasCut} onClose={onClose} />;
}

function ExportForm({ current, hasCut, onClose }: { current: ProjectData; hasCut: boolean; onClose(): void }) {
  const { project } = current;
  const job = useExports(s => s.jobs[current.id]);
  const busy = job && "cancel" in job ? job : undefined;
  const running = busy?.phase === "rendering" || busy?.phase === "saving";
  const { width, height, fps } = busy?.projectSettings ?? project.settings;
  // The video as it is now. An edit applied while the sheet is open is the one exported: the sheet follows it.
  const context = fullRenderContext(project);
  const duration = useMemo(() => current.timeline ? snapToFrame(timelineDuration(current.timeline), fps) : 0, [current.timeline, fps]);
  const previous = busy?.file ?? (job?.phase === "failed" && job.context === context ? job.file : undefined);
  const exported = job?.phase === "done" ? job : undefined;
  const exportedCurrentEdit = exported?.context === context;
  // Advanced export: the folder for finishing the edit in another app. Otherwise the video or its captions.
  const [advanced, setAdvanced] = useState(previous?.format === "folder");
  const [plainFormat, setPlainFormat] = useState<"mp4" | "srt" | "vtt">(previous?.format === "srt" || previous?.format === "vtt" ? previous.format : "mp4");
  const format: ExportFile["format"] = advanced ? "folder" : plainFormat;
  const captions = format === "srt" || format === "vtt";
  const captionTrackChoices = useMemo(() => (current.timeline?.tracks ?? []).filter(t => t.kind === "caption" && !t.hidden), [current.timeline]);
  const [trackId, setTrackId] = useState(() => previous?.trackId && captionTrackChoices.some(t => t.id === previous.trackId) ? previous.trackId : captionTrackChoices[0]?.id ?? "");
  useEffect(() => {
    if (!captionTrackChoices.some(t => t.id === trackId)) setTrackId(captionTrackChoices[0]?.id ?? "");
  }, [captionTrackChoices, trackId]);
  const [customRange, setCustomRange] = useState(!!previous?.video.range);
  const [start, setStart] = useState(() => playbackClock(previous?.video.range?.start ?? 0));
  const [end, setEnd] = useState(() => playbackClock(previous?.video.range?.end ?? duration));
  // Until a range is picked, it would start as the whole video at the length it has now.
  useEffect(() => {
    if (customRange) return;
    setStart(playbackClock(0));
    setEnd(playbackClock(duration));
  }, [duration]); // eslint-disable-line react-hooks/exhaustive-deps
  const [targetHeight, setTargetHeight] = useState(previous?.video.exportOptions?.height ?? 0);
  const [quality, setQuality] = useState<ExportQuality>(previous?.video.exportOptions?.bestQuality ? "best" : previous?.video.quality ?? "delivery");
  const [revealError, setRevealError] = useState("");
  // A percent shows only while it moves.
  const counting = !!busy && exportCounting(busy);
  // An export that stopped is explained here, so the menu's mark for it goes once this is open.
  const failed = job?.phase === "failed";
  useEffect(() => { if (failed) exportFailureSeen(current.id); }, [failed, current.id]);
  const range = format !== "folder" && customRange ? { start: snapToFrame(parseClock(start), fps), end: snapToFrame(parseClock(end), fps) } : undefined;
  const invalidRange = range && !(range.start >= 0 && range.end > range.start && range.end <= duration);
  const custom = format === "mp4" && (!!range || !!targetHeight || quality !== "delivery");
  const level = QUALITY[quality];
  const sampleOnly = IS_MOCK && custom;
  // The track picker reads the loaded timeline, and the export asks for the project's head. Until the two are the
  // same version, a track picked here may not be in the version that would be saved.
  const timelineBehind = captions && current.timeline?.version !== project.head;
  const noCaptionTrack = captions && captionTrackChoices.length === 0;
  // The picker can still hold a trackId after that track is gone; the effect below
  // clears it, but this render must not throw track_not_found first.
  const exportTrackId = captionTrackChoices.some(t => t.id === trackId) ? trackId : undefined;
  const noCaptionsInRange = captions && !noCaptionTrack && !invalidRange && current.timeline
    ? !captionExportHasCues(current.timeline, { trackId: exportTrackId, range })
    : false;
  const handoff = useMemo(() => {
    if (!current.timeline) return undefined;
    const used = usedMedia(project, current.timeline);
    const sizes = used.map(m => m.fingerprintStamp?.size);
    return {
      bytes: sizes.every(size => size !== undefined) ? sizes.reduce((a, b) => a + b!, 0) : undefined,
      files: used.length,
      captions: captionTracks(current.timeline).length > 0,
      losses: handoffLosses(project, current.timeline),
    };
  }, [project, current.timeline]);
  const invalid = !hasCut || !duration || invalidRange || sampleOnly || timelineBehind || noCaptionTrack || noCaptionsInRange;
  const size = targetHeight ? `${Math.round(width * targetHeight / height / 2) * 2} × ${targetHeight}` : "Project size";
  const submit = () => {
    if (busy || invalid) return;
    const video: ExportFile["video"] = { kind: custom ? "export" : "full", quality: quality === "best" ? "delivery" : quality };
    if (range) video.range = range;
    if (targetHeight || quality === "best") {
      video.exportOptions = { ...(targetHeight ? { height: targetHeight } : {}), ...(quality === "best" ? { bestQuality: true } : {}) };
    }
    setRevealError("");
    // The file is named once, in the system's Save dialog, which also picks its folder and asks before replacing a
    // file. It opens on the project's name.
    const stem = project.name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Scarlet";
    const name = format === "folder" ? stem : `${stem}.${format}`;
    void exportFile(current, { format, name, video, ...(captions && exportTrackId ? { trackId: exportTrackId } : {}) });
  };
  const switchTo = !busy && !exportedCurrentEdit && <button type="button" className="btn-quiet mr-auto" onClick={() => setAdvanced(!advanced)}>
    {advanced ? zh.export.back : zh.export.advanced}
  </button>;
  return <Modal open title={advanced ? zh.export.advanced : zh.terms.export} width={600} onClose={onClose} footer={running ? <>
    {busy.phase === "rendering" && <button type="button" className="btn-quiet" onClick={busy.cancel}>取消导出</button>}
    <button type="button" className="btn-primary" onClick={onClose}>{zh.export.continueEditing}</button>
  </> : <>
    {switchTo}
    <button type="button" className="btn-ghost" onClick={onClose}>{busy || exportedCurrentEdit ? zh.export.close : zh.common.cancel}</button>
    <button type="submit" form="export-working-cut" className="btn-primary" data-log-control="export" disabled={!!busy || !!invalid}>
      {failed ? zh.export.retry : zh.terms.export}
    </button>
  </>}>
    <form id="export-working-cut" onSubmit={event => { event.preventDefault(); submit(); }}>
      <fieldset disabled={!!busy} className="min-w-0">
        {advanced ? <HandoffSummary summary={handoff} /> : <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Field label={zh.export.format} htmlFor="export-format">
            <PreferenceSelect id="export-format" value={plainFormat} onChange={setPlainFormat}
              options={[
                { value: "mp4", label: `${zh.export.video} (.mp4)` },
                { value: "srt", label: `${zh.export.captions} (.srt)` },
                { value: "vtt", label: `${zh.export.captions} (.vtt)` },
              ]} />
          </Field>
          <Field label={zh.export.range} htmlFor="export-range">
            <PreferenceSelect id="export-range" value={customRange ? "custom" : "whole"}
              onChange={value => setCustomRange(value === "custom")} options={[{ value: "whole", label: zh.export.whole }, { value: "custom", label: zh.export.custom }]} />
          </Field>
          {range && <div className="hidden sm:block" />}
          {range && <>
            <Field label="从" htmlFor="export-start"><input className="field tnum" id="export-start" value={start} onChange={e => setStart(e.target.value)} /></Field>
            <Field label="到" htmlFor="export-end"><input className="field tnum" id="export-end" value={end} onChange={e => setEnd(e.target.value)} /></Field>
          </>}
          {captions && captionTrackChoices.length > 1 && <Field label={zh.export.track} htmlFor="export-track">
            <PreferenceSelect id="export-track" value={trackId} onChange={setTrackId}
              options={captionTrackChoices.map(track => ({ value: track.id, label: track.name }))} />
          </Field>}
        </div>}
        {format === "mp4" ? <details className="border-t border-line pt-3">
          <summary className="cursor-pointer text-xs"><strong>{zh.export.options}</strong><span className="ml-2 text-muted">{size} · {Number(fps.toFixed(3))} fps · {level.label}</span></summary>
          <div className="mt-4 grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            <Field label={zh.export.resolution} htmlFor="export-resolution">
              <PreferenceSelect id="export-resolution" value={targetHeight} onChange={setTargetHeight} options={[
                { value: 0, label: `Project · ${width} × ${height}` },
                ...[2160, 1080, 720, 480].filter(h => h < height).map(h => ({ value: h, label: `${Math.round(width * h / height / 2) * 2} × ${h}` })),
              ]} />
            </Field>
            <Field label={zh.export.quality} htmlFor="export-quality" hint={level.hint}>
              <PreferenceSelect id="export-quality" value={quality} onChange={setQuality}
                options={(Object.keys(QUALITY) as ExportQuality[]).map(value => ({ value, label: QUALITY[value].label }))} />
            </Field>
          </div>
        </details> : null}
      </fieldset>
    </form>
    {!running && timelineBehind && <p className="mt-3 text-xs text-muted" role="status">{LOADING_LATEST_EDIT}</p>}
    {!running && <InlineError>{noCaptionTrack ? NO_CAPTION_TRACK :
      noCaptionsInRange ? NO_CAPTIONS_IN_RANGE :
      !hasCut ? "There’s no video to export yet." :
      invalidRange ? `Enter a range between 0:00 and ${playbackClock(duration)}, at least one frame long.` : sampleOnly ? "The isolated demo saves its included MP4. Custom video settings are available in library projects." : ""}</InlineError>}
    {busy && <div className="mt-3">
      {busy.phase === "choosing" ? <p className="text-xs text-muted" role="status">{zh.export.chooseLocation}</p> :
        <ActivityProgress label={`Export progress for ${busy.file.name}`} value={counting ? busy.progress : undefined}>
          {busy.phase === "saving" ? (busy.file.format === "folder" ? zh.export.saveFolder : zh.export.saveFile) : busy.waiting ? zh.export.waiting : Math.round(busy.progress * 100) >= PICTURE_DONE ? zh.export.finishing
            : `${zh.export.exporting}${busy.context !== context ? `（${zh.export.earlier}）` : ""}${counting ? ` · ${pct(busy.progress)}` : ""}`}
        </ActivityProgress>}
      {running && <p className="mt-2 text-xs text-muted">{zh.export.background}</p>}
    </div>}
    {exported && <p className="mt-3 flex items-center gap-2 text-xs" role="status">
      {exportedCurrentEdit && <Icon name="check" />}
      <span className="truncate" title={exported.path} data-log-private>{exported.path.split(/[\\/]/).pop()}</span>
      {!exportedCurrentEdit && <span className="shrink-0 text-muted">· {zh.export.earlier}</span>}
      <button className="btn-quiet shrink-0" data-log-control="reveal-export" onClick={() => { setRevealError(""); void desktop.revealPath(exported.path).catch(e => setRevealError(errorMessage(e))); }}>{zh.export.showInFolder}</button>
    </p>}
    <InlineError>{(failed || revealError) && <span data-log-private>{failed ? job.error : revealError}</span>}</InlineError>
  </Modal>;
}

const SHOWN_LOSSES = 4;

/** What the folder holds and what another app won't show as Scarlet does. */
function HandoffSummary({ summary }: { summary?: { bytes?: number; files: number; captions: boolean; losses: Array<{ at?: number; what: string }> } }) {
  if (!summary) return null;
  const { losses } = summary;
  return <div className="text-xs">
    <p className="text-muted">{zh.export.folderSummary}</p>
    <ul className="mt-2 list-disc space-y-1 pl-4">
      <li>{zh.export.timeline}：剪点、轨道、缩放、音量、淡入淡出、标记和图形</li>
      <li>{zh.export.footage}{summary.files ? <span className="text-muted"> · {summary.files} {summary.files === 1 ? "file" : "files"}{summary.bytes !== undefined ? `, ${fmtBytes(summary.bytes)}` : ""}</span> : null}</li>
      {summary.captions && <li>字幕文件（SubRip）</li>}
      <li>{zh.export.readme}</li>
    </ul>
    {losses.length > 0 && <>
      <p className="mt-3 text-muted">{zh.export.notCarried}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        {losses.slice(0, SHOWN_LOSSES).map((loss, i) => <li key={i}>{loss.at !== undefined && <span className="tnum text-muted">{clock(loss.at)} </span>}{loss.what}</li>)}
        {losses.length > SHOWN_LOSSES && <li className="text-muted">{losses.length - SHOWN_LOSSES} more, listed in the Read me</li>}
      </ul>
    </>}
  </div>;
}
