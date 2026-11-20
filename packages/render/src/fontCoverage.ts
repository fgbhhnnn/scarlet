import fs from "node:fs";

const CJK_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function hasCjkCaptionText(text: string): boolean {
  return CJK_CHARACTER.test(text);
}

type GlyphLookup = (codePoint: number) => boolean;

function format4Glyph(data: Buffer, offset: number): GlyphLookup {
  const count = data.readUInt16BE(offset + 6) / 2;
  const ends = offset + 14;
  const starts = ends + 2 * count + 2;
  const deltas = starts + 2 * count;
  const ranges = deltas + 2 * count;
  return codePoint => {
    if (codePoint > 0xffff) return false;
    let lo = 0;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (data.readUInt16BE(ends + 2 * mid) < codePoint) lo = mid + 1;
      else hi = mid;
    }
    if (lo === count) return false;
    const start = data.readUInt16BE(starts + 2 * lo);
    if (start > codePoint) return false;
    const delta = data.readInt16BE(deltas + 2 * lo);
    const address = ranges + 2 * lo;
    const range = data.readUInt16BE(address);
    if (!range) return ((codePoint + delta) & 0xffff) !== 0;
    const glyph = data.readUInt16BE(address + range + 2 * (codePoint - start));
    return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0;
  };
}

function format12Glyph(data: Buffer, offset: number): GlyphLookup {
  const count = data.readUInt32BE(offset + 12);
  return codePoint => {
    let lo = 0;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const group = offset + 16 + 12 * mid;
      const first = data.readUInt32BE(group);
      if (codePoint < first) hi = mid;
      else if (codePoint > data.readUInt32BE(group + 4)) lo = mid + 1;
      else return data.readUInt32BE(group + 8) + codePoint - first !== 0;
    }
    return false;
  };
}

function readUnicodeMaps(file: string): GlyphLookup[] {
  const font = fs.readFileSync(file);
  // FreeType uses the first face when drawtext opens a font collection by path.
  const face = font.toString("ascii", 0, 4) === "ttcf" ? font.readUInt32BE(12) : 0;
  const tables = font.readUInt16BE(face + 4);
  for (let index = 0; index < tables; index++) {
    const record = face + 12 + 16 * index;
    if (font.toString("ascii", record, record + 4) !== "cmap") continue;
    const offset = font.readUInt32BE(record + 8);
    const length = font.readUInt32BE(record + 12);
    const cmap = Buffer.from(font.subarray(offset, offset + length));
    const maps = new Map<number, GlyphLookup>();
    const encodings = cmap.readUInt16BE(2);
    for (let encoding = 0; encoding < encodings; encoding++) {
      const row = 4 + 8 * encoding;
      const platform = cmap.readUInt16BE(row);
      const charset = cmap.readUInt16BE(row + 2);
      if (platform !== 0 && !(platform === 3 && (charset === 1 || charset === 10))) continue;
      const subtable = cmap.readUInt32BE(row + 4);
      const format = cmap.readUInt16BE(subtable);
      if (format === 4) maps.set(subtable, format4Glyph(cmap, subtable));
      if (format === 12) maps.set(subtable, format12Glyph(cmap, subtable));
    }
    return [...maps.values()];
  }
  return [];
}

const unicodeMaps = new Map<string, GlyphLookup[]>();

export function fontCoversCjkText(file: string, text: string): boolean {
  try {
    let maps = unicodeMaps.get(file);
    if (!maps) {
      maps = readUnicodeMaps(file);
      unicodeMaps.set(file, maps);
    }
    for (const character of new Set(text)) {
      if (CJK_CHARACTER.test(character) && !maps.some(map => map(character.codePointAt(0)!))) return false;
    }
    return true;
  } catch {
    unicodeMaps.set(file, []);
    return false;
  }
}
