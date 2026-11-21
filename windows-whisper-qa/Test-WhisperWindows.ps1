#Requires -Version 7.4
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Repository,
    [Parameter(Mandatory)][string]$Model,
    [string]$Wav = (Join-Path $PSScriptRoot 'mandarin-tts-16k.wav'),
    [string]$CpuExe,
    [string]$VulkanExe,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'results')
)

$ErrorActionPreference = 'Stop'
if (!$IsWindows -or ![System.Runtime.Intrinsics.X86.X86Base]::IsSupported -or
    [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -ne 'X64') {
    throw 'Run on Windows using x64 PowerShell 7.4 or newer.'
}

$Repository = (Resolve-Path -LiteralPath $Repository).Path
$Model = (Resolve-Path -LiteralPath $Model).Path
$Wav = (Resolve-Path -LiteralPath $Wav).Path
$Revision = & git -C $Repository rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot determine candidate commit.' }
$Bin = Join-Path $Repository 'apps/desktop/src-tauri/binaries'
if (!$CpuExe) { $CpuExe = Join-Path $Bin 'whisper-cli-x86_64-pc-windows-msvc.exe' }
if (!$VulkanExe) { $VulkanExe = Join-Path $Bin 'whisper-gpu/whisper-cli.exe' }

$Run = (New-Item -ItemType Directory -Force -Path (Join-Path $OutputDirectory (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))).FullName
$HighestLeaf = [System.Runtime.Intrinsics.X86.X86Base]::CpuId(0, 0).Item1
$Leaf1 = [System.Runtime.Intrinsics.X86.X86Base]::CpuId(1, 0)
$Leaf7Ebx = if ($HighestLeaf -ge 7) { [System.Runtime.Intrinsics.X86.X86Base]::CpuId(7, 0).Item2 } else { 0 }
$HasSse2 = [bool]($Leaf1.Item4 -band (1 -shl 26))
if (!$HasSse2) { throw 'This x64 process reports no SSE2 support. Do not start either Whisper binary.' }

function Get-NativeRuntimeCacheSuffix {
    param([string[]]$Paths)
    $Inner = [Security.Cryptography.IncrementalHash]::CreateHash([Security.Cryptography.HashAlgorithmName]::SHA256)
    try {
        # Keep the same file order as hashFiles(...) in desktop-build.yml. On Windows Get-FileHash sees the
        # checked-out CRLF bytes, matching Actions' hashFiles digest.
        foreach ($Path in $Paths) {
            $Digest = [Convert]::FromHexString((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash)
            $Inner.AppendData($Digest)
        }
        [Convert]::ToHexString($Inner.GetHashAndReset()).ToLowerInvariant()
    } finally { $Inner.Dispose() }
}

$WhisperRecipe = Join-Path $Repository 'apps/desktop/scripts/build-whisper.mjs'
$SpeakerRecipe = Join-Path $Repository 'apps/desktop/scripts/build-speaker-gpu.mjs'
$CacheSuffix = Get-NativeRuntimeCacheSuffix @($WhisperRecipe, $SpeakerRecipe)
$Report = [ordered]@{
    schemaVersion = 1
    schema = 'windows-whisper-qa/report.schema.json'
    generatedAt = [DateTime]::UtcNow.ToString('o')
    commit = $Revision
    target = 'x86_64-pc-windows-msvc'
    recipeSha256 = (Get-FileHash -LiteralPath $WhisperRecipe -Algorithm SHA256).Hash
    cacheKey = "native-runtimes-x86_64-pc-windows-msvc-vulkan-1.4.363.1-$CacheSuffix"
    cpuBaseline = 'x64 SSE2, AVX2 not required'
    cpuPreflight = [ordered]@{ passed = $true; SSE2 = $HasSse2 }
    os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture
    cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, Architecture, NumberOfCores, NumberOfLogicalProcessors)
    cpuFeatures = [ordered]@{
        SSE2   = [bool]($Leaf1.Item4 -band (1 -shl 26))
        SSE42  = [bool]($Leaf1.Item3 -band (1 -shl 20))
        AVX    = [bool]($Leaf1.Item3 -band (1 -shl 28))
        OSXSAVE = [bool]($Leaf1.Item3 -band (1 -shl 27))
        AVXUsable = [System.Runtime.Intrinsics.X86.Avx]::IsSupported
        AVX2   = [bool]($Leaf7Ebx -band (1 -shl 5))
        FMA    = [bool]($Leaf1.Item3 -band (1 -shl 12))
        F16C   = [bool]($Leaf1.Item3 -band (1 -shl 29))
        BMI2   = [bool]($Leaf7Ebx -band (1 -shl 8))
    }
    gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion)
    model = [IO.Path]::GetFileName($Model)
    modelSha256 = (Get-FileHash -LiteralPath $Model -Algorithm SHA256).Hash
    wav = [IO.Path]::GetFileName($Wav)
    wavSha256 = (Get-FileHash -LiteralPath $Wav -Algorithm SHA256).Hash
}

