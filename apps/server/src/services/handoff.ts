/**
 * The folder an editor takes to DaVinci Resolve, Final Cut Pro or Premiere Pro: timeline files, the captions, a Read me
 * and a copy of the footage. The engine says what goes in it; the desktop app writes it where the editor chose.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LOCAL_MEDIA_INPUT, SOURCE_AUDIO_CLOCK } from "@scarlet/render";
import {
  buildJianyingDraft, captionTracks, clipDuration, exactRate, handoffFileNames, handoffLosses, handoffRateWarnings, handoffReadMe, isDropFrameRate,
  parseColor, timecodeFrames, timelineToSrt, toFcpxml, toOtio, usedMedia, type HandoffSource, type Project, type Timeline,
} from "@scarlet/timeline";
import type { HandoffFile, HandoffFormat } from "@scarlet/shared";
import type { Ctx } from "../context.js";
import { badRequest } from "../errors.js";
import { ffmpeg, FfmpegError, ffprobe } from "../render/ffmpeg.js";
import { safeFileName } from "./fileName.js";

interface ProbedStream {
  codec_type?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  width?: number;
  height?: number;
  channels?: number;
  sample_rate?: string;
  disposition?: { attached_pic?: number };
  tags?: Record<string, string>;
}

/** What another app needs to know about a file that Scarlet's own record leaves out: its timecode and its sound. */
async function probeForHandoff(file: string, signal?: AbortSignal) {
  try {
    const out = await ffprobe(["-print_format", "json", "-show_format", "-show_streams", file], { signal });
    const json = JSON.parse(out.toString("utf8")) as { format?: { tags?: Record<string, string> }; streams?: ProbedStream[] };
    const streams = json.streams ?? [];
    const audio = streams.filter(s => s.codec_type === "audio");
    const video = streams.find(s => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
    const timecode = streams.find(s => s.codec_type === "data" && s.tags?.timecode)?.tags?.timecode ?? video?.tags?.timecode ??
      json.format?.tags?.timecode;
    return { timecode, audioStreams: audio.length, channels: audio[0]?.channels, sampleRate: Number(audio[0]?.sample_rate) || undefined };
  } catch {
    // A file ffprobe can't read still goes in the folder; it starts at zero.
    return { audioStreams: undefined, channels: undefined, sampleRate: undefined, timecode: undefined };
  }
}

/** A frame-sized PNG of one colour, for a solid colour clip: every app reads a still, and none shares a solid generator. */
async function solidPng(color: string, width: number, height: number, signal?: AbortSignal): Promise<Buffer> {
  const { color: c, alpha } = parseColor(color)!;
  return ffmpeg(["-f", "lavfi", "-i", `color=c=${c}@${alpha}:s=${width}x${height}`, "-frames:v", "1", "-pix_fmt", "rgba",
    "-f", "image2pipe", "-c:v", "png", "pipe:1"], { signal });
}

/** Keep an editable copy of the first audio stream on the same source clock as the video. */
async function detachedWav(file: string, cache: string, cacheKey: string, assetName: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const key = createHash("sha256").update(cacheKey).digest("hex");
  const output = join(cache, `dialogue-${key}.wav`);
  const size = await stat(output).then(info => info.size, () => undefined);
  if (size !== undefined) return { output, size };

  await mkdir(cache, { recursive: true });
  const staged = `${output}.${randomUUID()}.part`;
  try {
    await ffmpeg([...LOCAL_MEDIA_INPUT, "-i", file, "-map", "0:a:0", "-vn", "-map_metadata", "-1",
      "-af", SOURCE_AUDIO_CLOCK, "-c:a", "pcm_s16le", "-f", "wav", "-rf64", "auto", staged], { signal });
    signal?.throwIfAborted();
    const { size: stagedSize } = await stat(staged);
    try {
      await rename(staged, output);
      return { output, size: stagedSize };
    } catch (error) {
      // A concurrent export can finish this same cache entry first.
      const existing = await stat(output).catch(() => undefined);
      if (!existing?.isFile()) throw error;
      return { output, size: existing.size };
    }
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof FfmpegError) throw badRequest("jianying_audio_extract", `Could not extract audio from “${assetName}”.`);
    throw error;
  } finally {
    await rm(staged, { force: true });
  }
}

