import { workspace } from "./zhWorkspace";
import { zhModels } from "./zhModels";
import { zhReview } from "./zhReview";
import { zhSettings } from "./zhSettings";

/** Simplified Chinese interface text. */
export const zh = {
  workspace,
  review: zhReview,
  settingsDetails: zhSettings,
  learning: { title: "学习规则", retry: "重试", loadFailed: "无法加载技能。", empty: "暂无学习规则。", waiting: "你提出的规则会在这里等待确认。", said: "你说过", replaces: "替换", saveTo: "保存到", chooseSkill: "选择技能", saving: "保存中…", revise: "修改", approve: "批准", decline: "拒绝", rule: "规则" },
  terms: { import: "导入", analyze: "分析", timeline: "时间线", review: "审阅", export: "导出", draft: "草稿" },
  common: {
    cancel: "取消", save: "保存", close: "关闭", retry: "重试", clear: "清除", add: "添加", remove: "移除",
    loading: "加载中…", select: "选择", projects: "项目", project: "项目", settings: "设置", allProjects: "全部项目",
    somethingWrong: "出了点问题", unavailable: "不可用", yes: "是", no: "否", confirm: "确认", closeShortcut: "关闭（Esc）",
  },
  project: {
    actions: "项目操作", rename: "重命名", archive: "归档", unarchive: "取消归档", pause: "暂停", resume: "恢复",
    pauseMedia: "暂停媒体处理", resumeMedia: "恢复媒体处理", moveToTrash: "移到废纸篓", projectName: "项目名称",
    moveToTrashQuestion: (name: string) => `将“${name}”移到废纸篓？`, restoreTrash: (name: string) => `恢复“${name}”后即可在此打开。`,
    restore: "恢复项目", inTrash: "项目在废纸篓中", active: "进行中", archived: "已归档", lastEdited: "最后编辑",
    listView: "列表视图", gridView: "网格视图", selectAll: "选择所有可见项目", selectProject: (name: string) => `选择${name}`,
    openProject: (name: string) => `打开${name}`, addFiles: (name: string) => `向${name}添加文件`, adding: (n: number) => `正在添加 ${n} 个文件…`,
    nothingNeedsYou: "暂无待处理事项", needsYou: (n: number) => `${n} 项待审阅`, selected: (n: number) => `已选择 ${n} 项`,
    viewActive: "查看进行中的项目", viewArchived: "查看已归档项目", noActive: "没有进行中的项目", noArchived: "没有已归档的项目",
  },
  create: {
    newProject: "新建项目", quickStart: "快速开始", create: "创建项目", createAndImport: "创建并导入", enterName: "输入项目名称",
    chooseFiles: "选择文件…", addFiles: "添加文件…", selectedFiles: "已选文件", dropVideos: "拖放视频以导入", mediaFiles: "媒体文件",
    addFromLink: "从链接导入", linkOrPath: "链接或文件路径", add: "导入", dropToCreate: "用这些文件创建项目",
    firstEdit: "开始第一次剪辑", firstEditBody: "把素材拖到这里，然后告诉 Scarlet 你想修改什么。", addFootage: "添加素材",
    askEdit: "提出剪辑要求", playback: "播放成片", closeMedia: "关闭媒体面板，然后输入或说出剪辑要求。",
  },
  export: {
    latestEdit: "正在加载最新剪辑以导出字幕…", noCaptionTrack: "没有可导出的字幕轨道。", noCaptionsInRange: "所选范围内没有字幕。",
    sampleOnly: "独立演示可以保存自带的 MP4。请在项目库中的项目使用自定义导出设置。",
    progressFor: (name: string) => `导出进度：${name}`, files: (count: number) => `${count} 个文件`, cancelExport: "取消导出",
    start: "从", end: "到", changed: "视频已更改，请重新导出最新版本。", expired: "导出位置已失效，请重新选择。",
    mismatch: "导出任务与当前视频不符。", renderStopped: "渲染已停止。", destinationError: "无法保存或读取导出位置。",
    title: "导出", advanced: "高级导出", back: "返回", format: "格式", range: "范围", whole: "整段视频", custom: "自定义范围",
    video: "视频", captions: "字幕", track: "轨道", options: "视频选项", resolution: "分辨率", quality: "质量", projectSize: "项目尺寸",
    compressed: "压缩", high: "高质量", original: "原始质量", cancel: "取消", close: "关闭", continueEditing: "继续编辑",
    retry: "重试", saveFile: "保存文件…", saveFolder: "保存文件夹…", chooseLocation: "选择保存位置…", waiting: "等待开始",
    exporting: "正在导出", finishing: "正在完成…", showInFolder: "在文件夹中显示", earlier: "较早版本", exported: "已导出",
    exportVideo: "导出视频", exportCaptions: "导出字幕", exportDraft: "导出草稿", noVideo: "还没有可导出的视频。",
    invalidRange: (end: string) => `请输入 0:00 到 ${end} 之间的范围，至少一帧。`, earlierExport: "正在导出较早版本",
    background: "导出会在后台继续，你可以继续编辑。", folderSummary: "用于在其他剪辑软件中继续编辑的文件夹。",
    timeline: "时间线", footage: "素材副本", readme: "打开说明", captionsFile: "字幕文件", notCarried: "不会带入",
    more: (n: number) => `另有 ${n} 项，详见说明文件`, star: "在 GitHub 上 Star", exportedVideo: "视频已导出",
    openGithubFailed: "无法打开 GitHub，请重试。", dismiss: "关闭提示", editingProject: "剪辑工程（.fcpxml 和 .otio）",
    jianying: "剪映草稿（剪映）", jianyingSummary: "保存到剪映草稿库。草稿文件夹包含剪点、音频、字幕和素材副本。",
  },
  shorts: {
    vertical: "竖屏 · 9:16", square: "方形 · 1:1", portrait: "竖屏 · 4:5",
    length: (seconds: number) => `每条不超过 ${seconds < 120 ? `${seconds} 秒` : `${seconds / 60} 分钟`}`,
    maxCount: (count: number) => `最多 ${count} 条`, making: "正在制作短视频…", count: "数量", shape: "画面比例", duration: "时长",
    on: "开启", off: "关闭", description: "每条短视频会创建一个新项目，使用当前成片作为素材，保留原项目。",
    missingVideo: "请先将素材加入时间线，再制作短视频。",
  },
  shell: { openingProject: "正在打开项目…", loadingHistory: "正在加载剪辑历史…", projectFailed: "无法打开项目", historyFailed: "无法加载剪辑历史", demo: "演示", settings: "设置", createSkill: "创建技能", chooseModels: "选择模型", signIn: "登录", backToProject: "返回项目", offline: "离线：实时更新已暂停", reconnecting: "正在重新连接 Scarlet…" },
  model: { ...zhModels, model: "模型", models: "模型", connecting: "连接中…", offline: "离线", choose: "选择模型", chooseVisible: "选择可见模型", setup: "设置模型", refresh: "刷新模型", search: "搜索模型…", favorites: "收藏", effort: "思考强度", speed: "速度", standard: "标准", manage: "管理模型…", signIn: "管理登录…", noMatch: "没有匹配的模型。", providerDefault: "提供方默认" },
  ui: {
    review: {
      before: "剪辑前", retryPreview: "重试预览", retryBefore: "重新打开剪辑前的版本",
      openingBefore: "正在打开剪辑前的版本…", retryFrame: "重新加载画面", loadingFrame: "正在加载画面…",
      otherTakes: "其他录制版本",
      activeTime: "运行时间", total: "总计",
      estimatedCost: "预计费用",
    },
    player: {
      draft: "建议草稿", current: "当前成片", pause: "暂停",
      retryCached: "重试播放缓存视频", newEdits: "新剪辑已就绪", pauseToSee: "暂停后查看",
      retryPlayback: "重试播放", play: "播放", loading: "正在加载当前片段…", couldNotPlay: "无法播放此视频。",
      preparing: "正在准备兼容的预览…", retrySection: "重试播放此片段", undo: "撤销", clearMarks: "清除标记",
      markPicture: "标记画面",
    },
  },
} as const;

export const translationInventory = {
  scope: "F-01 桌面端全中文化第一批",
  files: ["ProjectsPage.tsx", "ExportVideo.tsx", "ExportMenuItem.tsx", "ExportStarNotice.tsx", "ProjectLayout.tsx", "WorkspaceNavigation.tsx"],
  terms: zh.terms,
  rightClickMenu: "当前代码没有独立右键菜单组件，项目操作 Dropdown 作为同一批菜单入口完成中文化。",
} as const;
