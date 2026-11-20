import { useEffect, useState } from "react";
import { desktop } from "../../lib/desktop";
import { checkPublishedUpdate, type PublishedUpdate, type ReleaseChannel } from "../../lib/publishedUpdate";
import { shellZh } from "../../lib/zh-shell";

const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

export function ReleaseUpdateNotice({ channel }: { channel: ReleaseChannel }) {
  const [update, setUpdate] = useState<PublishedUpdate | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  useEffect(() => {
    let mounted = true;
    function check() {
      void checkPublishedUpdate(channel).then(found => {
        if (mounted) setUpdate(found);
      }, () => { /* Settings reports failures on request. Retry in the background. */ });
    }
    check();
    const timer = setInterval(check, CHECK_INTERVAL);
    window.addEventListener("online", check);
    return () => {
      mounted = false;
      clearInterval(timer);
      window.removeEventListener("online", check);
    };
  }, [channel]);

  if (!update) return null;
  async function openDownload(url: string) {
    setOpenFailed(false);
    try { await desktop.openUrl(url); }
    catch { setOpenFailed(true); }
  }
  return <aside className="update-control update-corner" aria-label={shellZh.updates.update} aria-live="polite">
    <button type="button" className="update-button" onClick={() => void openDownload(update.url)} title={`打开 Scarlet ${update.version} 的下载页面`}>
      <span className="update-button-dot" aria-hidden="true" />获取 Scarlet {update.version}
    </button>
    {openFailed && <span className="update-button-error" role="alert">{shellZh.updates.retry}</span>}
  </aside>;
}
