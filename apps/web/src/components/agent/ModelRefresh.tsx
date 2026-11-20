import { useState } from "react";
import { errorMessage } from "../../lib/client";
import { useHostsStore } from "../../stores/hosts";
import { Icon, InlineError } from "../ui/primitives";

export function useModelRefresh() {
  const busy = useHostsStore(s => s.refreshingModels);
  const [result, setResult] = useState<"done" | { error: string } | null>(null);
  async function refresh() {
    setResult(null);
    try {
      await useHostsStore.getState().refreshModels();
      setResult("done");
    } catch (e) {
      setResult({ error: errorMessage(e) });
    }
  }
  return { busy, refresh, result, clear: () => setResult(null) };
}

type ModelRefreshAction = ReturnType<typeof useModelRefresh>;

export function ModelRefreshButton({ action }: { action: ModelRefreshAction }) {
  return <button type="button" className="btn-quiet" disabled={action.busy} onClick={() => void action.refresh()}>
    {action.busy ? "正在刷新…" : "刷新模型"}
  </button>;
}

export function ModelRefreshFeedback({ action, loadError }: { action: ModelRefreshAction; loadError?: string | null }) {
  const error = action.result && action.result !== "done" ? action.result.error : loadError;
  return <>
    <div role="status" className="flex items-center gap-1 text-xs text-muted">
      {!action.busy && !error && action.result === "done" && <><Icon name="check" /> 模型已刷新</>}
    </div>
    <InlineError>{!action.busy && error}</InlineError>
  </>;
}