function Invoke-Whisper {
    param([string]$Binary, [string]$Label, [string[]]$Arguments, [int]$TimeoutSeconds)

    $Stdout = [IO.File]::Create((Join-Path $Run ($Label + '.stdout.log')))
    $Stderr = [IO.File]::Create((Join-Path $Run ($Label + '.stderr.log')))
    $Process = [Diagnostics.Process]::new()
    try {
        $Process.StartInfo.FileName = $Binary
        $Process.StartInfo.UseShellExecute = $false
        $Process.StartInfo.CreateNoWindow = $true
        $Process.StartInfo.RedirectStandardOutput = $true
        $Process.StartInfo.RedirectStandardError = $true
        foreach ($Argument in $Arguments) { $Process.StartInfo.ArgumentList.Add($Argument) }
        [void]$Process.Start()
        $CopyOutput = $Process.StandardOutput.BaseStream.CopyToAsync($Stdout)
        $CopyError = $Process.StandardError.BaseStream.CopyToAsync($Stderr)
        $TimedOut = !$Process.WaitForExit($TimeoutSeconds * 1000)
        if ($TimedOut -and !$Process.HasExited) { $Process.Kill($true) }
        $Process.WaitForExit()
        [void]$CopyOutput.GetAwaiter().GetResult()
        [void]$CopyError.GetAwaiter().GetResult()
        [ordered]@{
            exitCode = $Process.ExitCode
            exitHex = '0x' + $Process.ExitCode.ToString('X8')
            timedOut = $TimedOut
            ok = !$TimedOut -and $Process.ExitCode -eq 0
        }
    } catch {
        [ordered]@{ ok = $false; error = $_.Exception.Message }
    } finally {
        $Process.Dispose()
        $Stderr.Dispose()
        $Stdout.Dispose()
    }
}

function Test-Variant {
    param([string]$Label, [string]$Binary, [switch]$Gpu)

    $Result = [ordered]@{ variant = $Label; pass = $false }
    try {
        $File = Get-Item -LiteralPath $Binary
        if ($File.Length -eq 0) { throw 'Empty whisper-cli placeholder.' }
        $Result.file = $File.Name
        $Result.sha256 = (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash
        $Receipt = $File.FullName + '.sha256'
        if (Test-Path -LiteralPath $Receipt) { $Result.buildReceipt = Get-Content -LiteralPath $Receipt -Raw }
        $Result.startup = Invoke-Whisper -Binary $File.FullName -Label "$Label-help" -Arguments @('--help') -TimeoutSeconds 30

        $Prefix = Join-Path $Run "$Label-transcript"
        # Keep whisper.cpp diagnostics enabled for backend verification.
        $WhisperArgs = @('-m', $Model, '-f', $Wav, '-ojf', '-of', $Prefix, '-l', 'zh', '-t', '4', '-mc', '0')
        if (!$Gpu) { $WhisperArgs += '-ng' }
        $Result.transcription = Invoke-Whisper -Binary $File.FullName -Label $Label -Arguments $WhisperArgs -TimeoutSeconds 300
        $StderrText = Get-Content -LiteralPath (Join-Path $Run "$Label.stderr.log") -Raw -Encoding utf8
        $Result.backendLines = @($StderrText -split '\r?\n' | Where-Object { $_ -match '^system_info:|^whisper_backend_init_gpu:|ggml_vulkan:' })
        $UsesVulkan = $StderrText -match '(?m)^whisper_backend_init_gpu: using Vulkan\d* backend' -and
                       $StderrText -notmatch '(?m)^whisper_backend_init_gpu: failed to initialize Vulkan'
        $HasCpu = $StderrText -match '(?m)^system_info:.*\bCPU\s*:'
        $Result.backend = if ($UsesVulkan) { 'Vulkan' } elseif ($HasCpu) { 'CPU' } else { 'unconfirmed' }
        $Result.expectedBackend = if ($Gpu) { 'Vulkan' } else { 'CPU' }

        $JsonPath = $Prefix + '.json'
        if (Test-Path -LiteralPath $JsonPath) {
            $Result.transcriptSha256 = (Get-FileHash -LiteralPath $JsonPath -Algorithm SHA256).Hash
            $Transcript = Get-Content -LiteralPath $JsonPath -Raw -Encoding utf8 | ConvertFrom-Json
            $Result.language = $Transcript.result.language
            $Result.text = ($Transcript.transcription.text -join '').Trim()
            $Normalized = $Result.text -replace '[\p{P}\p{Z}\s]', ''
            $Result.fixtureMatched = $Normalized -match '你好这是一段中文[測测][試试]|你好這是一段中文[測测][試试]'
        }
        $Result.pass = $Result.startup.ok -and $Result.transcription.ok -and
                       $Result.backend -eq $Result.expectedBackend -and
                       $Result.language -eq 'zh' -and $Result.fixtureMatched
    } catch {
        $Result.error = $_.Exception.Message
    }
    $Result
}

$Report.variants = @(
    Test-Variant -Label 'cpu' -Binary $CpuExe
    Test-Variant -Label 'vulkan' -Binary $VulkanExe -Gpu
)
$ReportPath = Join-Path $Run 'report.json'
$Report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding utf8
Write-Host $ReportPath
if ($Report.variants | Where-Object { !$_.pass }) { exit 1 }
exit 0
