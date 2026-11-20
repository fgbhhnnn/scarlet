import { useEffect, useState } from "react";
import type { Project, Timeline } from "@scarlet/timeline";
import { player } from "../../lib/player";
import { usePlayerStore } from "../../stores/player";
import { MonitorPlayback, PlayerTime } from "../player/MonitorPlayback";
import { cutFrameUrl } from "./thumbs";
import type { useEditBefore } from "./EditBeforePreview";
import { zh } from "../../lib/zh";

/** Compare composed frames at the project playhead. Play always resumes the working edit. */
export function FramingPreview({ project, timeline, original, duration, before, loading, coarse, onAfter }: {
  project: Project; timeline: Timeline; original: ReturnType<typeof useEditBefore>; duration: number; before: boolean; loading?: boolean;
  /** The clock in whole seconds, as the player beside it shows it. */
  coarse?: boolean; onAfter(): void;
}) {
  const fps = project.settings.fps;
  const playing = usePlayerStore(s => s.playing);
  const frame = usePlayerStore(s => s.playing || s.scrubGesture ? undefined :
    Math.min(Math.ceil(duration * fps - 1e-6) - 1, Math.floor(s.time * fps + 1e-7)));
  const time = frame === undefined ? undefined : before ? original.map?.(frame / fps, "right") : frame / fps;
  const shown = before ? original.timeline : timeline;
  const end = before ? original.duration : duration;
  const url = shown && end != null && time != null && time >= 0 && time < end ?
    cutFrameUrl(project, shown, time, true, true) : undefined;
  useEffect(() => { if (playing && before) onAfter(); }, [playing, before, onAfter]);
  return <>
    {/* On After the video under it already shows this moment: it stays in view until the composed frame is in, so a
        pause doesn't flash black. */}
    {!playing && frame !== undefined && <div className={`pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted${url && !before ? "" : " bg-black"}`}>
      {url ? <ComparisonFrame key={url} url={url} before={before} /> : before && original.error ?
        <button type="button" className="btn-ghost pointer-events-auto" onClick={original.retry}>{zh.ui.review.retryFrame}</button> :
        <span role="status">{before && !original.timeline ? zh.ui.review.openingBefore : "当前位置没有匹配的画面。"}</span>}
    </div>}
    {!playing && before && frame === undefined && <div className="absolute inset-0 grid place-items-center bg-black text-sm text-muted">松开以比较此画面。</div>}
    {/* Paused, the picture is the composed frame, which says for itself when it is loading. */}
    <MonitorPlayback playing={playing} playable loading={playing && loading} onToggle={() => { onAfter(); player.toggle(); }}
      playLabel={before ? "播放剪辑后的视频" : undefined}>
      <PlayerTime end={duration} coarse={coarse} />
    </MonitorPlayback>
  </>;
}

function ComparisonFrame({ url, before }: { url: string; before: boolean }) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  if (status === "failed") return <button type="button" className="btn-ghost pointer-events-auto" onClick={() => setStatus("loading")}>{zh.ui.review.retryFrame}</button>;
  return <>
    {status === "loading" && before && <span role="status">{zh.ui.review.loadingFrame}</span>}
    <img src={url} alt={before ? "调整前的画面" : "调整后的画面"}
      className="absolute inset-0 h-full w-full bg-black object-contain" style={{ visibility: status === "ready" ? "visible" : "hidden" }}
      draggable={false} onLoad={() => setStatus("ready")} onError={() => setStatus("failed")} />
  </>;
}