export interface Handoff {
  /** The folder's contents, paths relative to it. */
  files: HandoffFile[];
  /** Bytes of footage the folder copies. */
  mediaBytes: number;
}

/**
 * Everything the hand-off folder holds. `folder` is where the desktop app will write it, so the timeline files can
 * link the copies by their full path, which every app opens without asking.
 */
export async function buildHandoff(ctx: Ctx, project: Project, timeline: Timeline, folder: string, signal?: AbortSignal, format?: HandoffFormat): Promise<Handoff> {
  if (!isAbsolute(folder)) throw badRequest("handoff_folder", "Choose where to save the folder.");
  const base = safeFileName(folder.split(/[\\/]/).filter(Boolean).pop() || project.name).trim() || "Scarlet";
  const assets = usedMedia(project, timeline);
  const colors = [...new Set(timeline.tracks.flatMap(track => track.clips.flatMap(clip => clip.kind === "color" && parseColor(clip.color) ? [clip.color] : [])))];
  const audioMediaIds = new Set<string>();
  if (format === "jianying") {
    for (const track of timeline.tracks) {
      if (track.kind !== "audio" && !(track.kind === "video" && track.hidden)) continue;
      for (const clip of track.clips) {
        if (clip.kind === "media" && clip.enabled !== false && clipDuration(clip) > 0) audioMediaIds.add(clip.mediaId);
      }
    }
  }
  const detachedAssets = assets.filter(asset => asset.kind === "video" && asset.hasAudio !== false && audioMediaIds.has(asset.id));
  const names = handoffFileNames([
    ...assets.map(a => extname(a.name) ? a.name : `${a.name}${extname(a.path)}`),
    ...colors.map(color => `Solid ${color.replace(/^#/, "")}.png`),
    ...detachedAssets.map(asset => `${basename(asset.name, extname(asset.name))} audio.wav`),
  ]);
  const mediaUrl = (name: string) => pathToFileURL(join(folder, "Media", name)).href;
  const files: HandoffFile[] = [];
  const sources = new Map<string, HandoffSource>();
  const detachedAudio = new Map<string, { source: HandoffSource; path: string }>();
  const detachedNames = new Map(detachedAssets.map((asset, i) => [asset.id, names[assets.length + colors.length + i]!]));
  let mediaBytes = 0;
  const root = ctx.paths.media(project.id);
  for (const [i, asset] of assets.entries()) {
    const file = join(root, asset.path);
    const info = await stat(file).catch(() => undefined);
    if (!info) throw badRequest("handoff_media_missing", `“${asset.name}” isn't in the project's media any more.`);
    const { size } = info;
    mediaBytes += size;
    const probed = await probeForHandoff(file, signal);
    const rate = asset.kind === "video" || asset.kind === "graphic" ? exactRate(asset.fps ?? project.settings.fps).rate : undefined;
    const tcRate = rate ?? exactRate(project.settings.fps).rate;
    const frames = probed.timecode ? timecodeFrames(probed.timecode, tcRate) : undefined;
    sources.set(asset.id, {
      url: mediaUrl(names[i]!), fileName: names[i]!,
      timecode: frames ? { frames, rate: tcRate, dropFrame: /[;,]/.test(probed.timecode!) && isDropFrameRate(tcRate) } : undefined,
      rate, width: asset.width, height: asset.height,
      hasVideo: asset.kind !== "audio",
      hasAudio: asset.kind === "audio" || (asset.kind === "video" && asset.hasAudio !== false &&
        (format !== "jianying" || probed.audioStreams !== 0)),
      audioChannels: probed.channels, audioRate: probed.sampleRate, audioStreams: probed.audioStreams,
      duration: asset.duration ?? 0, still: asset.kind === "image" || (asset.kind === "graphic" && !asset.duration),
    });
    files.push({ path: `Media/${names[i]}`, source: file, size });
    const audioName = detachedNames.get(asset.id);
    if (audioName && probed.audioStreams !== 0) {
      const cacheKey = JSON.stringify([file, size, info.mtimeMs, info.ctimeMs]);
      const wav = await detachedWav(file, join(ctx.paths.tmp, "handoff"), cacheKey, asset.name, signal);
      detachedAudio.set(asset.id, {
        source: { url: mediaUrl(audioName), fileName: audioName, hasVideo: false, hasAudio: true,
          duration: asset.duration ?? 0, audioChannels: probed.channels, audioRate: probed.sampleRate, audioStreams: 1 },
        path: join(folder, "Media", audioName),
      });
      files.push({ path: `Media/${audioName}`, source: wav.output, size: wav.size });
      mediaBytes += wav.size;
    }
  }

  // Solid colour clips become stills of their colour.
  const colorStills = new Map<string, HandoffSource>();
  const { width, height } = project.settings;
  for (const [i, color] of colors.entries()) {
    const name = names[assets.length + i]!;
    colorStills.set(color, { url: mediaUrl(name), fileName: name, hasVideo: true, hasAudio: false, width, height, duration: 0, still: true });
    // Kept in the library's temporary folder, where the desktop app copies from; the same colour and size reuse it.
    const still = join(ctx.paths.tmp, "handoff", `${Buffer.from(`${color}:${width}x${height}`).toString("hex")}.png`);
    const size = await stat(still).then(s => s.size, async () => {
      await mkdir(join(ctx.paths.tmp, "handoff"), { recursive: true });
      const png = await solidPng(color, width, height, signal);
      const staged = `${still}.${randomUUID()}.part`;
      try {
        await writeFile(staged, png);
        await rename(staged, still);
      } finally {
        await rm(staged, { force: true });
      }
      return png.length;
    });
    files.push({ path: `Media/${name}`, source: still, size });
  }

  if (format === "jianying") {
    const { content, metadata } = buildJianyingDraft(project, timeline, {
      name: basename(folder), draftDirectory: folder, sources, colorStills, detachedAudio,
      mediaPaths: new Map([...sources].map(([id, source]) => [id, fileURLToPath(source.url)])),
      colorPaths: new Map([...colorStills].map(([color, source]) => [color, fileURLToPath(source.url)])),
    });
    files.unshift(
      { path: "draft_content.json", text: JSON.stringify(content) },
      { path: "draft_meta_info.json", text: JSON.stringify(metadata) },
    );
    return { files, mediaBytes };
  }

  const fcpxml = `${base}.fcpxml`, otio = `${base}.otio`;
  files.unshift(
    { path: fcpxml, text: toFcpxml(project, timeline, sources, { colorStills }) },
    { path: otio, text: JSON.stringify(toOtio(project, timeline, { sources }), null, 2) },
  );
  const captions = captionTracks(timeline);
  const captionFiles = handoffFileNames(captions.map(({ track }) =>
    captions.length > 1 ? `${base} captions (${safeFileName(track.name)}).srt` : `${base} captions.srt`));
  for (const [i, { track }] of captions.entries()) {
    files.push({ path: captionFiles[i]!, text: timelineToSrt(timeline, { trackId: track.id }) });
  }
  files.push({ path: "Read me.txt", text: handoffReadMe({
    projectName: project.name, timelineFiles: { fcpxml, otio }, captionFiles,
    losses: handoffLosses(project, timeline, sources), warnings: handoffRateWarnings(project, timeline, sources),
  }) });
  return { files, mediaBytes };
}
