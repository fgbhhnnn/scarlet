/** First Chinese desktop copy pass for the project library and delivery flow. */
export const zh = {
  terms: { import: "导入", analyze: "分析", timeline: "时间线", review: "审阅", export: "导出", draft: "草稿" },
  common: {
    cancel: "取消", save: "保存", close: "关闭", retry: "重试", clear: "清除", add: "添加", remove: "移除",
    loading: "加载中…", select: "选择", projects: "项目", project: "项目", settings: "设置", allProjects: "全部项目",
    somethingWrong: "出了点问题",
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
    title: "导出", advanced: "高级导出", back: "返回", format: "格式", range: "范围", whole: "整段视频", custom: "自定义范围",
    video: "视频", captions: "字幕", track: "轨道", options: "视频选项", resolution: "分辨率", quality: "质量", projectSize: "项目尺寸",
    editingProject: "编辑项目（.fcpxml 和 .otio）", jianyingDraft: "剪映草稿",
    jianyingDescription: "保存到剪映草稿库。草稿文件夹包含剪点、音频、字幕和素材副本。",
    from: "从", to: "到", noVideo: "还没有可导出的视频。",
    invalidRange: (end: string) => `请输入 0:00 到 ${end} 之间的范围，至少一帧。`,
    sampleOnly: "示例项目只能保存内置 MP4，素材项目可使用自定义视频设置。",
    exportProgress: (name: string) => `导出进度：${name}`,
    compressed: "压缩", high: "高质量", original: "原始质量", cancel: "取消", close: "关闭", continueEditing: "继续编辑",
    retry: "重试", saveFile: "保存文件…", saveFolder: "保存文件夹…", chooseLocation: "选择保存位置…", waiting: "等待开始",
    exporting: "正在导出", finishing: "正在完成…", showInFolder: "在文件夹中显示", earlier: "较早版本", exported: "已导出",
    exportVideo: "导出视频", exportCaptions: "导出字幕", exportDraft: "导出草稿", earlierExport: "正在导出较早版本",
    background: "导出会在后台继续，你可以继续编辑。", folderSummary: "用于在其他剪辑软件中继续编辑的文件夹。",
    timeline: "时间线", footage: "素材副本", readme: "打开说明", captionsFile: "字幕文件", notCarried: "不会带入",
    more: (n: number) => `另有 ${n} 项，详见说明文件`, star: "在 GitHub 上 Star", exportedVideo: "视频已导出",
    openGithubFailed: "无法打开 GitHub，请重试。", dismiss: "关闭提示",
  },
  shell: { demo: "演示", settings: "设置", createSkill: "创建技能", chooseModels: "选择模型", signIn: "登录", backToProject: "返回项目", offline: "离线：实时更新已暂停", reconnecting: "正在重新连接 Scarlet…" },
} as const;

export const translationInventory = {
  scope: "F-01 桌面端全中文化第一批",
  files: ["ProjectsPage.tsx", "ExportVideo.tsx", "ExportMenuItem.tsx", "ExportStarNotice.tsx", "ProjectLayout.tsx", "WorkspaceNavigation.tsx"],
  terms: zh.terms,
  rightClickMenu: "当前代码没有独立右键菜单组件，项目操作 Dropdown 作为同一批菜单入口完成中文化。",
} as const;
