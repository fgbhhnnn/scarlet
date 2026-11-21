export type ReleaseChannel = NonNullable<typeof __SCARLET_RELEASE_CHANNEL__>;
export interface PublishedUpdate { version: string; url: string }

interface Release {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; state: string; size: number }[];
}

const source = "https://github.com/Forward-Future";
const versions = {
  stable: /^v(\d+\.\d+\.\d+)$/,
  "early-access": /^v(\d+\.\d+\.\d+)-early-access\.[1-9]\d*$/,
  "linux-preview": /^v(\d+\.\d+\.\d+)-linux-preview\.[1-9]\d*$/,
};

function parts(version: string) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error("Scarlet 版本无效。");
  return version.split(".").map(BigInt);
}

function newer(left: string, right: string) {
  const other = parts(right);
  for (const [i, value] of parts(left).entries()) {
    if (value !== other[i]) return value > other[i]!;
  }
  return false;
}

function hasInstallers(release: Release, channel: ReleaseChannel, version: string) {
  const name = (channel === "early-access" ? "Scarlet-Early-Access-" : "Scarlet-") + version + "-";
  const required = channel === "linux-preview" ? ["Ubuntu-24.04-amd64.deb"]
    : ["macOS-Apple-Silicon.dmg", "macOS-Intel.dmg", "Windows-x64-Setup.exe"];
  if (channel === "stable") required.push("Windows-x64.msi");
  return required.every(suffix => release.assets.some(asset => asset.name === name + suffix && asset.state === "uploaded" && asset.size > 0));
}

/** Only published installers for this edition can be offered to its project library. */
export async function publishedUpdate(channel: ReleaseChannel, installed: string): Promise<PublishedUpdate | null> {
  const stable = channel === "stable";
  const repo = stable ? "scarlet" : "scarlet-releases";
  const api = "https://api.github.com/repos/Forward-Future/" + repo + "/releases";
  let update: PublishedUpdate | null = null;
  // The downloads repository also holds both preview editions. Follow its pages while they are full.
  for (let page = 1; ; page++) {
    const response = await fetch(stable ? api + "/latest" : api + "?per_page=100&page=" + page, {
      headers: { Accept: "application/vnd.github+json" }, credentials: "omit", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("无法检查 Scarlet 更新，请稍后重试。");
    const data = await response.json();
    const releases: Release[] = stable ? [data] : data;
    for (const release of releases) {
      if (release.draft !== false || release.prerelease !== !stable) continue;
      const version = versions[channel].exec(release.tag_name)?.[1];
      if (version && newer(version, update?.version ?? installed) && hasInstallers(release, channel, version)) {
        update = { version, url: source + "/" + repo + "/releases/tag/" + release.tag_name };
      }
    }
    if (stable || releases.length < 100) return update;
  }
}

// The automatic check and Settings can ask at the same time. Share that network request.
let inFlight: { channel: ReleaseChannel; result: Promise<PublishedUpdate | null> } | undefined;
export function checkPublishedUpdate(channel: ReleaseChannel) {
  if (inFlight?.channel === channel) return inFlight.result;
  const result = publishedUpdate(channel, __SCARLET_VERSION__).finally(() => {
    if (inFlight?.result === result) inFlight = undefined;
  });
  inFlight = { channel, result };
  return result;
}
