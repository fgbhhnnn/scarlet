import { useEffect, useState } from "react";
import { useUiStore } from "../../stores/ui";
import { zh } from "../../lib/zh";

type Tone = "warn" | "bad";

const DOT: Record<Tone, string> = {
  warn: "bg-warn",
  bad: "bg-bad",
};

function Dot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  return <span className={`size-2 shrink-0 rounded-full ${DOT[tone]} ${pulse ? "pulse" : ""}`} aria-hidden />;
}

/**
 * Live connection to the Scarlet engine (pushes change clips, task progress and
 * notes). Invisible while healthy; says what is wrong, in words, when it is not.
 * A short grace period hides the normal connect-on-startup blip.
 */
export function ConnectionStatus() {
  const ws = useUiStore((s) => s.wsStatus);
  const [visible, setVisible] = useState(false);

  // The grace period runs from when the connection dropped. Going from reconnecting to offline doesn't start it again.
  const down = ws !== "open";
  useEffect(() => {
    if (!down) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 2500);
    return () => clearTimeout(t);
  }, [down]);

  if (!visible || ws === "open") return null;
  const reconnecting = ws === "connecting";
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] ${reconnecting ? "bg-warn/10 text-warn" : "bg-bad/10 text-bad"}`}
      title="Scarlet 引擎会实时更新预览、进度和备注。连接中断时也会保存你的工作。"
    >
      <Dot tone={reconnecting ? "warn" : "bad"} pulse={reconnecting} />
      {reconnecting ? zh.shell.reconnecting : zh.shell.offline}
    </span>
  );
}
