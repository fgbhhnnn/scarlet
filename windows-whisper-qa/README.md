# Windows x64 Whisper 兼容性复测

在缺少 AVX2 的 Windows x64 设备上本地构建并验证 CPU 与 Vulkan 两套 Whisper。Vulkan 验证需要支持 Vulkan 的 GPU。WAV 是 2.49 秒的合成中文语音，文本为「你好，这是一段中文测试」。它的 SHA-256 是 `4c8899df252e02ac8012b2777e0602cc9379ebeb5f41943ed1e2af107b589944`。

## 构建候选

在 Windows x64 PowerShell 7.4 或更新版本中执行。使用已安装的 Visual Studio C++ x64 工具链、Windows SDK、CMake 和 Node.js 24。Vulkan 版使用项目 CI 固定的 Vulkan SDK 1.4.363.1，需要 glslc、Vulkan loader 的导入库和 SPIRV-Headers 的 CMake 配置。

以下命令从现有 Scarlet Git 仓库执行，在短路径新建工作树。构建日志和复测报告写入工作树外的证据目录。

~~~powershell
$Tree = 'C:\QA\scarlet-whisper'
$Evidence = 'C:\QA\whisper-evidence'
New-Item -ItemType Directory -Path $Evidence -Force | Out-Null
git fetch https://github.com/fgbhhnnn/scarlet.git fix/windows-whisper-x64
if ($LASTEXITCODE -ne 0) { throw 'git fetch failed' }
git worktree add --detach $Tree FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw 'git worktree add failed' }
Set-Location $Tree
$Qa = Join-Path $Tree 'windows-whisper-qa'
git rev-parse HEAD | Set-Content (Join-Path $Evidence 'commit.txt')
node --version
cmake --version
if (!$env:VULKAN_SDK) { throw 'Set VULKAN_SDK to the installed SDK directory' }
foreach ($File in @('Bin\glslc.exe', 'Lib\vulkan-1.lib', 'Include\vulkan\vulkan.h')) {
    if (!(Test-Path -LiteralPath (Join-Path $env:VULKAN_SDK $File))) { throw "Vulkan SDK missing $File" }
}
Get-ChildItem -LiteralPath $env:VULKAN_SDK -Recurse -Filter '*SPIRV-Headers*Config.cmake' -File |
    Select-Object -ExpandProperty FullName
$PreviousGitHubActions = $env:GITHUB_ACTIONS
try {
    # The builder requires both variants with this flag. It runs on this node.
    $env:GITHUB_ACTIONS = 'true'
    node apps/desktop/scripts/build-whisper.mjs 2>&1 |
        Tee-Object -FilePath (Join-Path $Evidence 'build.log')
    if ($LASTEXITCODE -ne 0) { throw 'Whisper build failed' }
} finally {
    $env:GITHUB_ACTIONS = $PreviousGitHubActions
}
~~~

如果 SPIRV-Headers 配置由本机单独安装，把其 CMake 安装前缀加入 `CMAKE_PREFIX_PATH`。保留 `build.log`，确认 CPU 和 Vulkan 各出现一次 `Adding CPU backend variant ggml-cpu:`，这两行的架构参数应为空。构建产物位于 `apps/desktop/src-tauri/binaries/`。

构建脚本改变后，Actions 的 native-runtime 缓存必须失效。Windows checkout 使用 CRLF 时，本分支预期缓存键为 `native-runtimes-x86_64-pc-windows-msvc-vulkan-1.4.363.1-56701587cfe86b3c24b88469efee4ba0ea55ecacb195840af44f5bdced571ca8`。复测脚本会把按两个构建脚本 SHA-256 摘要计算出的完整键写入 `report.json`，可与构建日志的 cache key 对照。

构建日志可在 PowerShell 中加一道门，防止误用旧的 AVX2 产物。

