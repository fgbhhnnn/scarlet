import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { MediaAsset } from "@scarlet/timeline";
import { api, errorMessage } from "../../lib/client";
import { transcriptionPaused, transcriptionProgressLabel, transcriptionTasks } from "../../lib/transcriptionProgress";
import { isPreparingMedia } from "../../lib/upload";
import { absTime } from "../../lib/format";
import { useProjectStore } from "../../stores/project";
import { ConfirmDialog, Icon } from "../ui/primitives";
import { MediaStatusLine } from "./MediaStatusLine";
import { zh } from "../../lib/zh";
import { zhMedia, localizedTranscriptionIssue } from "../../lib/zh-media-settings";

const unknownNotice = "音频可能会根据转写设置发送到 OpenAI。";

/** What fixes transcription that can't run: a setting Scarlet can change at once, or the Settings page that holds the choice. */
type TranscriptionFix = { label: string; to: string } | { label: string; turnOnLocal: true };

export function useImportTranscription() {
  // `local`: the notice only says transcription runs on this computer, which Media and Add from a link leave out.
  // No notice until the settings answer: the OpenAI one would flash each time Media opens, also where audio stays here.
  const [policy, setPolicy] = useState<{ available?: boolean | null; notice: string; local?: boolean; fix?: TranscriptionFix }>({ notice: "" });
  const [revision, setRevision] = useState(0);
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState("");
  useEffect(() => {
    let live = true;
    void api.settings().then(({ settings, transcriptionAvailable, transcriptionIssue }) => {
      if (!live) return;
      const tr = settings.transcription;
      const provider = tr.provider;
      const unavailable = provider === "none" || transcriptionAvailable === false;
      const notice = unavailable ? `${transcriptionIssue ? localizedTranscriptionIssue(transcriptionIssue) : "转写不可用。"} 导入的音频不会生成转写。`
        : provider === "whispercpp" ? "Scarlet 会在此电脑上转写导入的音频。"
        : "导入文件的音频会发送到 OpenAI 进行转写。";
      // OpenAI with no key: local transcription is one click away. A local runtime that can't run is set up in Settings.
      const fix: TranscriptionFix | undefined = !unavailable ? undefined
        : provider === "openai" ? { label: "使用本地转写", turnOnLocal: true }
        : { label: zhMedia.setupTranscription, to: tr.localModel === "custom" ? "/settings#advanced" : "/settings" };
      setPolicy({ notice, fix, local: provider === "whispercpp" && transcriptionAvailable !== false,
        available: transcriptionAvailable ?? (provider === "none" ? false : null) });
    }).catch(() => { if (live) setPolicy({ available: null, notice: unknownNotice }); });
    return () => { live = false; };
  }, [revision]);
  const turnOnLocal = async () => {
    setFixing(true);
    setFixError("");
    try {
      const { settings } = await api.settings();
      await api.updateSettings({ transcription: { ...settings.transcription, provider: "whispercpp" } });
      setRevision(r => r + 1);
    } catch (e) {
      setFixError(errorMessage(e));
    } finally {
      setFixing(false);
    }
  };
  return { ...policy, fixing, fixError, turnOnLocal };
}

/** The import notice, with the one action that lets imports be transcribed when they can't be. */
export function ImportTranscriptionNotice({ policy }: { policy: ReturnType<typeof useImportTranscription> }) {
  const { notice, fix, fixing, fixError, turnOnLocal } = policy;
  if (!notice) return null;
  return <p className="import-transcription-notice mb-3 text-muted text-[12px]">
    {notice}
    {fix && <>{" "}{"to" in fix
      ? <Link to={fix.to} className="simple-link">{fix.label}</Link>
      : <button type="button" className="simple-link" disabled={fixing} onClick={() => void turnOnLocal()}>{fix.label}</button>}</>}
    {fixError && <span role="alert" className="block text-bad">{fixError}</span>}
  </p>;
}

function useTranscriptionRun(asset: MediaAsset) {
  const current = useProjectStore((s) => s.current);
  const tasks = current ? transcriptionTasks(current.tasks, current.media, asset) : [];
  const running = tasks.findLast((t) => ["queued", "claimed", "running"].includes(t.state));
  const latest = tasks.reduce<(typeof tasks)[number] | undefined>((a, b) => !a || (b.createdAt ?? "") > (a.createdAt ?? "") ? b : a, undefined);
  const mediaPaused = !!current?.project.mediaPaused;
  return { running, latest, mediaPaused, paused: transcriptionPaused(latest, mediaPaused) };
}

function RetranscribeIcon({ asset, onClick, blockedReason }: { asset: MediaAsset; onClick?: () => void; blockedReason?: string }) {
  const tipId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const show = hovered || focused;
  const when = absTime(asset.lastTranscription?.completedAt);
  return <span className="media-retranscribe" onPointerEnter={e => { if (e.pointerType !== "touch") setHovered(true); }} onPointerLeave={() => setHovered(false)}>
    <button type="button" className="edit-card-icon" aria-label="重新转写" aria-describedby={show ? tipId : undefined}
      aria-disabled={blockedReason ? true : undefined} onClick={blockedReason ? undefined : onClick}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={e => {
        if (e.key === "Escape" && show) {
          e.stopPropagation();
          setHovered(false);
          setFocused(false);
        }
      }}><Icon name="refresh" size={13} /></button>
    {show && <span className="media-transcription-tip" role="tooltip" id={tipId}>
      <strong>重新转写</strong>
      <span>{when ? <>最近转写于 <time dateTime={asset.lastTranscription?.completedAt}>{when}</time></> : "未记录转写日期"}</span>
      <span>{asset.lastTranscription?.model || "未记录模型"}</span>
      {blockedReason && <span>{blockedReason}</span>}
    </span>}
  </span>;
}

