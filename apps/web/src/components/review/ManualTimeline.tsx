import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  clipDuration, clipEnd, formatTimecode, makeMediaClip, makeTrack, snapToFrame,
  timelineDuration, trimHead, trimTail,
  type Clip, type MediaAsset, type Timeline, type TimelineOp,
} from "@scarlet/timeline";
import { player } from "../../lib/player";
import { usePlayerStore } from "../../stores/player";
import { PreferenceSelect } from "../ui/PreferenceSelect";
import { ManualAudioControls } from "./ManualAudioControls";
import { ManualCaptionControls } from "./ManualCaptionControls";
import { useManualEdits } from "./useManualEdits";

const trackNames = { video: "画面", audio: "音频", caption: "字幕" };
const toolClass = "btn-quiet whitespace-nowrap";

function clipName(clip: Clip, media: ReadonlyMap<string, MediaAsset>) {
  if (clip.kind === "caption") return clip.text;
  if (clip.kind === "color") return clip.label || "色板";
  return clip.label || media.get(clip.mediaId)?.name || "素材";
}

export function ManualTimeline({ open, projectId, timeline, media, fps, canEdit, onClose, onMedia, onAddFirstVideo }: {
  open: boolean;
  projectId: string;
  timeline?: Timeline;
  media: MediaAsset[];
  fps: number;
  canEdit: boolean;
  onClose(): void;
  onMedia(): void;
  onAddFirstVideo?(): Promise<void>;
}) {
  const cursorSeconds = usePlayerStore(state => open ? state.time : 0);
  const { apply, undo, redo, canUndo, canRedo, busy, error } = useManualEdits(projectId, timeline);
  const [selectedId, setSelectedId] = useState<string>();
  const [visualId, setVisualId] = useState("");
  const [dragged, setDragged] = useState<string>();
  const dragOffset = useRef(0);
  const [moveError, setMoveError] = useState("");
  const [addingFirstVideo, setAddingFirstVideo] = useState(false);
  const seconds = useMemo(() => timeline ? timelineDuration(timeline) : 0, [timeline]);
  const mediaById = useMemo(() => new Map(media.map(asset => [asset.id, asset])), [media]);
  const visualAssets = useMemo(() => media.filter(asset =>
    (!asset.status || asset.status === "ready") &&
    (asset.kind === "image" || (asset.kind === "video" && (asset.duration ?? 0) >= 1 / fps))
  ), [media, fps]);

  if (!open) return null;
  const duration = Math.max(seconds, 1 / fps);
  const at = snapToFrame(cursorSeconds, fps);
  const track = timeline?.tracks.find(row => row.clips.some(clip => clip.id === selectedId));
  const selected = track?.clips.find(clip => clip.id === selectedId);
  const visual = visualAssets.find(asset => asset.id === visualId);
  const v1 = timeline?.tracks.find(row => row.id === "v1" && row.kind === "video");
  const firstVideo = visualAssets.find(asset => asset.kind === "video");
  const canAddFirstVideo = !!v1 && v1.clips.length === 0 && !!firstVideo && (firstVideo.duration ?? 0) >= 1 / fps;
  const disabled = !timeline || !canEdit || busy;
  const start = selected?.timelineIn ?? 0;
  const end = selected ? clipEnd(selected) : 0;
  const selectedAsset = selected?.kind === "media" ? mediaById.get(selected.mediaId) : undefined;
  const canCut = !!selected && at - start >= 0.999 / fps && end - at >= 0.999 / fps;

  function submit(ops: TimelineOp[], label: string) {
    setMoveError("");
    return apply(ops, label);
  }

  async function addFirstVideo() {
    if (!onAddFirstVideo || addingFirstVideo) return;
    setMoveError("");
    setAddingFirstVideo(true);
    try {
      await onAddFirstVideo();
    } catch (cause) {
      setMoveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAddingFirstVideo(false);
    }
  }

  function seek(time: number) {
    player.pause();
    player.seek(snapToFrame(Math.max(0, Math.min(seconds, time)), fps), true);
  }

  function trim(fromStart: boolean) {
    if (!selected || !canCut) return;
    const cropped = fromStart ? trimHead(selected, at) : trimTail(selected, at);
    void submit([{ op: "updateClip", clipId: selected.id, patch: cropped }],
      fromStart ? "裁掉片头" : "裁掉片尾");
  }

  function move(clipId: string, position: number) {
    if (disabled || !timeline) return;
    const lane = timeline.tracks.find(row => row.clips.some(clip => clip.id === clipId));
    const clip = lane?.clips.find(item => item.id === clipId);
    if (!lane || !clip) return;
    const time = Math.max(0, snapToFrame(position, fps));
    if (Math.abs(clip.timelineIn - time) < 0.000001) return;
    const right = time + clipDuration(clip);
    if (lane.clips.some(item => item.id !== clipId
      && item.timelineIn < right - 0.000001 && clipEnd(item) > time + 0.000001)) {
      setMoveError("该时段已有同轨片段。请选择空白位置，或与相邻片段换序。");
      return;
    }
    void submit([{ op: "moveClip", clipId, timelineIn: time }], "移动片段");
  }

  function adjacent(direction: -1 | 1) {
    if (!track || !selected) return;
    const ordered = [...track.clips].sort((a, b) => a.timelineIn - b.timelineIn);
    const index = ordered.findIndex(clip => clip.id === selected.id);
    const neighbor = ordered[index + direction];
    if (!neighbor) return;
    const [first, second] = direction === -1 ? [neighbor, selected] : [selected, neighbor];
    if (clipEnd(first) > second.timelineIn + 0.000001) return;
    if ([first, second, ordered[Math.max(index, index + direction) + 1]].some(item =>
      item?.kind === "media" && item.transitionIn)) return;
    return { first, second };
  }

  function swap(direction: -1 | 1) {
    const pair = adjacent(direction);
    if (!pair) return;
    const { first, second } = pair;
    const newFirstStart = clipEnd(second) - clipDuration(first);
    void submit([
      { op: "moveClip", clipId: second.id, timelineIn: first.timelineIn },
      { op: "moveClip", clipId: first.id, timelineIn: newFirstStart },
    ], "调整片段顺序");
  }

  function positionVisual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected?.kind !== "media") return;
    const values = new FormData(event.currentTarget);
    const x = Number(values.get("x")) / 100;
    const y = Number(values.get("y")) / 100;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x === (selected.transform?.x ?? 0) && y === (selected.transform?.y ?? 0)) return;
    void submit([{ op: "updateClip", clipId: selected.id, patch: { transform: { ...selected.transform, x, y } } }], "调整画面位置");
  }

  async function addVisual() {
    if (!visual) return;
    const lane = makeTrack("video", "补画面");
    const sourceLength = visual.kind === "image" ? 3 : visual.duration ?? 0;
    const length = seconds > at && seconds - at >= 1 / fps ? Math.min(sourceLength, seconds - at) : sourceLength;
    if (length < 1 / fps) return;
    const clip = makeMediaClip(visual.id, 0, length, at, { label: visual.name, volume: 0 });
    if (await submit([{ op: "addTrack", track: lane }, { op: "addClip", trackId: lane.id, clip }], "添加补画面")) {
      setSelectedId(clip.id);
    }
  }

  return <section className="flex max-h-[44%] min-h-32 shrink-0 flex-col gap-2 overflow-auto border-t border-line bg-panel px-4 py-3" aria-label="手动剪辑">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="mr-auto font-medium">手动剪辑</h2>
      <button type="button" className={toolClass} disabled={disabled || !canUndo} onClick={() => void undo()}>撤销</button>
      <button type="button" className={toolClass} disabled={disabled || !canRedo} onClick={() => void redo()}>重做</button>
      <button type="button" className={toolClass} onClick={onClose}>关闭</button>
    </div>
    {!canEdit && timeline && <p role="status">回到当前成片的预览后即可编辑。</p>}
    {!timeline && <>
      <p role="status">导入素材后即可编辑时间线。</p>
      <button type="button" className={toolClass} disabled={!onAddFirstVideo || addingFirstVideo}
        onClick={() => void addFirstVideo()}>
        {addingFirstVideo ? "正在添加…" : "将首个视频添加到 V1"}
      </button>
    </>}
    {timeline && canAddFirstVideo && <button type="button" className={toolClass} disabled={disabled || addingFirstVideo}
      onClick={() => {
        if (!v1 || !firstVideo || !(firstVideo.duration && firstVideo.duration >= 1 / fps)) return;
        void submit([{ op: "addClip", trackId: v1.id, clip: makeMediaClip(firstVideo.id, 0, firstVideo.duration, 0, { label: firstVideo.name }) }], "将首个视频添加到 V1");
      }}>
      将首个视频添加到 V1
    </button>}
    {busy && <p role="status">正在保存剪辑…</p>}
    {(error || moveError) && <p className="simple-error" role="alert">{error || moveError}</p>}
    {timeline && <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={toolClass} disabled={!canEdit || at <= 0}
          onClick={() => seek(at - 1 / fps)} aria-label="上一帧">−1 帧</button>
        <output className="tabular-nums" aria-label="播放头时间">{formatTimecode(at, fps)}</output>
        <button type="button" className={toolClass} disabled={!canEdit || at >= seconds}
          onClick={() => seek(at + 1 / fps)} aria-label="下一帧">+1 帧</button>
        <button type="button" className={toolClass} disabled={disabled || !canCut}
          onClick={() => selected && void submit([{ op: "splitClip", clipId: selected.id, at }], "切分片段")}>切分</button>
        <button type="button" className={toolClass} disabled={disabled || !canCut} onClick={() => trim(true)}>裁片头</button>
        <button type="button" className={toolClass} disabled={disabled || !canCut} onClick={() => trim(false)}>裁片尾</button>
        <button type="button" className={toolClass} disabled={disabled || !selected}
          onClick={() => selected && move(selected.id, at)}>移到播放头</button>
        <button type="button" className={toolClass} disabled={disabled || !adjacent(-1)} onClick={() => swap(-1)}>前移一段</button>
        <button type="button" className={toolClass} disabled={disabled || !adjacent(1)} onClick={() => swap(1)}>后移一段</button>
        <button type="button" className={toolClass} disabled={disabled || !selected}
          onClick={() => selected && void submit([{ op: "removeClip", clipId: selected.id }], "删除片段")}>删除</button>
      </div>
      <div className="grid min-w-0 gap-1" aria-label="轨道">
        {timeline.tracks.map(lane => <div key={lane.id} className="flex min-w-0 items-center gap-2">
          <span className="w-24 shrink-0 truncate text-sm" title={lane.name}>{trackNames[lane.kind]} · {lane.name}</span>
          <div className="relative h-7 min-w-0 flex-1 overflow-hidden rounded border border-line bg-bg"
            onDragOver={event => { if (!disabled && dragged && lane.clips.some(clip => clip.id === dragged)) event.preventDefault(); }}
            onDrop={event => {
              if (disabled || !dragged || !lane.clips.some(clip => clip.id === dragged)) return;
              event.preventDefault();
              const box = event.currentTarget.getBoundingClientRect();
              move(dragged, duration * (event.clientX - box.left - dragOffset.current) / box.width);
              setDragged(undefined);
            }}>
            <button type="button" className="absolute inset-0 w-full" disabled={!canEdit}
              aria-label={`${lane.name} 定位播放头`} onClick={event => {
                const box = event.currentTarget.getBoundingClientRect();
                seek(event.detail ? duration * (event.clientX - box.left) / box.width : 0);
              }} />
            {lane.clips.map(clip => {
              const name = clipName(clip, mediaById);
              return <button key={clip.id} type="button" draggable={!disabled} aria-pressed={clip.id === selectedId}
                className="absolute inset-y-0 min-w-1 truncate rounded border border-line bg-panel px-1 text-left text-xs hover:brightness-125 aria-pressed:border-current aria-pressed:font-semibold"
                style={{ left: `${100 * clip.timelineIn / duration}%`, width: `${100 * clipDuration(clip) / duration}%` }}
                title={`${name} · ${formatTimecode(clip.timelineIn, fps)}`}
                onClick={() => { setSelectedId(clip.id); if (canEdit) seek(clip.timelineIn); }}
                onDragStart={event => {
                  dragOffset.current = event.clientX - event.currentTarget.getBoundingClientRect().left;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", clip.id);
                  setDragged(clip.id);
                  setSelectedId(clip.id);
                }}
                onDragEnd={() => setDragged(undefined)}>{name}</button>;
            })}
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-current"
              style={{ left: `${Math.min(99.9, 100 * at / duration)}%` }} />
          </div>
        </div>)}
      </div>
      <details>
        <summary className="cursor-pointer text-sm">画面素材</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PreferenceSelect compact label="选择画面素材" value={visualId}
            options={visualAssets.map(asset => ({ value: asset.id, label: asset.name }))}
            onChange={setVisualId} disabled={disabled} valueLabel={visual?.name ?? "选择画面素材"} />
          <button type="button" className={toolClass} disabled={disabled || !visual}
            onClick={() => void addVisual()}>加到播放头</button>
          <button type="button" className={toolClass} onClick={onMedia}>导入素材</button>
        </div>
        {selected?.kind === "media" && track?.kind === "video" && selectedAsset?.kind !== "audio"
          && <form key={`${timeline.version}/${selected.id}`} className="mt-2 flex flex-wrap items-center gap-2" onSubmit={positionVisual}>
            <label className="flex items-center gap-1">水平位置（%）
              <input name="x" type="number" required step="any" defaultValue={100 * (selected.transform?.x ?? 0)}
                className="w-20 rounded border border-line bg-bg px-2 py-1" disabled={disabled} />
            </label>
            <label className="flex items-center gap-1">垂直位置（%）
              <input name="y" type="number" required step="any" defaultValue={100 * (selected.transform?.y ?? 0)}
                className="w-20 rounded border border-line bg-bg px-2 py-1" disabled={disabled} />
            </label>
            <button type="submit" className={toolClass} disabled={disabled}>应用位置</button>
          </form>}
      </details>
      <ManualCaptionControls timeline={timeline} cursorSeconds={at} fps={fps} disabled={disabled} onApply={submit} />
      <ManualAudioControls timeline={timeline} media={media} cursorSeconds={at} fps={fps} disabled={disabled} onApply={submit} />
    </>}
  </section>;
}
