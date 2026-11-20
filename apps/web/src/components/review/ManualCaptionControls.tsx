import { useMemo, useState } from "react";
import { formatTimecode, makeTrack, newId, snapToFrame, timelineDuration, type Timeline, type TimelineOp } from "@scarlet/timeline";
import { PreferenceSelect } from "../ui/PreferenceSelect";

interface ManualCaptionControlsProps {
  timeline: Timeline;
  cursorSeconds: number;
  fps?: number;
  disabled: boolean;
  onApply: (ops: TimelineOp[], label: string) => Promise<boolean>;
}

export function ManualCaptionControls({ timeline, cursorSeconds, fps = 30, disabled, onApply }: ManualCaptionControlsProps) {
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<{ original: string; text: string }>();
  const { track, captions, options, duration } = useMemo(() => {
    const captionTracks = timeline.tracks.filter(item => item.kind === "caption");
    const captions = captionTracks.flatMap(item => item.clips
      .filter(clip => clip.kind === "caption")
      .map(clip => ({ clip, trackName: item.name })))
      .sort((a, b) => a.clip.timelineIn - b.clip.timelineIn);
    return {
      track: captionTracks.find(item => !item.hidden),
      captions,
      options: [
        { value: "", label: "在播放头添加字幕" },
        ...captions.map(({ clip, trackName }) => ({
          value: clip.id,
          label: clip.text.replace(/\s+/g, " ").trim().slice(0, 80) || "空字幕",
          detail: `${formatTimecode(clip.timelineIn, fps)} · ${trackName}`,
        })),
      ],
      duration: timelineDuration(timeline),
    };
  }, [timeline, fps]);
  const selected = captions.find(({ clip }) => clip.id === selectedId)?.clip;
  const original = selected?.text ?? "";
  const text = draft?.original === original ? draft.text : original;
  const start = snapToFrame(Math.max(0, cursorSeconds), fps);
  let end = Math.min(duration, start + 2);
  for (const clip of track?.clips ?? []) {
    if (clip.kind !== "caption" || !clip.enabled || clip.timelineOut <= start) continue;
    end = Math.min(end, clip.timelineIn);
  }
  end = Math.floor(end * fps + 1e-7) / fps;
  const canAdd = end > start;

  async function save() {
    const trimmed = text.trim();
    if (disabled || !trimmed) return;

    if (selected) {
      if (trimmed === original.trim()) return;
      // Word timings still refer to the original text after a manual rewrite.
      const patch = selected.words?.length ? { text: trimmed, words: [] } : { text: trimmed };
      if (await onApply([{ op: "updateClip", clipId: selected.id, patch }], "修改字幕")) setDraft(undefined);
      return;
    }
    if (!canAdd) return;

    const destination = track ?? makeTrack("caption", "字幕");
    const ops: TimelineOp[] = [];
    if (!track) ops.push({ op: "addTrack", track: destination });
    ops.push({
      op: "addClip",
      trackId: destination.id,
      clip: { id: newId("caption"), kind: "caption", enabled: true, timelineIn: start, timelineOut: end, text: trimmed },
    });
    if (await onApply(ops, "添加字幕")) setDraft(undefined);
  }

  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-2">
      <legend className="label">字幕</legend>
      <PreferenceSelect label="选择字幕" value={selected?.id ?? ""} options={options} disabled={disabled} onChange={value => {
        setSelectedId(value);
        setDraft(undefined);
      }} />
      <textarea className="field" aria-label="字幕文字" rows={2} value={text} onChange={event => {
        setDraft({ original, text: event.currentTarget.value });
      }} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!selected && <span className="text-xs text-muted tnum">
          {canAdd ? `${formatTimecode(start, fps)} – ${formatTimecode(end, fps)}` : "将播放头移到字幕轨道的空白位置"}
        </span>}
        <button className="btn-ghost" type="button" onClick={() => void save()}
          disabled={!text.trim() || (selected ? text.trim() === original.trim() : !canAdd)}>
          {selected ? "保存字幕" : "添加字幕"}
        </button>
      </div>
    </fieldset>
  );
}
