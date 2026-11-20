import { useState } from "react";
import { desktop } from "../../lib/desktop";

export function StartupRecovery({ title, detail, showLogs = false }: { title: string; detail: string; showLogs?: boolean }) {
  const [feedback, setFeedback] = useState("");

  async function openLogs() {
    try {
      const { logDir } = await desktop.info();
      await desktop.openPath(logDir);
      setFeedback("");
    } catch (error) {
      setFeedback(`无法打开日志。${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function copyDiagnostics() {
    try {
      await navigator.clipboard.writeText(`${title}\n${detail}`);
      setFeedback("已复制诊断信息。");
    } catch {
      setFeedback("请选中上方的错误信息并手动复制。");
    }
  }

  return (
    <main className="h-full grid place-items-center p-6">
      <section className="max-w-lg space-y-3">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p role="status" className="text-muted whitespace-pre-wrap break-words select-text">{detail}</p>
        <div className="flex flex-wrap gap-2">
          {showLogs && <button className="btn-ghost" onClick={openLogs}>打开日志</button>}
          <button className="btn-ghost" onClick={copyDiagnostics}>复制诊断信息</button>
        </div>
        {feedback && <p role="status" className="text-muted">{feedback}</p>}
      </section>
    </main>
  );
}
