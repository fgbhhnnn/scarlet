import { useEffect, useState } from "react";
import type { CheckIn } from "@scarlet/shared";
import { api, errorMessage } from "../../lib/client";
import { PreferenceSelect } from "../ui/PreferenceSelect";
import { Icon, InlineError } from "../ui/primitives";

const reviewShare: Record<CheckIn, string> = { less: "约十分之一", balanced: "约四分之一", more: "约一半" };

const steps: { value: CheckIn; label: string }[] = [
  { value: "less", label: "较少" },
  { value: "balanced", label: "适中" },
  { value: "more", label: "较多" },
];

/**
 * How much Scarlet checks with the editor. At the end of a pass Scarlet orders its cuts by how likely each is to be
 * wrong; this picks how far down that order the editor is asked to look. The same for every project, saved as chosen.
 */
export function CheckInSettings() {
  const [value, setValue] = useState<CheckIn | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    void api.settings().then(r => { if (current) setValue(r.settings.checkIn); }).catch(e => { if (current) setError(errorMessage(e)); });
    return () => { current = false; };
  }, []);
  if (!value) return error ? <InlineError>{error}</InlineError> : null;
  const choose = async (next: CheckIn) => {
    const previous = value;
    setValue(next);
    setError("");
    setBusy(true);
    try {
      setValue((await api.updateSettings({ checkIn: next })).settings.checkIn);
    } catch (e) {
      setValue(previous);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card transcription-preferences check-in-preferences" aria-labelledby="check-in-heading">
      <div className="transcription-header">
        <div className="transcription-heading">
          <span className="transcription-glyph"><Icon name="review" size={22} /></span>
          <div>
            <h2 id="check-in-heading">剪点确认</h2>
            <p>设置每轮剪辑中 Scarlet 请你确认的剪点数量。</p>
          </div>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="check-in">请我确认</label>
          <PreferenceSelect id="check-in" value={value} disabled={busy} options={steps} onChange={next => void choose(next)} />
        </div>
      </div>
      <p className="transcription-status text-muted">Scarlet 会从删去台词的剪点中，挑出{reviewShare[value]}最可能需要调整的剪点请你确认。这些剪辑会先应用到视频，并保留在待审阅列表中，直到你确认保留。</p>
      {error && <InlineError>{error}</InlineError>}
    </section>
  );
}
