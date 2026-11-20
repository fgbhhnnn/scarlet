import { useState } from "react";
import { desktop } from "../../lib/desktop";
import { checkPublishedUpdate, type PublishedUpdate } from "../../lib/publishedUpdate";
import { refreshUpdateStatus, updateSource } from "../../lib/updateStatus";
import { shellZh } from "../../lib/zh-shell";

export function UpdateSettings() {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [update, setUpdate] = useState<PublishedUpdate | null>(null);
  async function check() {
    setChecking(true);
    setMessage("正在检查更新…");
    try {
      const source = updateSource();
      if (source === "release") {
        const newest = await desktop.checkForRelease();
        setMessage(newest ? `版本 ${newest} 已发布，Scarlet 正在准备更新。` : shellZh.updates.latest);
        refreshUpdateStatus();
        return;
      }
      if (!source && __SCARLET_RELEASE_CHANNEL__) {
        const found = await checkPublishedUpdate(__SCARLET_RELEASE_CHANNEL__);
        setUpdate(found);
        setMessage(found ? `Scarlet ${found.version} 已发布。` : shellZh.updates.latest);
        return;
      }
      const latest = await desktop.latestUpdateRevision();
      if (latest === __SCARLET_REVISION__) setMessage(shellZh.updates.latest);
      else if (__SCARLET_REVISION__) setMessage(`有可用更新，最新构建为 ${latest.slice(0, 7)}。`);
      else setMessage(`最新构建为 ${latest.slice(0, 7)}，当前构建的提交版本未知。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setChecking(false);
    }
  }
  return <div className="about-updates">
    <button type="button" className="btn-primary" disabled={checking} onClick={check}>{shellZh.updates.check}</button>
    {update && <button type="button" className="btn-ghost" onClick={() => {
      void desktop.openUrl(update.url).catch(() => setMessage(shellZh.updates.retry));
    }}>{shellZh.updates.download}</button>}
    <span role="status">{message}</span>
  </div>;
}
