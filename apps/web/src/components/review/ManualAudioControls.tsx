import { useId, useMemo, useState } from "react";
import {
  carriesAudio, clipEnd, formatTimecode, makeMediaClip, makeTrack, MAX_TIMELINE_SECONDS, trackDuration,
  type MediaAsset, type MediaClip, type Timeline, type TimelineOp,
} from "@scarlet/timeline";
import { PreferenceSelect } from "../ui/PreferenceSelect";

interface ManualAudioControlsProps {
  timeline: Timeline;
  media: readonly MediaAsset[];
  cursorSeconds: number;
  fps: number;
  disabled: boolean;
  onApply(ops: TimelineOp[], label: string): Promise<boolean>;
}

export function ManualAudioControls({ timeline, media, cursorSeconds, fps, disabled, onApply }: ManualAudioControlsProps) {
  const assetId = useId();
  const clipId = useId();
  const [selectedAsset, setSelectedAsset] = useState("");
  const [selectedClip, setSelectedClip] = useState("");
  const assets = useMemo(() => media.filter(asset =>
    asset.kind === "audio" && (!asset.status || asset.status === "ready") &&
    asset.duration !== undefined && Number.isFinite(asset.duration) && asset.duration > 0
  ), [media]);
  const clips = useMemo(() => {
    const mediaById = new Map(media.map(asset => [asset.id, asset]));
    return timeline.tracks.flatMap(track => track.clips.flatMap(clip => {
      const asset = clip.kind === "media" ? mediaById.get(clip.mediaId) : undefined;
      if (clip.kind !== "media" || !asset || !carriesAudio(asset)) return [];
      return [{
        clip,
        value: clip.id,
        label: clip.label || asset.name,
        detail: track.name + " · " + formatTimecode(clip.timelineIn, fps),
      }];
    }));
  }, [timeline.tracks, media, fps]);
  const videoEnd = useMemo(() => timeline.tracks.reduce((end, track) =>
    track.kind === "video" ? Math.max(end, trackDuration(track)) : end, 0
  ), [timeline.tracks]);

  const asset = assets.find(item => item.id === selectedAsset) ?? assets[0];
  const clip = (clips.find(item => item.value === selectedClip) ?? clips[0])?.clip;
  const timelineLimit = videoEnd || MAX_TIMELINE_SECONDS;
  const duration = Math.min(asset?.duration ?? 0, timelineLimit - cursorSeconds);

  async function addAudio() {
    if (!asset || !(duration > 0)) return;
    const end = cursorSeconds + duration;
    const audioTracks = timeline.tracks.filter(track => track.kind === "audio");
    const availableTrack = audioTracks.find(track => !track.muted && track.clips.every(clip =>
      !clip.enabled || clipEnd(clip) <= cursorSeconds || clip.timelineIn >= end
    ));
    const track = availableTrack ?? makeTrack("audio", "音频 " + (audioTracks.length + 1));
    const audio = makeMediaClip(asset.id, 0, duration, cursorSeconds, { label: asset.name });
    const ops: TimelineOp[] = [];
    if (!availableTrack) ops.push({ op: "addTrack", track });
    ops.push({ op: "addClip", trackId: track.id, clip: audio });
    if (await onApply(ops, "添加音频")) setSelectedClip(audio.id);
  }

  return <fieldset className="min-w-0 space-y-3" disabled={disabled}>
    <legend className="mb-1 text-[12px] font-medium text-muted">音频</legend>
    {asset ? <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <label className="label" htmlFor={assetId}>音频素材</label>
        <PreferenceSelect id={assetId} disabled={disabled} value={asset.id} onChange={setSelectedAsset}
          options={assets.map(item => ({ value: item.id, label: item.name }))} />
      </div>
      <button type="button" className="btn-ghost" disabled={!(duration > 0)} onClick={() => void addAudio()}>
        添加到播放头
      </button>
    </div> : <p className="text-xs text-muted">在素材库导入音频后可添加到时间线。</p>}
    {asset && videoEnd > 0 && !(duration > 0) &&
      <p className="text-xs text-muted">将播放头移到视频结束前即可添加音频。</p>}
    {clip && <>
      <div>
        <label className="label" htmlFor={clipId}>音频片段</label>
        <PreferenceSelect id={clipId} disabled={disabled} value={clip.id} onChange={setSelectedClip} options={clips} />
      </div>
      <ClipGain key={clip.id + ":" + clip.volume} clip={clip} onApply={onApply} />
    </>}
  </fieldset>;
}

function ClipGain({ clip, onApply }: Pick<ManualAudioControlsProps, "onApply"> & { clip: MediaClip }) {
  const inputId = useId();
  const initialPercent = Number((clip.volume * 100).toFixed(4));
  const [percent, setPercent] = useState(String(initialPercent));
  const volume = Number(percent) / 100;
  const valid = percent !== "" && Number.isFinite(volume) && volume >= 0 && Number(percent) !== initialPercent;
  return <div className="flex items-end gap-2">
    <div className="min-w-0 flex-1">
      <label className="label" htmlFor={inputId}>音量（%）</label>
      <input id={inputId} className="field" type="number" min="0" step="any" value={percent}
        onChange={event => setPercent(event.currentTarget.value)} />
    </div>
    <button type="button" className="btn-ghost" disabled={!valid}
      onClick={() => void onApply([{ op: "updateClip", clipId: clip.id, patch: { volume } }], "调整音量")}>
      应用音量
    </button>
  </div>;
}
