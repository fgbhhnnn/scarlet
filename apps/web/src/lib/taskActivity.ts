import { taskDialogueOperation, type Task, type TaskEvent } from "@scarlet/shared";
import { clock } from "./format";

const toolActivity: Record<string, string> = {
  project_get: "查看项目",
  media_list: "浏览素材",
  media_frame: "检查画面",
  frame_contact_sheet: "对比画面",
  frame_contact_sheet_batch: "对比片段",
  source_audio: "检查原始声音",
  audio_sync: "检查声音是否同步",
  transcript_get: "读取转写稿",
  transcript_search: "搜索转写稿",
  dialogue_scan: "扫描对白",
  dialogue_check_join: "检查剪辑听感",
  dialogue_review_inspect: "检查剪辑建议",
  dialogue_review_save: "保存剪辑建议",
  dialogue_revise_cut: "移动剪点",
  change_review_cut: "审阅剪辑",
  dialogue_apply_cuts: "应用剪辑并准备审阅",
  waveform_get: "检查声音",
  sound_picture: "检查声音",
  timeline_get: "读取时间线",
  timeline_summary: "查看时间线",
  timeline_at: "检查时间线",
  timeline_diff: "对比版本",
  timeline_transcript: "读取视频台词",
  timeline_join_audit: "检查剪点听感",
  dialogue_check_repeats: "检查成片对白中的重复",
  media_profile: "测量声音",
  screen_text: "读取屏幕文字",
  screen_reading: "查找屏幕朗读内容",
  screen_motion: "查看画面变化位置",
  faces: "查找人脸位置",
  timeline_propose: "提出剪辑建议",
  timeline_crossfade_audio: "平滑对白",
  timeline_framing: "调整画面构图",
  screen_area: "标记观众可见区域",
  timeline_first_cut: "制作首次剪辑",
  captions_generate: "生成字幕",
  change_get: "查看更改",
  change_list: "查看你的剪辑",
  edit_flag: "标记待你审阅的剪辑",
  notes_list: "读取备注",
  note_reply: "回复备注",
  note_resolve: "处理备注",
  render_request: "准备视频",
  render_status: "检查视频",
  asset_add: "添加媒体",
  graphic_render: "绘制图形",
  graphic_get: "读取图形",
  style_guide_save: "保存风格指南",
  attachment_read: "读取附件",
  export_otio: "导出时间线",
  task_question: "提出问题",
  skill_save_from_change: "保存技能",
  skill_save_edit: "保存技能",
  skills_list: "读取技能",
  learning_suggest: "记录规则",
  shorts_plan: "开始制作其他短视频",
};

