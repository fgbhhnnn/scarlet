import { useState } from "react";
import { desktop } from "../../lib/desktop";
import { useUiStore } from "../../stores/ui";
import { Icon } from "../ui/primitives";
import { zh } from "../../lib/zh";

export function ExportStarNotice() {
  const visible = useUiStore(s => s.exportStarNotice === "visible");
  const dismiss = useUiStore(s => s.dismissExportStar);
  const [openFailed, setOpenFailed] = useState(false);

  async function openRepository() {
    try {
      await desktop.openUrl("https://github.com/Forward-Future/scarlet");
      dismiss();
    } catch {
      setOpenFailed(true);
    }
  }

  if (!visible) return null;
  return <aside aria-label="导出完成" className="flex shrink-0 items-center gap-2 border-t border-line bg-panel px-4 py-1.5">
    <span role="status" className="mr-auto inline-flex items-center gap-2 font-medium">
      <Icon name="check" /> {zh.export.exportedVideo}
    </span>
    {openFailed && <span className="text-muted">{zh.export.openGithubFailed}</span>}
    <button type="button" className="btn-quiet text-fg" onClick={openRepository}><Icon name="star" /> {zh.export.star}</button>
    <button type="button" className="btn-icon" aria-label={zh.export.dismiss} title={zh.export.dismiss} onClick={dismiss}><Icon name="x" /></button>
  </aside>;
}
