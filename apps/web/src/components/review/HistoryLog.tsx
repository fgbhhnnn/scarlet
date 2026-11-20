import { useEffect, useMemo, useState } from "react";
import type { ActivityEntry } from "@scarlet/shared";
import { errorMessage } from "../../lib/client";
import { zh } from "../../lib/zh";
import { absTime, relTime } from "../../lib/format";
import { reviewDayLabel, zhReview } from "../../lib/zhReview";
import { useProjectStore } from "../../stores/project";
import { Avatar, Spinner } from "../ui/primitives";

const FILTERS: Array<{ id: string; label: string; match: (type: string) => boolean }> = [
  { id: "all", label: zhReview.history.filters.all, match: () => true },
  { id: "decisions", label: zhReview.history.filters.decisions, match: (t) => t.startsWith("change.") || t.startsWith("version.") || t.startsWith("import.") },
  { id: "requests", label: zhReview.history.filters.requests, match: (t) => t.startsWith("request.") || t.startsWith("question.") || t.startsWith("note.") },
  { id: "project", label: zhReview.history.filters.project, match: (t) => t.startsWith("media.") || t.startsWith("project.") || t.startsWith("members.") || t.startsWith("skill.") || t.startsWith("action.") },
];

/** The entries that carry a small mark before their words: approved, put back or sent back, gone wrong. The words stay white. */
const MARK: Record<string, string> = {
  "change.approved": "bg-ok",
  "change.undone": "bg-warn",
  "change.sent_back": "bg-warn",
  "version.restored": "bg-warn",
  "project.deleted": "bg-bad",
  "media.failed": "bg-bad",
  "request.failed": "bg-bad",
};

/**
 * Everything that ever happened to this project, newest first. Entries are
 * permanent: an approval that was undone shows both the approval and the undo.
 */
export function HistoryLog() {
  const current = useProjectStore((s) => s.current);
  const loadActivity = useProjectStore((s) => s.loadActivity);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // A failed "Show older" has its own line, so the entries already loaded stay.
  const [olderError, setOlderError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const activity = current?.activity;

  useEffect(() => {
    if (activity) return;
    setError(null);
    loadActivity().catch((e) => setError(errorMessage(e)));
  }, [activity, loadActivity, attempt]);

  const shown = useMemo(() => (activity ?? []).filter((a) => FILTERS.find((f) => f.id === filter)!.match(a.type)), [activity, filter]);
  const days = useMemo(() => {
    const out: Array<{ day: string; entries: ActivityEntry[] }> = [];
    for (const a of shown) {
      const day = reviewDayLabel(a.createdAt);
      const last = out[out.length - 1];
      if (last && last.day === day) last.entries.push(a);
      else out.push({ day, entries: [a] });
    }
    return out;
  }, [shown]);

  if (!current) return null;
  if (!activity) {
    if (error) {
      return (
        <p className="text-[13px] text-bad" role="alert">
          {zhReview.history.loadFailed}：{error} <button className="btn-quiet" onClick={() => setAttempt((a) => a + 1)}>{zh.common.retry}</button>
        </p>
      );
    }
    return (
      <p className="text-[13px] text-muted flex items-center gap-2">
        <Spinner className="size-3" /> {zhReview.history.loadingHistory}
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={zhReview.history.filter}>
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`chip px-3 py-1 text-[12px] ${filter === f.id ? "bg-hi-dim text-fg" : "bg-raised text-muted hover:text-fg"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {days.length === 0 && <p className="mt-6 text-[13px] text-muted">{zhReview.history.empty}</p>}
      {days.map((d) => (
        <section key={d.day} className="mt-6">
          <h3 className="eyebrow mb-2">{d.day}</h3>
          <ol className="flex flex-col">
            {d.entries.map((a) => {
              return (
                <li key={a.id} className="flex items-start gap-3 py-2 border-b border-line/50 last:border-0">
                  {a.actor.type === "human" ? (
                    <Avatar name={a.actor.name} size={22} />
                  ) : (
                    <span className="size-[22px] shrink-0 rounded-full bg-raised grid place-items-center text-[9px] font-semibold text-muted">S</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] leading-snug text-fg">
                      {MARK[a.type] && <span className={`history-mark ${MARK[a.type]}`} aria-hidden />}{a.summary}
                    </div>
                    <div className="mt-0.5 text-[11px] text-dim" title={absTime(a.createdAt)}>
                      {relTime(a.createdAt)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {!current.activityComplete && activity.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="btn-ghost"
            disabled={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              setOlderError(null);
              loadActivity(true)
                .catch((e) => setOlderError(errorMessage(e)))
                .finally(() => setLoadingMore(false));
            }}
          >
            {loadingMore && <Spinner className="size-3" />} {zhReview.history.older}
          </button>
          {olderError && <span className="text-[13px] text-bad" role="alert">{zhReview.history.loadOlderFailed}：{olderError}</span>}
        </div>
      )}
    </div>
  );
}