// New progress messages start with a short action. Older hosts also send
// free-form commentary and diagnostics, which shouldn't displace a useful label.
function progressLabel(text: string): string | undefined {
  const heading = text.trim().split(/[:;.!?…\n—]/, 1)[0]?.trim().replace(/\s+/g, " ").replace(/^found \d+ /i, "Found ") ?? "";
  if (technical.test(heading) || command.test(heading)) return;
  const fixed: Record<string, string> = {
    "found candidate fillers": "发现候选填充词",
    "checking waveform": "检查音频波形",
    "trimming dead air": "正在剪除静音",
  };
  const fixedLabel = fixed[heading.toLowerCase()];
  if (fixedLabel) return fixedLabel;
  if (/^checking (?:the )?waveform\b/i.test(heading)) return "检查音频波形";
  if (heading.length <= 48 && /^(?:[a-z]+ing|found|read|check|inspect|find|trim|cut|review|apply|render|export)(?: [\p{L}\p{N}][\p{L}\p{N}’'-]*){1,2}$/iu.test(heading)) {
    const lower = heading.toLowerCase();
    const known: Record<string, string> = {
      "reading transcript": "读取转写稿", "reading waveform": "读取音频波形", "reading timeline": "读取时间线",
      "reading captions": "读取字幕", "reading clips": "读取剪辑", "reading frames": "读取画面", "reading audio": "读取音频",
      "reading footage": "读取素材", "reading pauses": "读取停顿", "reading silence": "读取静音片段", "reading notes": "读取备注",
      "reading project": "读取项目", "reading skills": "读取技能", "reading instruction": "读取指令",
      "checking transcript": "检查转写稿", "checking waveform": "检查音频波形", "checking timeline": "检查时间线",
      "checking captions": "检查字幕", "checking clips": "检查剪辑", "checking frames": "检查画面", "checking audio": "检查音频",
      "checking footage": "检查素材", "checking pauses": "检查停顿", "checking silence": "检查静音片段", "checking notes": "检查备注",
      "checking project": "检查项目", "checking skills": "检查技能", "checking instruction": "检查指令",
      "reviewing transcript": "审阅转写稿", "reviewing timeline": "审阅时间线", "reviewing clips": "审阅剪辑", "reviewing project": "查看项目",
      "finding transcript": "查找转写稿", "finding frames": "查找画面", "finding faces": "查找人脸", "finding pauses": "查找停顿",
      "rendering video": "渲染视频", "exporting timeline": "导出时间线", "applying edits": "应用剪辑",
    };
    return known[lower] ?? heading.charAt(0).toUpperCase() + heading.slice(1);
  }
  // Accept a leading action from older logs such as "Reading the transcript for clip 4".
  const action = /^(?:I['’]m |now )?([a-z]+ing)\s+(?:(?:the|a|an|your)\s+)?(transcript|waveform|timeline|captions|clips?|frames?|audio|footage|pauses|silence|notes|project|skills?|instruction)\b/i.exec(text.trim());
  if (!action) return undefined;
  const label = (action[1] + " " + action[2]).toLowerCase();
  const known: Record<string, string> = {
    "reading transcript": "读取转写稿", "reading waveform": "读取音频波形", "reading timeline": "读取时间线",
    "reading captions": "读取字幕", "reading clips": "读取剪辑", "reading frames": "读取画面", "reading audio": "读取音频",
    "reading footage": "读取素材", "reading pauses": "读取停顿", "reading silence": "读取静音片段", "reading notes": "读取备注",
    "reading project": "读取项目", "reading skills": "读取技能", "reading instruction": "读取指令",
  };
  return known[label] ?? label.charAt(0).toUpperCase() + label.slice(1);
}

const toolNames = new WeakMap<TaskEvent, string>();

export function toolName(event: TaskEvent): string {
  const known = toolNames.get(event);
  if (known !== undefined) return known;
  const name = typeof event.data?.tool === "string" ? event.data.tool : event.text.trim().split(/\s+/, 1)[0] ?? "";
  const tool = name.replace(/^(?:mcp__scarlet__|mcp_scarlet_|scarlet(?:__|[./]))/i, "").replaceAll(".", "_").toLowerCase();
  toolNames.set(event, tool);
  return tool;
}

export const waitLabels: Record<string, string> = { transcript: "转写稿", sound: "声音分析", dialogue: "对白分析" };
/** The live line while a run waits for a transcript. */
export const TRANSCRIPT_WAIT = `等待${waitLabels.transcript}`;
/** Tools an agent calls again to collect media work that is still being prepared. */
export const waitTools: Record<string, string> = { transcript_get: "transcript", transcript_search: "transcript", waveform_get: "sound", dialogue_scan: "dialogue" };

function waitKey(wait: unknown, mediaId: unknown) {
  return typeof wait === "string" && typeof mediaId === "string" ? `${wait}/${mediaId}` : undefined;
}

/** Media work the run is still waiting on, as `wait/mediaId` keys. */
export function pendingMediaWaits(events: readonly TaskEvent[] = []): Set<string> {
  const waits = new Set<string>();
  for (const event of events) {
    if (event.type !== "log" || event.data?.kind !== "media_wait") continue;
    const key = waitKey(event.data.wait, event.data.mediaId);
    if (key) event.data.done ? waits.delete(key) : waits.add(key);
  }
  return waits;
}

/** The recordings a call reads: its mediaId, or the mediaIds of a read of the same range on several. */
export function inputMediaIds(input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  const { mediaId, mediaIds } = input as { mediaId?: unknown; mediaIds?: unknown };
  const ids = Array.isArray(mediaIds) ? mediaIds : [mediaId];
  return ids.filter((id): id is string => typeof id === "string");
}

/** The media work this tool call is collecting, when that work is still being prepared. */
export function waitingFor(event: TaskEvent, waits: ReadonlySet<string>): string | undefined {
  if (event.type !== "tool" || !waits.size) return;
  const wait = waitTools[toolName(event)];
  return inputMediaIds(event.data?.input).some(mediaId => {
    const key = waitKey(wait, mediaId);
    return key && waits.has(key);
  }) ? wait : undefined;
}

function toolLabel(name: string, event: TaskEvent): string | undefined {
  if (!Object.hasOwn(toolActivity, name)) return;
  const label = toolActivity[name]!;
  const input = event.data?.input;
  if (!input || typeof input !== "object") return label;
  if ("index" in input && typeof input.index === "number" && Number.isSafeInteger(input.index) && input.index >= 0) {
    const count = "count" in input && typeof input.count === "number" && Number.isSafeInteger(input.count) && !("wholePicture" in input && input.wholePicture) ? input.count : 1;
    if (name === "dialogue_review_inspect" && count > 1) return `${label} · 剪点 ${input.index + 1}–${input.index + count}`;
    return `${label} · ${name === "dialogue_review_inspect" ? "剪点" : "剪辑"} ${input.index + 1}`;
  }
  const time = "from" in input ? input.from : "start" in input ? input.start : "t" in input ? input.t : undefined;
  if (typeof time !== "number" || !Number.isFinite(time) || time < 0) return label;
  // A range says how much is being read: "0:00–57:47" rather than a start that never moves.
  const end = "to" in input ? input.to : "end" in input ? input.end : undefined;
  return typeof end === "number" && Number.isFinite(end) && end - time >= 1 ? `${label} ${clock(time)}–${clock(end)}` : `${label} ${clock(time)}`;
}

export function taskActivityLabel(event: TaskEvent, waits: ReadonlySet<string> = new Set()): string | undefined {
  switch (event.type) {
    case "tool": {
      const wait = waitingFor(event, waits);
      if (wait) return `等待${waitLabels[wait]}`;
      const tool = toolName(event);
      if (tool === "task_log") {
        const input = event.data?.input;
        return input && typeof input === "object" && "text" in input && typeof input.text === "string" ? progressLabel(input.text) : undefined;
      }
      return toolLabel(tool, event);
    }
    case "log":
      if (event.data?.kind === "editor_progress") return event.data.scanPage ? "扫描对白" : event.text.trim() || undefined;
      // Why a call saved nothing is kept for diagnosis; the agent says what it does next.
      if (event.data?.kind === "tool_refused") return undefined;
      if (event.data?.kind === "init") return "正在开始";
      if (event.data?.kind === "reasoning") return "正在规划下一步";
      if (event.data?.kind === "connection") return "正在重新连接模型";
      if (event.data?.kind === "media_wait") {
        const label = typeof event.data.wait === "string" ? waitLabels[event.data.wait] : undefined;
        return label && !event.data.done ? `等待${label}` : undefined;
      }
      return progressLabel(event.text);
    case "change": return "已提出剪辑建议";
    case "question": return "等待你的回答";
    case "answer": return "正在查看你的回答";
    // The task state handles failures. Recoverable tool errors stay in the event log.
  }
}

const technical = /[{}`\n\r\\]|<\/?[a-z!][^<>]*>|[-=]>|https?:\/\/|\b\w+_\w+|(?:^|\s)\/\S|\b(?:MCP|stdout|stderr|JSON|ffmpeg|ffprobe|stack trace|tool call|exit code|API endpoint)\b/i;
const command = /(?:^|\s)(?:[$%] |(?:bash|zsh|git|npm|pnpm|npx|node|python3?|curl|cargo|sudo|exec_command|ls|cd|chmod|mkdir)\s+\S)|^(?:ran|running|executed) (?:the )?(?:terminal |shell )?commands?\b|&&|\|\|/i;

const savedPlaybackAllClear = /^(?:the )?playback (?:audio|repeat) check found no (?:outstanding accidental )?repeats[.!]?(?: no edits were needed[.!]?)?$/i;

/** Older passes saved the automatic recheck's all-clear as a chat message. Keep any other words for the editor. */
export function taskChatText(task: Task, text = task.summary) {
  const audit = task.repeatAudit;
  if (!text || task.state !== "done" || audit?.remaining !== 0 || audit.noFindings === false || audit.unavailable?.length) return text;
  if (taskDialogueOperation(task) === "first-cut") {
    const words = text.replace(/\*\*/g, "").trim().replace(/\s+/g, " ");
    if (savedPlaybackAllClear.test(words)) return undefined;
  }
  return text;
}

/** Keep the receipt brief, or retain the complete editorial reply without tool transcripts. */
export function editConfirmation(value?: string | null, instruction?: string, mode: "brief" | "full" = "brief"): string | undefined {
  if (!value) return;
  const normalize = (text: string) => text.toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
  const requested = normalize(instruction ?? "");
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of value.replace(/```[\s\S]*?(?:```|$)/g, "\n").split(/\r?\n/)) {
    if (!line.trim() && mode === "full" && lines.at(-1)) lines.push("");
    const sentences: string[] = [];
    for (const part of line.trim().replace(/^[-*]\s+/, "").split(/(?<=[.!?])\s+/u)) {
      const text = part.trim().replace(/\*\*/g, "");
      if (!text || (mode === "brief" && text.length > 320) || technical.test(text) || command.test(text) || normalize(text) === requested) continue;
      const sentence = /[.!?…”"]$/.test(text) ? text : text + ".";
      if (seen.has(sentence)) continue;
      seen.add(sentence);
      sentences.push(sentence);
      if (mode === "brief" && seen.size === 3) break;
    }
    if (sentences.length) lines.push((mode === "full" && /^\s*[-*]\s+/.test(line) ? "• " : "") + sentences.join(" "));
    if (mode === "brief" && seen.size === 3) break;
  }
  return lines.join(mode === "full" ? "\n" : " ").trim() || undefined;
}

/** A socket update can arrive while the saved history is in flight. */
export function mergeTaskEvents(history: TaskEvent[], live: TaskEvent[]): TaskEvent[] {
  const ids = new Set(history.map((event) => event.id));
  return [...history, ...live.filter((event) => !event.id || !ids.has(event.id))]
    .sort((a, b) => (Date.parse(a.at ?? "") || 0) - (Date.parse(b.at ?? "") || 0));
}
