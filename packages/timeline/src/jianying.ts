/**
 * Editable Jianying draft export. The fields below follow the public format
 * described by pyJianYingDraft (Apache-2.0) at 1e228479dda361e312e85f6037002346cf6dca9a.
 * This is the plain JSON desktop draft profile, with integer microsecond times.
 */
import type { HandoffSource } from "./handoff.js";
import { trackLayers } from "./otio.js";
import type { CaptionClip, ColorClip, MediaClip, Project, Timeline } from "./schema.js";
import { clipEnd } from "./time.js";

export interface JianyingDraftOptions {
  name: string;
  /** Absolute directory where the completed draft will be stored. */
  draftDirectory: string;
  sources: ReadonlyMap<string, HandoffSource>;
  /** The copied materials' absolute local paths, keyed by Scarlet media ID. */
  mediaPaths: ReadonlyMap<string, string>;
  /** Audio extracted from video sources when a timeline uses them on an audio track. */
  detachedAudio?: ReadonlyMap<string, { source: HandoffSource; path: string }>;
  colorStills?: ReadonlyMap<string, HandoffSource>;
  colorPaths?: ReadonlyMap<string, string>;
}

interface DraftTimeRange {
  start: number;
  duration: number;
}

interface DraftSegment {
  id: string;
  material_id: string;
  target_timerange: DraftTimeRange;
  source_timerange: DraftTimeRange | null;
  extra_material_refs: string[];
  speed: number;
  volume: number;
  render_index: number;
  track_render_index: number;
  visible: boolean;
  reverse: boolean;
  track_attribute: number;
  enable_adjust: boolean;
  enable_color_correct_adjust: boolean;
  enable_color_curves: boolean;
  enable_color_match_adjust: boolean;
  enable_color_wheels: boolean;
  enable_lut: boolean;
  enable_smart_color_adjust: boolean;
  is_tone_modify: boolean;
  last_nonzero_volume: number;
  common_keyframes: never[];
  keyframe_refs: never[];
  clip?: ReturnType<typeof visualSettings>;
  uniform_scale?: { on: boolean; value: number };
  hdr_settings?: { mode: number; intensity: number; nits: number };
}

interface DraftTrack {
  id: string;
  type: "video" | "audio" | "text";
  name: string;
  attribute: number;
  flag: number;
  is_default_name: boolean;
  segments: DraftSegment[];
}

const EMPTY_MATERIAL_KEYS = [
  "ai_translates", "audio_balances", "audio_effects", "audio_track_indexes", "beats", "canvases",
  "chromas", "color_curves", "digital_humans", "drafts", "effects", "flowers", "green_screens",
  "handwrites", "hsl", "images", "log_color_wheels", "loudnesses", "manual_deformations", "masks",
  "material_animations", "material_colors", "multi_language_refs", "placeholders", "plugin_effects",
  "primary_color_wheels", "realtime_denoises", "shapes", "smart_crops", "smart_relights", "stickers",
  "tail_leaders", "text_templates", "time_marks", "transitions", "video_effects", "video_trackings",
  "vocal_beautifys", "vocal_separations",
];

const DRAFT_PLATFORM = { app_id: 3704, app_source: "lv", app_version: "5.9.0", os: "windows" };
const JIANYING_PHOTO_DURATION = 3 * 60 * 60 * 1_000_000;

function draftId(): string {
  return globalThis.crypto.randomUUID().toUpperCase();
}

function microseconds(seconds: number): number {
  return Math.round(seconds * 1_000_000);
}

function timeRange(from: number, to: number): DraftTimeRange {
  const start = microseconds(from);
  return { start, duration: microseconds(to) - start };
}

function visualSettings(clip: MediaClip | ColorClip | CaptionClip, captionY: number) {
  const transform = clip.kind === "caption" ? undefined : clip.transform;
  const scale = transform?.scale ?? 1;
  // Jianying measures position in half-canvas units with an upward Y axis.
  const x = transform?.x ?? 0;
  const y = clip.kind === "caption" ? captionY - 0.5 : transform?.y ?? 0;
  return {
    alpha: clip.kind === "caption" ? 1 : clip.opacity,
    flip: { horizontal: false, vertical: false },
    rotation: transform?.rotation ?? 0,
    scale: { x: scale, y: scale },
    transform: { x: x * 2, y: -y * 2 },
  };
}

function videoMaterial(id: string, source: HandoffSource, path: string, duration: number, width: number, height: number) {
  return {
    id, material_id: id, local_material_id: draftId(), path, media_path: "",
    material_name: source.fileName,
    type: source.still ? "photo" : "video",
    duration, width: source.width ?? width, height: source.height ?? height,
    category_id: "", category_name: "local", check_flag: 63487, audio_fade: null,
    crop_ratio: "free", crop_scale: 1,
    crop: {
      upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0,
      lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1,
    },
  };
}

