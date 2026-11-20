import { useEffect, useState } from "react";
import { create } from "zustand";
import type { LocalModelStatus, LocalTranscriptionModel, ServerSettings } from "@scarlet/shared";
import { api, errorMessage } from "../../lib/client";
import { desktop } from "../../lib/desktop";
import { Icon, InlineError } from "../ui/primitives";

interface CrisperSetup {
  phase: "idle" | "choosing" | "installing" | "failed";
  error: string;
  revision: number;
}

// Installation continues in the desktop process when the editor leaves Settings.
const useCrisperSetup = create<CrisperSetup>(() => ({ phase: "idle", error: "", revision: 0 }));

async function installFromFolder() {
  const previous = useCrisperSetup.getState();
  if (previous.phase === "choosing" || previous.phase === "installing") return;
  useCrisperSetup.setState({ phase: "choosing", error: "" });
  try {
    const directory = await desktop.pickFolder("选择 CrisperWhisper 模型文件夹");
    if (!directory) {
      useCrisperSetup.setState(previous);
      return;
    }
    useCrisperSetup.setState({ phase: "installing" });
    await desktop.installCrisperModel(directory);
    useCrisperSetup.setState({ phase: "idle", revision: previous.revision + 1 });
  } catch (e) {
    useCrisperSetup.setState({ phase: "failed", error: errorMessage(e) });
  }
}

/** Only show a status read for the model choice the engine has saved. */
export function useLocalModelStatus(source?: ServerSettings["transcription"]): LocalModelStatus | null | undefined {
  const revision = useCrisperSetup(state => state.revision);
  const [result, setResult] = useState<{ source: ServerSettings["transcription"]; revision: number; status: LocalModelStatus | null }>();
  useEffect(() => {
    if (!source || source.provider !== "whispercpp") return;
    const selected = source;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const next = await api.localModelStatus().catch(() => null);
      if (!active) return;
      setResult({ source: selected, revision, status: next });
      timer = setTimeout(poll, next?.state === "downloading" || next?.state === "checking" ? 800 : 3500);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [source, revision]);
  if (!result || result.source !== source) return;
  // Installation can change what's active, while the saved selection (including legacy preset paths) stays the same.
  if (result.revision !== revision) return { state: "checking", selected: result.status?.selected };
  return result.status;
}

export function LocalModelNotice({ model, status }: { model: LocalTranscriptionModel; status?: LocalModelStatus | null }) {
  const fallback = status?.fallback && status.active === "whispercpp";
  let text: string;
  switch (status?.state) {
    case "ready": text = status.active === "crisperwhisper" ? "CrisperWhisper 已就绪。" : model === "custom" ? "自定义模型可用" : "模型可用"; break;
    case "downloading": text = `正在下载模型 · ${Math.min(99, Math.floor(status.received * 100 / status.total))}%`; break;
    case "failed": text = "模型下载失败。请重试转写以重新下载。"; break;
    case "invalid": text = model === "custom" ? "请在高级设置中检查模型文件和适配器。" : "模型文件已损坏，Scarlet 会在首次使用时重新下载。"; break;
    case "missing": text = model === "custom" ? "请在高级设置中选择模型文件。" : "首次转写会下载最多 998 MB。"; break;
    default: text = status === null ? "无法读取模型状态" : "正在检查模型…";
  }
  const ready = status?.state === "ready";
  const tone = ready ? "bg-ok" : status?.state === "failed" || status?.state === "invalid" ? "bg-warn" : "bg-dim";
  return <div className="transcription-status">
    <div role="status" className="flex min-w-0 items-baseline gap-2">
      <span aria-hidden className={`size-1.5 shrink-0 self-start mt-[6px] rounded-full ${tone}`} />
      <div>
        {fallback ? <>
          <p className="font-medium">{ready ? "正在使用内置 Whisper" : "使用内置 Whisper 后备方案"}</p>
          <p className="mt-0.5 text-muted">{ready ? "设置完成后将使用 CrisperWhisper。" : text}</p>
        </> : <p>{status?.reason ?? text}</p>}
      </div>
    </div>
    <span className="transcription-privacy">
      <Icon name="monitor" size={14} />
      {model === "custom" ? "Scarlet 会将音频交给选定的本地运行程序。" : "音频保留在这台电脑上。"}
    </span>
  </div>;
}

const setupGuide = "https://github.com/Forward-Future/scarlet/blob/main/docs/transcription-models.md";
const crisperWeights = "https://huggingface.co/nyralabs/CrisperWhisper2.0_large/tree/f4334f6e8193f2691212d49b20fa12d370e13896";

function CrisperSetupButton() {
  const { phase, error } = useCrisperSetup();
  const labels = { idle: "从文件夹安装…", choosing: "正在选择文件夹…", installing: "正在安装 CrisperWhisper…", failed: "重新选择安装文件夹…" };
  const busy = phase === "choosing" || phase === "installing";
  return <div>
    <button type="button" className="btn-ghost" disabled={busy} aria-live="polite" onClick={() => void installFromFolder()}>
      {labels[phase]}
    </button>
    <InlineError>{error}</InlineError>
  </div>;
}

export function TranscriptionGuide({ crisper = false }: { crisper?: boolean }) {
  const [error, setError] = useState("");
  const open = (url: string) => {
    setError("");
    void desktop.openUrl(url).catch(e => setError(errorMessage(e)));
  };
  return <details className={crisper ? "transcription-setup" : "my-2 text-xs text-muted"}>
    {crisper ? (
      <summary className="transcription-setup-row" aria-labelledby="crisper-setup-title" aria-describedby="crisper-license">
        <span>
          <span id="crisper-setup-title">设置 CrisperWhisper</span>
          <span id="crisper-license" className="mt-1 block text-xs font-normal text-dim">仅供非商业研究。商用需要单独授权。</span>
        </span>
        <Icon name="chevron" size={14} />
      </summary>
    ) : <summary className="cursor-pointer underline">设置自定义模型</summary>}
    <div className={crisper ? "transcription-instructions" : "mt-2 space-y-2"}>
      {crisper ? <>
        <p>支持安装了 64 位 Python 3.12 的 Windows、Ubuntu 24.04 x86-64，或运行 macOS 14 及更高版本的 Apple 芯片 Mac。在 Ubuntu 上请安装 <code>python3.12-venv</code>.</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>将 <button type="button" className="underline" onClick={() => open(crisperWeights)}>CrisperWhisper 2.0 large 模型文件</button>下载到同一文件夹。</li>
          <li>在下方选择该文件夹。Scarlet 会验证文件并下载运行库。</li>
        </ol>
        <CrisperSetupButton />
      </> : <p>请选择 whisper.cpp 模型文件，或提供能输出逐词时间戳 JSON 的本地适配器。如果适配器自行管理模型权重，可以留空模型文件。在高级设置中保存选择。</p>}
      <button type="button" className="underline" onClick={() => open(setupGuide)}>打开转写模型指南</button>
      <InlineError>{error}</InlineError>
    </div>
  </details>;
}