~~~powershell
$Configures = @(Select-String -LiteralPath (Join-Path $Evidence 'build.log') -Pattern 'Adding CPU backend variant ggml-cpu:')
if ($Configures.Count -ne 2) { throw "Expected CPU and Vulkan configure lines, found $($Configures.Count)" }
if ($Configures | Where-Object { $_.Line -match '/arch:|GGML_(AVX|AVX2|FMA|F16C|BMI2)' }) {
    throw 'The candidate still advertises AVX-family or BMI2 CPU flags.'
}
~~~

## 转写并留证

将 $Model 指向 Scarlet 已下载的多语模型 ggml-large-v3-turbo-q5_0.bin。项目固定的 SHA-256 是 394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2。同一次对比使用同一模型和 WAV。

~~~powershell
$Model = 'C:\QA\ggml-large-v3-turbo-q5_0.bin'
pwsh -NoProfile -File (Join-Path $Qa 'Test-WhisperWindows.ps1') -Repository $Tree -Model $Model -OutputDirectory $Evidence
~~~

脚本分别对 CPU 与 Vulkan 候选运行 --help 和中文转写，并保留两次操作的十进制退出码、十六进制状态、原始 stdout/stderr。证据目录中每次运行的子目录包含 report.json、Whisper JSON 和日志。报告会记录 Windows 版本、CPU 型号和 CPUID 指令集、GPU 与驱动版本、提交 SHA、构建脚本与两套二进制及模型、样片、转写 JSON 的 SHA-256。report.json 的机器校验契约在 report.schema.json，当前 schemaVersion 为 1。

报告顶层的 commit、target、cacheKey 和 recipeSha256 固定候选构建，cpuPreflight 必须通过 SSE2 检查。cpuFeatures 是 CPUID 原始特性和 OS 可用性，不能据此推断程序实际执行路径。每个 variants 项分别保存 startup、transcription 的退出状态、实际 backend、后端日志、识别语言、文本和哈希。pass 只有在启动、转写、预期后端和中文样片匹配都满足时才为 true。

两套程序都须成功启动和转写，CPU 用 -ng，Vulkan 须在转写日志中出现 whisper_backend_init_gpu: using Vulkan… backend 且初始化成功。两路都应产出对应的中文句子，允许标点和繁简差异。保留异常时的报告，0xC000001D 对应非法指令。

## 打包并复查安装后的程序

两套 sidecar 通过后，从同一个工作树构建 Windows 安装包。使用项目文档列出的桌面构建依赖。[本地打包说明](../docs/development.md#package-a-desktop-build)

~~~powershell
$Version = node apps/desktop/scripts/release-version.mjs for-commit
if ($LASTEXITCODE -ne 0) { throw 'Cannot determine build version' }
node apps/desktop/scripts/release-version.mjs set $Version
if ($LASTEXITCODE -ne 0) { throw 'Version stamp failed' }
$Version | Set-Content (Join-Path $Evidence 'version.txt')
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed' }
pnpm build
if ($LASTEXITCODE -ne 0) { throw 'pnpm build failed' }
$Bin = Join-Path $Tree 'apps/desktop/src-tauri/binaries'
pnpm --filter '@scarlet/server' build:sea -- --out (Join-Path $Bin 'scarlet-engine-x86_64-pc-windows-msvc.exe')
if ($LASTEXITCODE -ne 0) { throw 'Engine build failed' }
pnpm desktop:build
if ($LASTEXITCODE -ne 0) { throw 'Desktop packaging failed' }
$Bundle = Join-Path $Tree 'apps/desktop/src-tauri/target/release/bundle'
Get-ChildItem -LiteralPath $Bundle -Recurse -File -Include '*.msi', '*-setup.exe' |
    Get-FileHash -Algorithm SHA256 | Export-Csv -Path (Join-Path $Evidence 'installers-sha256.csv') -NoTypeInformation
~~~

验收安装包时用同一脚本，经 `-CpuExe` 和 `-VulkanExe` 指向安装目录中的 `whisper-cli.exe` 和 `whisper-gpu\whisper-cli.exe`。两套程序的 SHA-256 应与本地候选一致。在 Scarlet 界面导入同一 WAV，选择内置 Whisper 转写并保留结果截图。