function audioMaterial(id: string, source: HandoffSource, path: string, duration: number) {
  return {
    id, local_material_id: id, music_id: id, path, name: source.fileName, duration,
    type: "extract_music", category_id: "", category_name: "local", check_flag: 3,
    app_id: 0, copyright_limit_type: "none", effect_id: "", formula_id: "", source_platform: 0,
    wave_points: [],
  };
}

function textMaterial(id: string, text: string) {
  return {
    id, type: "text", alignment: 1, typesetting: 0, line_feed: 1, line_spacing: 0.02,
    letter_spacing: 0, line_max_width: 0.9, force_apply_line_max_width: false, check_flag: 7, global_alpha: 1,
    content: JSON.stringify({
      text,
      styles: [{
        range: [0, text.length], size: 8,
        fill: { alpha: 1, content: { render_type: "solid", solid: { alpha: 1, color: [1, 1, 1] } } },
        bold: false, italic: false, underline: false, strokes: [],
      }],
    }),
  };
}

export function buildJianyingDraft(project: Project, timeline: Timeline, options: JianyingDraftOptions) {
  const { width, height, fps } = project.settings;
  const materials = {
    ...Object.fromEntries(EMPTY_MATERIAL_KEYS.map(key => [key, []])),
    videos: [] as ReturnType<typeof videoMaterial>[],
    audios: [] as ReturnType<typeof audioMaterial>[],
    texts: [] as ReturnType<typeof textMaterial>[],
    speeds: [] as Array<{ id: string; type: "speed"; speed: number; mode: 0; curve_speed: null }>,
    audio_fades: [] as Array<{ id: string; type: "audio_fade"; fade_type: 0; fade_in_duration: number; fade_out_duration: number }>,
  };
  const videos = new Map<string, ReturnType<typeof videoMaterial>>();
  const audios = new Map<string, ReturnType<typeof audioMaterial>>();
  const colors = new Map<string, ReturnType<typeof videoMaterial>>();
  const tracks: DraftTrack[] = [];
  let duration = 0;

  for (const track of timeline.tracks) {
    if (track.hidden && track.kind === "caption") continue;
    // A hidden video layer can still carry audible media.
    const type = track.kind === "caption" ? "text" : track.hidden && track.kind === "video" ? "audio" : track.kind;
    const clips = trackLayers(track.clips, false, type === "audio");
    for (const [layer, lane] of clips.entries()) {
      const segments: DraftSegment[] = [];
      for (const clip of lane.sort((a, b) => a.timelineIn - b.timelineIn)) {
        const target = timeRange(clip.timelineIn, clipEnd(clip));
        if (target.duration <= 0) continue;
        const speed = clip.kind === "media" ? clip.speed ?? 1 : 1;
        const volume = track.muted ? 0 : clip.kind === "media" ? clip.volume : 1;
        let materialId: string;
        let sourceRange: DraftTimeRange | null;

        if (clip.kind === "caption") {
          if (type !== "text" || !clip.text.trim()) continue;
          materialId = draftId();
          materials.texts.push(textMaterial(materialId, clip.text));
          sourceRange = null;
        } else {
          if (type === "text" || (type === "audio" && clip.kind === "color")) continue;
          const isColor = clip.kind === "color";
          const key = isColor ? clip.color : clip.mediaId;
          const detached = type === "audio" ? options.detachedAudio?.get(key) : undefined;
          const source = isColor ? options.colorStills?.get(key) : detached?.source ?? options.sources.get(key);
          const path = isColor ? options.colorPaths?.get(key) : detached?.path ?? options.mediaPaths.get(key);
          if (!source || !path) throw new Error("Missing copied material for Jianying draft: " + key);
          if (type === "audio" ? !source.hasAudio : !source.hasVideo) continue;

          const length = clip.kind === "media" ? clip.sourceOut - clip.sourceIn : target.duration / 1_000_000;
          sourceRange = !source.still && clip.kind === "media"
            ? timeRange(clip.sourceIn, clip.sourceOut)
            : timeRange(0, length);
          const materialDuration = source.still ? JIANYING_PHOTO_DURATION : microseconds(source.duration);
          const available = Math.max(materialDuration, sourceRange.start + sourceRange.duration);
          if (type === "audio") {
            const material = audios.get(key) ?? audioMaterial(draftId(), source, path, available);
            material.duration = Math.max(material.duration, available);
            audios.set(key, material);
            materialId = material.id;
          } else {
            const library = isColor ? colors : videos;
            const material = library.get(key) ?? videoMaterial(draftId(), source, path, available, width, height);
            material.duration = Math.max(material.duration, available);
            library.set(key, material);
            materialId = material.id;
          }
        }

        const speedId = draftId();
        materials.speeds.push({ id: speedId, type: "speed", speed, mode: 0, curve_speed: null });
        const references = [speedId];
        if (clip.kind === "media" && (clip.audioFadeIn > 0 || clip.audioFadeOut > 0)) {
          const fadeId = draftId();
          materials.audio_fades.push({
            id: fadeId, type: "audio_fade", fade_type: 0,
            fade_in_duration: microseconds(clip.audioFadeIn), fade_out_duration: microseconds(clip.audioFadeOut),
          });
          references.push(fadeId);
        }
        const captionY = clip.kind === "caption"
          ? clip.style?.y ?? track.captionStyle?.y ?? timeline.captionStyle?.y ?? 0.85
          : 0.5;
        const segment: DraftSegment = {
          id: draftId(), material_id: materialId, target_timerange: target, source_timerange: sourceRange,
          extra_material_refs: references, speed, volume, render_index: tracks.length, track_render_index: 0,
          visible: true, reverse: false, is_tone_modify: false, last_nonzero_volume: volume || 1,
          track_attribute: 0, enable_adjust: true, enable_color_correct_adjust: false, enable_color_curves: true,
          enable_color_match_adjust: false, enable_color_wheels: true, enable_lut: true, enable_smart_color_adjust: false,
          common_keyframes: [], keyframe_refs: [],
        };
        if (type !== "audio") {
          segment.clip = visualSettings(clip, captionY);
          segment.uniform_scale = { on: true, value: 1 };
        }
        if (type === "video") segment.hdr_settings = { mode: 1, intensity: 1, nits: 1000 };
        segments.push(segment);
        duration = Math.max(duration, target.start + target.duration);
      }
      if (segments.length) {
        const name = layer ? `${track.name} (layer ${layer + 1})` : track.name;
        tracks.push({ id: draftId(), type, name, attribute: Number(track.muted), flag: 0, is_default_name: !name, segments });
      }
    }
  }
  materials.audios.push(...audios.values());
  materials.videos.push(...videos.values(), ...colors.values());

  const id = draftId();
  const now = microseconds(Date.now() / 1000);
  const posix = options.draftDirectory.startsWith("/");
  const folder = options.draftDirectory.replace(posix ? /\/+$/ : /[\\/]+$/, "");
  const separatorIndex = posix ? folder.lastIndexOf("/") : Math.max(folder.lastIndexOf("/"), folder.lastIndexOf("\\"));
  const rootPath = folder.slice(0, separatorIndex + 1);
  const content = {
    id, name: options.name, duration, fps, version: 360000, new_version: "110.0.0",
    canvas_config: { width, height, ratio: "original" },
    config: {
      adjust_max_index: 1, attachment_info: [], combination_max_index: 1, export_range: null,
      extract_audio_last_index: 1, lyrics_recognition_id: "", lyrics_sync: true, lyrics_taskinfo: [],
      maintrack_adsorb: false, material_save_mode: 0, multi_language_current: "none",
      multi_language_list: [], multi_language_main: "none", multi_language_mode: "none",
      original_sound_last_index: 1, record_audio_last_index: 1, sticker_max_index: 1,
      subtitle_keywords_config: null, subtitle_recognition_id: "", subtitle_sync: true, subtitle_taskinfo: [],
      system_font_list: [], video_mute: false, zoom_info_params: null,
    },
    color_space: 0, free_render_index_mode_on: false, render_index_track_mode_on: false,
    create_time: now, update_time: now, platform: DRAFT_PLATFORM, last_modified_platform: DRAFT_PLATFORM,
    cover: null, extra_info: null, group_container: null, keyframe_graph_list: [],
    keyframes: { adjusts: [], audios: [], effects: [], filters: [], handwrites: [], stickers: [], texts: [], videos: [] },
    mutable_config: null, relationships: [], retouch_cover: null, source: "default",
    static_cover_image_path: "", time_marks: null, materials, tracks,
  };
  const metadata = {
    draft_id: id, draft_name: options.name, draft_fold_path: folder, draft_root_path: rootPath,
    draft_cover: "", draft_type: "", draft_new_version: "", draft_is_invisible: false,
    draft_materials: [0, 1, 2, 3, 6, 7, 8].map(type => ({ type, value: [] })),
    draft_materials_copied_info: [], draft_segment_extra_info: [],
    cloud_package_completed_time: "", draft_deeplink_url: "", draft_removable_storage_device: "",
    draft_cloud_capcut_purchase_info: "", draft_cloud_last_action_download: false, draft_cloud_materials: [],
    draft_cloud_purchase_info: "", draft_cloud_template_id: "", draft_cloud_tutorial_info: "",
    draft_cloud_videocut_purchase_info: "", draft_is_ai_packaging_used: false, draft_is_ai_shorts: false,
    draft_is_ai_translate: false, draft_is_article_video_draft: false, draft_is_from_deeplink: "false",
    draft_enterprise_info: { draft_enterprise_extra: "", draft_enterprise_id: "", draft_enterprise_name: "", enterprise_material: [] },
    tm_draft_cloud_completed: "", tm_draft_cloud_modified: 0,
    tm_draft_create: now, tm_draft_modified: now, tm_draft_removed: 0, tm_duration: duration,
  };
  return { content, metadata };
}