function ReplaceTranscript({ asset, retry, cloud, start }: { asset: MediaAsset; retry: boolean; cloud: boolean; start: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  return <>
    {retry ? <button type="button" className="simple-link" onClick={() => setConfirming(true)}>{zh.common.retry}</button>
      : <RetranscribeIcon asset={asset} onClick={() => setConfirming(true)} />}
    {confirming && <ConfirmDialog open onClose={() => setConfirming(false)} title={`重新转写“${asset.name}”？`} confirmLabel="重新转写"
      body={`Scarlet 会使用你的转写设置，并在新转写完成后替换此文件中已保存的文字和时间点。${cloud ? " 音频会发送到 OpenAI。" : ""}`}
      onConfirm={start} />}
  </>;
}

/**
 * A Media row's transcript while it's being made or still to make, shown the way the row shows its cache: its state
 * in a few words with the one thing to do beside them, and a bar under them while it runs. A finished one says
 * Transcribed in gray, so the line that showed its progress doesn't just go.
 */
export function TranscriptLine({ asset, available, cloud = false }: { asset: MediaAsset; available?: boolean | null; cloud?: boolean }) {
  const transcribe = useProjectStore((s) => s.transcribe);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const pending = useRef(false);
  const { running, latest, paused, mediaPaused } = useTranscriptionRun(asset);
  const { name, transcriptId } = asset;
  // The words are saved and linked partway through, while word alignment goes on: the job shows until it's done.
  if (running || starting) {
    const waiting = running?.progress?.stage === "queued";
    const progress = transcriptionProgressLabel(running?.progress);
    const text = waiting ? "等待转写" : progress ? "正在转写" : "正在转写…";
    return <MediaStatusLine name={name} status={{ text, tone: "busy" }}
      bar={waiting ? undefined : { label: `正在转写 ${name}`, fraction: running?.progress?.fraction, percent: progress }} />;
  }
  const savedStatus = transcriptId ? { text: "已转写", tone: "done" as const } : { text: "暂无转写", tone: "idle" as const };
  if (isPreparingMedia(asset) || (transcriptId && asset.status === "failed")) return transcriptId ? <MediaStatusLine name={name} status={savedStatus} /> : null;
  if (available === false) {
    return <MediaStatusLine name={name} status={savedStatus}>
      <Link to="/settings" className="simple-link">{zhMedia.setupTranscription}</Link>
    </MediaStatusLine>;
  }
  // The pause stopped this run and resume starts it again. It reads like Caching paused, with nothing to retry.
  if (paused) return <MediaStatusLine name={name} status={{ text: "转写已暂停", tone: "idle" }} />;
  async function start() {
    if (pending.current) return;
    pending.current = true;
    setError("");
    setStarting(true);
    try {
      await transcribe(asset.id);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setStarting(false);
    }
  }
  const failure = error || (latest?.state === "failed" ? latest.error ? localizedTranscriptionIssue(latest.error) : "转写失败。" : "");
  const blocked = available === undefined || mediaPaused;
  const status = failure ? { text: failure, tone: "bad" as const } : savedStatus;
  return <MediaStatusLine name={name} status={mediaPaused && transcriptId && !failure ? { ...status, text: "已转写 · 缓存已暂停" } : status}>
    {transcriptId && !blocked ? <ReplaceTranscript asset={asset} retry={!!failure} cloud={cloud} start={start} />
      : transcriptId && !failure ? <RetranscribeIcon asset={asset} blockedReason={mediaPaused ? "恢复媒体处理后可重新转写此文件。" : "正在检查转写设置…"} />
      : <button type="button" className="simple-link" disabled={blocked}
          title={mediaPaused ? "恢复媒体处理后可转写此文件。" : undefined} onClick={() => void start()}>{failure ? zh.common.retry : zhMedia.transcription}</button>}
  </MediaStatusLine>;
}

/**
 * How a file's transcript stands in the Transcript column, in a few plain words: the column offers nothing to press
 * for it. Media is where a transcription is started or retried (`TranscriptLine`).
 */
export function TranscriptionStatus({ asset }: { asset: MediaAsset }) {
  const { running, latest, paused } = useTranscriptionRun(asset);
  const progress = transcriptionProgressLabel(running?.progress);
  const text = running ? running.progress?.stage === "queued" ? "等待转写" : progress ? `正在转写 ${progress}` : "正在转写…"
    : isPreparingMedia(asset) ? "正在添加"
    : paused ? "转写已暂停"
    : latest?.state === "failed" ? "转写已停止"
    : "暂无转写";
  return <span>{text}</span>;
}
