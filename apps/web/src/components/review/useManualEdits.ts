import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ScarletApiError } from "@scarlet/shared";
import type { Timeline, TimelineOp } from "@scarlet/timeline";
import { api, errorMessage } from "../../lib/client";
import { useProjectStore } from "../../stores/project";

type Scope = { projectId: string; branch: string };
type History = { scope: Scope; head: string; past: string[]; future: string[] };

const cutChanged = "时间线已更新，请在最新版本上重试。";

export function useManualEdits(projectId: string, timeline?: Timeline) {
  const project = useProjectStore(state => state.current?.id === projectId ? state.current.project : undefined);
  const branch = project?.branch ?? "main";
  const scope = useMemo(() => ({ projectId, branch }), [projectId, branch]);
  const activeScope = useRef<Scope | undefined>(scope);
  const pending = useRef<Scope | undefined>(undefined);
  const [status, setStatus] = useState<{ scope: Scope; busy: boolean; error: string | null }>();
  const [history, setHistory] = useState<History>();

  useLayoutEffect(() => {
    activeScope.current = scope;
    return () => { activeScope.current = undefined; };
  }, [scope]);

  const currentHistory = history?.scope === scope && history.head === project?.head ? history : undefined;
  const ready = !!timeline && timeline.version === project?.head;
  const busy = status?.scope === scope && status.busy;

  async function run(action: (head: string) => Promise<void>) {
    if (activeScope.current !== scope || pending.current === scope) return false;
    const current = useProjectStore.getState().current;
    if (!timeline || current?.id !== projectId || (current.project.branch ?? "main") !== branch || current.project.head !== timeline.version) {
      setStatus({ scope, busy: false, error: cutChanged });
      return false;
    }

    pending.current = scope;
    setStatus({ scope, busy: true, error: null });
    let error: string | null = null;
    try {
      await action(timeline.version);
      if (activeScope.current !== scope) return false;
      try {
        await useProjectStore.getState().refreshHead(projectId);
      } catch (cause) {
        error = `编辑已保存，刷新时间线失败。${errorMessage(cause)}`;
      }
      return activeScope.current === scope;
    } catch (cause) {
      error = cause instanceof ScarletApiError && (cause.code === "cut_changed" || cause.code === "needs_redo")
        ? cutChanged : errorMessage(cause);
      return false;
    } finally {
      if (pending.current === scope) pending.current = undefined;
      if (activeScope.current === scope) setStatus({ scope, busy: false, error });
    }
  }

  function apply(ops: TimelineOp[], label: string) {
    if (!ops.length) return Promise.resolve(false);
    return run(async head => {
      const saved = await api.proposeChange(projectId, {
        fromVersion: head, description: label, ops, autoApprove: true, skipRender: true,
      });
      if (saved.change.state !== "approved") throw new Error(cutChanged);
      if (activeScope.current !== scope) return;
      // The server can apply an edit over unrelated changes. Undo restores the version it was applied onto.
      const before = saved.change.appliedOnto ?? head;
      setHistory(previous => ({
        scope, head: saved.change.appliedVersion ?? saved.timeline.version,
        past: [...(previous?.scope === scope && previous.head === before ? previous.past : []), before], future: [],
      }));
    });
  }

  async function restore(direction: "undo" | "redo") {
    if (!currentHistory) return;
    const { past, future } = currentHistory;
    const target = (direction === "undo" ? past : future).at(-1);
    if (!target) return;
    await run(async head => {
      const { change } = await api.historyEdit(projectId, target, "restore", head, branch);
      if (activeScope.current !== scope) return;
      setHistory({
        scope, head: change.appliedVersion ?? change.toVersion,
        past: direction === "undo" ? past.slice(0, -1) : [...past, head],
        future: direction === "undo" ? [...future, head] : future.slice(0, -1),
      });
    });
  }

  return {
    apply,
    undo: () => restore("undo"),
    redo: () => restore("redo"),
    canUndo: ready && !!currentHistory?.past.length,
    canRedo: ready && !!currentHistory?.future.length,
    busy,
    error: status?.scope === scope ? status.error : null,
  };
}
