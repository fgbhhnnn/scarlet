/** Chinese copy used by the review, history and timeline panels. */
export const zhReview = {
  actions: { revise: "修改", apply: "应用" },
  before: { label: "剪辑前", backToAfter: "返回剪辑后", play: "播放剪辑前" },
  history: {
    view: "历史记录视图", versions: "剪辑版本", full: "完整历史", unknown: "未知", untitled: "未命名剪辑",
    inVersion: "此版本的剪辑", edits: (count: number) => `${count} 处剪辑`, places: (count: number) => `${count} 处`,
    revises: (label?: string) => label ? `修改了“${label}”` : "修改了较早的剪辑", revisedLater: (label: string) => `后来修改为“${label}”`,
    undone: "已撤销", current: "当前", loading: "正在加载版本…", applied: "已应用的剪辑会显示在这里。",
    filters: { all: "全部", decisions: "审阅决定", requests: "剪辑和备注", project: "素材和设置" },
    loadingHistory: "正在加载历史记录…", filter: "筛选历史记录", empty: "暂无记录。", older: "显示更早记录",
    loadFailed: "无法加载历史记录", loadOlderFailed: "无法加载更早历史记录",
  },
  time: { today: "今天", yesterday: "昨天" },
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
  timeline: {
    playhead: "播放头时间", zoomControls: "时间线缩放", zoomHint: "在时间线上滚动或使用双指缩放", zoom: "缩放",
    zoomIn: "放大", zoomOut: "缩小", fit: "按 0 显示完整视频", zoomPercent: (percent: number) => `缩放 ${percent}%`,
    position: "视频位置", frameScrub: "从画面或波形向上拖动，即可逐帧定位。", markRange: "拖动以标记消息涉及的范围",
    rangeStart: "范围起点", rangeEnd: "范围终点", adjustRange: "拖动调整 · 按住逐帧移动 · ← → 移动一帧",
    atEditEdge: "位于剪辑边缘", preciseRange: "拖动逐帧移动 · 松开以设置", loadingWaveform: "正在加载音频波形",
  },
} as const;

const reviewWeekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long", month: "short", day: "numeric" });

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
