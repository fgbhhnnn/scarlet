import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MakeShortsRequest } from "@scarlet/shared";
import { api, errorMessage } from "../../lib/client";
import { useProjectStore } from "../../stores/project";
import { useAgentAvailability } from "../agent/AgentChip";
import { Field, InlineError, Modal } from "../ui/primitives";
import { PreferenceSelect } from "../ui/PreferenceSelect";
import { zh } from "../../lib/zh";

const SHAPES: Array<{ value: MakeShortsRequest["aspect"]; label: string }> = [
  { value: "9:16", label: "竖屏 · 9:16" },
  { value: "1:1", label: "方形 · 1:1" },
  { value: "4:5", label: "人像 · 4:5" },
];
const LENGTHS = [30, 60, 90, 180].map(value => ({ value, label: `每条不超过 ${value < 120 ? `${value} 秒` : `${value / 60} 分钟`}` }));
const COUNTS = [1, 2, 3, 4, 5].map(value => ({ value, label: value === 1 ? "1" : `最多 ${value} 条` }));

/**
 * Make shorts, from the ⋯ menu: what the editor wants, in a form, since it makes new projects. Each short is a project
 * of its own, starting as this video's finished edit on the chosen shape. The first opens at once, with Scarlet at work
 * on it; this video isn't changed.
 */
export function MakeShortsSheet({ onClose }: { onClose(): void }) {
  const current = useProjectStore(s => s.current);
  const navigate = useNavigate();
  const { effective, unavailableReason } = useAgentAvailability();
  const [count, setCount] = useState(3);
  const [aspect, setAspect] = useState<MakeShortsRequest["aspect"]>("9:16");
  const [maxSeconds, setMaxSeconds] = useState(60);
  const [captions, setCaptions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!current) return null;
  const empty = !current.project.head || !current.timeline?.tracks.some(t => t.clips.length);
  const submit = async () => {
    if (busy || empty) return;
    if (!effective) { setError(unavailableReason); return; }
    setBusy(true);
    setError("");
    try {
      const { projects } = await api.makeShorts(current.id, { count, aspect, maxSeconds, captions, ...effective });
      void useProjectStore.getState().loadList();
      onClose();
      navigate(`/p/${projects[0]!.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return <Modal open title={zh.workspace.makeShorts} width={600} onClose={() => { if (!busy) onClose(); }} footer={<>
    <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>{zh.common.cancel}</button>
    <button type="submit" form="make-shorts" className="btn-primary" disabled={busy || empty}>{busy ? "正在制作短视频…" : zh.workspace.makeShorts}</button>
  </>}>
    <form id="make-shorts" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={busy} className="min-w-0">
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Field label="数量" htmlFor="shorts-count"><PreferenceSelect id="shorts-count" value={count} onChange={setCount} options={COUNTS} /></Field>
          <Field label="画幅" htmlFor="shorts-shape"><PreferenceSelect id="shorts-shape" value={aspect} onChange={setAspect} options={SHAPES} /></Field>
          <Field label="时长" htmlFor="shorts-length"><PreferenceSelect id="shorts-length" value={maxSeconds} onChange={setMaxSeconds} options={LENGTHS} /></Field>
          <Field label="字幕" htmlFor="shorts-captions">
            <PreferenceSelect id="shorts-captions" value={captions ? "on" : "off"} onChange={value => setCaptions(value === "on")}
              options={[{ value: "on", label: "开启" }, { value: "off", label: "关闭" }]} />
          </Field>
        </div>
        <p className="text-dim text-[11.5px] mt-1">每条短视频都会创建一个新项目，基于当前视频的成片生成，原视频不会改变。</p>
      </fieldset>
    </form>
    <InlineError>{empty ? "当前还没有可制作短视频的视频。" : error}</InlineError>
  </Modal>;
}
