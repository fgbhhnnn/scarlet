import { useHotkeys } from "../../lib/hotkeys";
import { zhReview } from "../../lib/zhReview";

/** The same decisions and shortcuts for every edit: Revise (R), and Apply (A) for a proposal or Keep (K) for an applied edit. */
export function ReviewActions({ approve, revise, disabled, approvalDisabled, approveLabel = zhReview.actions.apply, approveKey = "A" }: {
  approve?: () => void; revise: () => void; disabled?: boolean; approvalDisabled?: boolean; approveLabel?: string; approveKey?: string;
}) {
  useHotkeys(event => {
    if (disabled || event.repeat || event.shiftKey) return;
    const key = event.key.toLowerCase();
    const action = key === "r" ? revise : key === approveKey.toLowerCase() && !approvalDisabled ? approve : undefined;
    if (action) { event.preventDefault(); action(); }
  });
  return <div className="review-actions">
    <button type="button" className="btn-ghost" data-key="R" data-log-control="revise-edit" aria-keyshortcuts="R" title={`${zhReview.actions.revise} (R)`} disabled={disabled} onClick={revise}>{zhReview.actions.revise}</button>
    {approve && <button type="button" className="btn-primary" data-key={approveKey} data-log-control={approveKey === "K" ? "keep-edit" : approveKey === "D" ? "mark-done" : "apply-edit"} aria-keyshortcuts={approveKey} title={`${approveLabel} (${approveKey})`}
      disabled={disabled || approvalDisabled} onClick={e => {
        // The button stays for the next edit. Clicked, it lets go of the focus (WebView2 leaves it there), or Space
        // would press it again while the video is paused. Pressed by keyboard, it keeps it.
        if (e.detail) e.currentTarget.blur();
        approve();
      }}>{approveLabel}</button>}
  </div>;
}
