export const zhMedia = {
  title: "媒体",
  addFiles: "添加文件",
  chooseFiles: "选择文件",
  preview: "预览素材",
  caching: "正在缓存",
  transcription: "转写",
  setupTranscription: "设置转写",
} as const;

export const zhSettings = {
  general: "常规",
  models: "模型",
  tools: "工具与技能",
  usage: "用量",
  advanced: "高级",
  about: "关于",
  loadError: "无法加载服务器设置",
  loading: "正在加载设置…",
} as const;

const transcriptionIssues: Readonly<Record<string, string>> = {
  "Transcription is disabled in Settings.": "转写已在设置中关闭。",
  "OpenAI transcription is unavailable.": "OpenAI 转写不可用。",
  "OpenAI transcription needs an API key.": "OpenAI 转写需要 API 密钥。",
  "Local transcription is unavailable.": "本地转写不可用。",
  "Choose a local model file or adapter executable in Advanced settings.": "请在高级设置中选择本地模型文件或适配器程序。",
  "Choose local files for the model and adapter.": "请选择本地模型文件和适配器程序。",
  "Choose a Windows executable (.exe) for the local adapter.": "请选择 Windows 可执行文件（.exe）作为本地适配器。",
  "CrisperWhisper setup is in progress. The bundled Whisper runtime is unavailable.": "正在安装 CrisperWhisper。内置 Whisper 运行环境不可用。",
  "CrisperWhisper is not installed. The bundled Whisper runtime is unavailable.": "尚未安装 CrisperWhisper。内置 Whisper 运行环境不可用。",
  "The bundled Whisper runtime is unavailable.": "内置 Whisper 运行环境不可用。",
  "The local adapter executable is missing or cannot be run.": "本地适配器程序缺失或无法运行。",
  "The selected model file is missing, empty or unreadable.": "所选模型文件缺失、为空或无法读取。",
};

/** Settings and Media can display these messages for projects saved by an older engine. */
export function localizedTranscriptionIssue(message: string): string {
  return Object.hasOwn(transcriptionIssues, message) ? transcriptionIssues[message]! : message;
}
