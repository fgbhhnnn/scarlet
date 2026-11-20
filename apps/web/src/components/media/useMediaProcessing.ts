import { useRef, useState } from "react";
import { isPreparingMedia } from "../../lib/upload";
import { useProjectStore } from "../../stores/project";
import { useSourceCaches } from "./sourceCaches";
import { zh } from "../../lib/zh";

export function useMediaProcessing() {
  const projectId = useProjectStore(s => s.current?.id);
  const paused = useProjectStore(s => !!s.current?.project.mediaPaused);
  const media = useProjectStore(s => s.current?.media);
  const transcribing = useProjectStore(s => !!s.current?.tasks.some(t => t.kind === "transcribe" &&
    (t.state === "queued" || t.state === "claimed" || t.state === "running")));
  const { caches } = useSourceCaches();
  const preparing = !!media?.some(isPreparingMedia);
  const caching = !!media?.some(m => {
    if (m.kind !== "video") return false;
    const cache = caches.get(m.id);
    return cache?.state === "caching" || !!cache?.queued;
  });
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = paused ? zh.project.resume : zh.project.pause;
  const working = !paused && (preparing || caching || transcribing);
  const available = paused || working || busy;

  async function toggle(): Promise<boolean> {
    if (!projectId || pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await useProjectStore.getState().updateProject({ mediaPaused: !paused }, projectId);
      return true;
    } catch {
      setError(`${label}媒体处理失败，请重试。`);
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return { label, description: paused ? zh.project.resumeMedia : zh.project.pauseMedia, icon: paused ? "play" as const : "pause" as const, available, busy, error, toggle };
}
