/** Chinese copy used by the review, history and timeline panels. */
export const zhReview = {
  run: {
    unavailable: "不可用", noPrice: (models: string) => `暂无 ${models} 的价格。`,
    pricingUnavailable: "部分或全部用量暂无 API 价格。", standardRates: "按短上下文和默认缓存时长的标准 API 费率计算。",
    input: "输入", output: "输出", cacheRead: "读取缓存", cacheWrite: "写入缓存", models: "模型", model: "模型",
    thinking: "推理强度", providerDefault: "服务商默认", activeTime: "运行时间", estimatedCost: "预计费用", total: "总计",
    showAll: "显示全部", preparingAudio: "正在准备音频", findingVoices: "正在查找音色", matchingVoices: "正在匹配音色",
    finalCheck: "正在检查已完成的成片", working: "正在处理剪辑", pickingUp: "正在从上次中断处继续",
    transcribing: (progress: string) => `正在转写录音 · ${progress}`,
    scarletWork: "Scarlet 的工作", stop: "停止", hideDetails: "隐藏详情", showDetails: "显示详情",
    paused: "已暂停", queued: "排队中", needsAnswer: "需要你的回答", editingPaused: "剪辑已暂停。点击消息框上方的继续即可从中断处继续。",
    stopped: "已停止", couldNotFinish: "未能完成", nothingSaved: "没有保存任何内容", finishEdit: "完成剪辑",
    finishWhenReady: "准备好后完成", dontWait: "不再等待", retry: "重试", transcribe: "转写",
    pausedTranscripts: "已暂停 · 等待转写稿",
    transcriptsReady: (count: number) => count > 1 ? `${count} 份转写稿已就绪` : "转写稿已就绪",
    finishesWhenReady: "准备好后完成", transcriptsInProgress: "转写进行中", stoppedTranscripts: "转写已停止",
    noTranscripts: "没有转写稿",
    failed: "无法完成", resumeHint: "剪辑已暂停。恢复后将从消息框上方的暂停处继续。",
    pricingDetails: "按标准 API 费率估算，适用于短上下文和默认缓存时长。",
  },
  actions: { revise: "修改", apply: "应用" },
  before: {
    label: "剪辑前", backToAfter: "返回剪辑后", play: "播放剪辑前",
    noEarlierVersion: "没有可用的较早版本。", emptyEarlierTimeline: "这次剪辑前的时间线是空的。",
    noMatchingPassage: "较早版本中没有对应的片段。",
  },
  history: {
    view: "历史记录视图", versions: "剪辑版本", full: "完整历史", unknown: "未知", untitled: "未命名剪辑",
    inVersion: "此版本的剪辑", edits: (count: number) => `${count} 处剪辑`, places: (count: number) => `${count} 处`,
    revises: (label?: string) => label ? `修改了“${label}”` : "修改了较早的剪辑", revisedLater: (label: string) => `后来修改为“${label}”`,
    undone: "已撤销", current: "当前", loading: "正在加载版本…", applied: "已应用的剪辑会显示在这里。",
    filters: { all: "全部", decisions: "审阅决定", requests: "剪辑和备注", project: "素材和设置" },
    loadingHistory: "正在加载历史记录…", filter: "筛选历史记录", empty: "暂无记录。", older: "显示更早记录",
    loadFailed: "无法加载历史记录", loadOlderFailed: "无法加载更早历史记录",
  },
  time: { now: "刚刚", minutes: (n: number) => `${n} 分钟前`, hours: (n: number) => `${n} 小时前`, days: (n: number) => `${n} 天前`, today: "今天", yesterday: "昨天" },
  learning: { notSaved: "未保存。" },
  thread: {
    reject: "拒绝剪辑", rejecting: "正在拒绝…", rejected: "已拒绝", revising: "正在修改…", revised: "已修改", kept: "已保留",
    needsCheck: "待审阅", needsReview: "待确认的剪辑", edits: "此对话的剪辑",
    numberedEdit: (number: number, title: string) => `剪辑 ${number}：${title}`,
    filed: "已归档", review: (count: number) => `审阅 ${count} 处标记的剪辑`, actions: "更多对话操作", more: "更多",
    undo: "撤销这些剪辑", file: "归档此对话", working: "正在处理…",
  },
  cutTranscript: {
    removedElsewhere: "另一处剪辑移除了这些文字",
    hideRemoved: "隐藏移除的文字", showRemoved: (count: number) => `显示移除的 ${count} 个词`,
    current: "当前片段的文字", removed: "这处剪辑移除的文字", loading: "正在加载台词…", retry: "重试加载转写稿",
  },
  player: {
    play: "播放", pause: "暂停", speed: "播放速度", slower: "降低播放速度", faster: "提高播放速度",
    fullScreen: "全屏", exitFullScreen: "退出全屏", loadingPicture: "正在加载当前画面…",
    current: "当前成片", draft: "建议草稿", proposal: "剪辑建议", source: "素材预览", footage: "素材",
    viewMedia: "查看素材", addFootage: "添加素材", addToEdit: "添加素材即可开始剪辑",
    selectedFrame: "选中剪辑的画面", versionFailed: "无法打开此版本。", openingProposal: "正在打开剪辑建议…",
    playbackFailed: "无法播放此视频。", previewFailed: "无法准备预览。", preparingPreview: "正在准备兼容的预览…",
    noPlayableFootage: "暂无可播放的素材", retryPlayback: "重试播放", retryCache: "重试播放缓存视频", retrySection: "重试播放此片段",
    editsReady: "新剪辑已就绪", pauseToSee: "暂停后查看",
  },
  transcript: {
    empty: "此剪辑中没有包含人声的素材", emptyHelp: "转写稿会显示音频和视频片段里的可听内容。",
    markUnused: "标出未用文字", unused: "剪辑中未使用", search: "搜索转写稿",
    searchKeys: "按 Enter 查看下一项，按 Shift + Enter 查看上一项", noMatches: "无匹配结果",
    loading: "正在加载转写稿…", noSpokenWords: "此处没有人声文字。",
    ask: "询问这段内容", words: "转写稿文字",
    wordControls: "单击文字定位播放头 · 双击或拖动选择文字 · 按 Shift + ← → 选择",
    unclearVoice: "说话人不明", seek: (time: string) => `跳转到 ${time}`,
  },
  marks: {
    toolbar: "标记画面",
    draw: { label: "绘制", description: "在画面上自由绘制，为下一条消息标出重点。" },
    box: { label: "框选", description: "在画面上拖出方框，为下一条消息标出区域。" },
    point: { label: "标点", description: "在画面上为下一条消息标出具体位置。" },
    undo: { label: "撤销", description: "移除此帧的最后一个标记。" },
    clear: { label: "清除标记", description: "移除此帧的所有标记。" },
  },
  timeline: {
    playhead: "播放头时间", zoomControls: "时间线缩放", zoomHint: "在时间线上滚动或使用双指缩放", zoom: "缩放",
    zoomIn: "放大", zoomOut: "缩小", fit: "按 0 显示完整视频", zoomPercent: (percent: number) => `缩放 ${percent}%`,
    position: "视频位置", frameScrub: "从画面或波形向上拖动，即可逐帧定位。", markRange: "拖动以标记消息涉及的范围",
    rangeStart: "范围起点", rangeEnd: "范围终点", adjustRange: "拖动调整 · 按住逐帧移动 · ← → 移动一帧",
    atEditEdge: "位于剪辑边缘", preciseRange: "拖动逐帧移动 · 松开以设置", loadingWaveform: "正在加载音频波形",
    needsEditor: (name: string) => `${name}待确认`,
  },
} as const;

const reviewDate = new Intl.DateTimeFormat("zh-CN");
const reviewDateTime = new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium" });
const reviewWeekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long", month: "short", day: "numeric" });

export function reviewRelTime(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = (Date.now() - t) / 1000;
  if (diff < 45) return zhReview.time.now;
  if (diff < 3600) return zhReview.time.minutes(Math.max(1, Math.floor(diff / 60)));
  if (diff < 86400) return zhReview.time.hours(Math.floor(diff / 3600));
  if (diff < 86400 * 7) return zhReview.time.days(Math.floor(diff / 86400));
  return reviewDate.format(t);
}

export function reviewAbsoluteTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : reviewDateTime.format(t);
}

export function reviewDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return zhReview.time.today;
  if (d.toDateString() === yesterday.toDateString()) return zhReview.time.yesterday;
  return reviewWeekday.format(d);
}
