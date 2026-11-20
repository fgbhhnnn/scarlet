import type { MediaAsset } from "@scarlet/timeline";
import { pct } from "../../lib/format";
import { isLink } from "../../lib/pendingImports";
import { useProjectStore } from "../../stores/project";
import { ActivityProgress } from "../ui/primitives";
import type { LocalImport, UploadItem } from "./UploadDropzone";

/**
 * The step of reading a file that Scarlet is on, and how far that step has got. Media's row and the card over the
 * player say both the same way. There is no guess at the time left, and a step still under way never says 100%.
 * `paused`: the pause holds a file's read until resume, so no step is under way and it says only that (`held`).
 */
export function preparationStep(file: MediaAsset, paused = false): { text: string; percent?: string; held?: true } {
  if (paused) return { text: "读取已暂停", held: true };
  const progress = file.preparation;
  if (!progress) return { text: "正在准备素材" };
  return { text: { waveform: "正在读取音频波形", preview: "正在创建视频预览", fingerprint: "正在检查文件" }[progress.stage],
    percent: pct(Math.min(progress.fraction, 0.99)) };
}

export function preparationLabel(file: MediaAsset, paused = false) {
  const { text, percent, held } = preparationStep(file, paused);
  return held ? text : percent ? `${text} · ${percent}` : `${text}…`;
}

export function ImportProgress({ localImport, upload, preparing }: {
  localImport?: LocalImport | null; upload?: UploadItem; preparing?: MediaAsset;
}) {
  const paused = useProjectStore(s => !!s.current?.project.mediaPaused);
  const name = localImport?.name ?? upload?.name ?? preparing?.name;
  let step = "正在开始导入…";
  let value: number | undefined;
  // A read the pause holds has no bar: one that stood still would say it was under way.
  let held = false;
  if (localImport) {
    const checked = localImport.checked;
    // A link has no original on this computer to copy: the engine downloads it, and reports nothing until it has.
    if (checked === undefined) step = isLink(localImport.path) ? "正在下载…" : "正在复制原文件到项目…";
    else if (checked === 0) step = "正在读取媒体信息…";
    else if (checked < 1) {
      step = `正在检查文件 · ${pct(checked)}`;
      value = checked;
    } else step = "正在完成导入…";
  } else if (upload?.state === "uploading") {
    value = upload.progress;
    step = `正在上传 · ${pct(value)}`;
  } else if (upload) step = "正在读取媒体信息…";
  else if (preparing) {
    step = preparationLabel(preparing, paused);
    value = preparing.preparation?.fraction;
    held = paused;
  }
  return <>
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="min-w-0 truncate font-medium" title={name}>{name ?? "正在添加素材"}</span>
      {localImport && <span className="shrink-0 text-xs text-muted tnum">文件 {localImport.position}/{localImport.total}</span>}
      {localImport?.cancelDownload && <button type="button" className="btn-quiet shrink-0 px-1 py-0.5" onClick={localImport.cancelDownload}>
        取消下载
      </button>}
    </div>
    {held ? <div role="status" className="mt-1.5 text-xs text-muted">{step}</div>
      : <ActivityProgress label={name ? `导入进度：${name}` : "导入进度"} value={value}>{step}</ActivityProgress>}
  </>;
}
