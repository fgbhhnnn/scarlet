import { useEffect, useRef, useState } from "react";
import { player } from "../../lib/player";
import { Icon } from "../ui/primitives";
import { usePlayerStore } from "../../stores/player";
import { dropCaughtUpFrame, useCaughtUpStore, type CaughtUp } from "../../stores/shownCut";
import { zh } from "../../lib/zh";

/** The longest the held picture waits for the new player's own once the video plays. */
const FRAME_WAIT_MS = 4000;

/**
 * Edits saved while the video plays wait until it stops, so it plays on without a break. Meanwhile a note on the
 * picture says they're ready. When it stops they come in: the picture it stopped on stays until the new player's own
 * is in, and then fades into it.
 */
export function CaughtUpOnMonitor() {
  const caughtUp = useCaughtUpStore(s => s.caughtUp);
  const waiting = useCaughtUpStore(s => s.waiting);
  return <>
    {caughtUp?.frame && <HeldFrame key={`frame ${caughtUp.id}`} caughtUp={caughtUp} />}
    {waiting && <div className="caught-up-notice" role="status"><Icon name="pause" size={12} />{zh.ui.player.newEdits}<span> · {zh.ui.player.pauseToSee}</span></div>}
  </>;
}

function HeldFrame({ caughtUp }: { caughtUp: CaughtUp }) {
  const host = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const { id, frame } = caughtUp;
  useEffect(() => {
    const canvas = frame!.canvas;
    host.current?.append(canvas);
    const opened = performance.now();
    let playedAt: number | undefined;
    // The held picture is the footage at the playhead, so it stays until the new player has its own picture there: a
    // video attached with a frame decoded where it stands. The one that played can stay attached when nothing about what
    // it plays changed, and then its own picture is right as it is. A player that loads nothing until Play keeps the held
    // picture until then. A scrub or a skip moves away from it.
    const check = setInterval(() => {
      const el = player.element();
      const { time, playing } = usePlayerStore.getState();
      if (playing) playedAt ??= performance.now();
      const ready = !!el && el.readyState >= 2 && !el.seeking && (el !== frame!.video || performance.now() - opened > 150);
      const moved = Math.abs(time - caughtUp.time) > 1e-3 && !playing;
      const stuck = playedAt !== undefined && performance.now() - playedAt > FRAME_WAIT_MS;
      if (ready || moved || stuck) { clearInterval(check); setLeaving(true); }
    }, 50);
    return () => { clearInterval(check); canvas.remove(); };
  }, [frame]); // eslint-disable-line react-hooks/exhaustive-deps
  // Once faded, it goes; also where no transition runs, as with motion reduced.
  useEffect(() => {
    if (!leaving) return;
    const gone = setTimeout(() => dropCaughtUpFrame(id), 250);
    return () => clearTimeout(gone);
  }, [leaving, id]);
  return <div ref={host} className="caught-up-frame" data-leaving={leaving || undefined} aria-hidden />;
}
