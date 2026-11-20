import { useRef, useState } from "react";
import { api, errorMessage } from "../../lib/client";
import { runIsActive } from "../../lib/taskRun";
import { isPreparingMedia } from "../../lib/upload";
import { useProjectStore } from "../../stores/project";
import { commandSkillIds } from "../../stores/skills";
import { useUiStore } from "../../stores/ui";
import { useAgentAvailability } from "../agent/AgentChip";
import { Icon, InlineError, Modal } from "../ui/primitives";

const instruction = "/dialogue-pass 请给这段中文口播做一版粗剪。先通读上下文，再移除不影响意思的语气词、无效长停顿、说到一半的重启和重复口播。重复表述保留完整且自然的一次。保留原意、否定词、数字、单位、人名和必要停顿。把剪辑建议留在工作区供预览和确认。";

export function AutoRoughCut({ importing, onQueued }: { importing: number; onQueued(): void }) {
  const [open, setOpen] = useState(false);

  return <>
    <button type="button" className="btn-quiet" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Icon name="scissors" size={14} /> 自动粗剪
    </button>
    {open && <AutoRoughCutSheet importing={importing} onClose={() => setOpen(false)} onQueued={onQueued} />}
  </>;
}

function AutoRoughCutSheet({ importing, onClose, onQueued }: {
  importing: number;
  onClose(): void;
  onQueued(): void;
}) {
  const current = useProjectStore(s => s.current);
  const { effective } = useAgentAvailability();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!current) return null;

  const recordings = current.media.filter(media => media.kind !== "image" && media.hasAudio !== false && media.status !== "failed");
  const active = current.tasks.some(task => task.kind === "edit" && task.instruction === instruction && runIsActive(task));
  const blocked = active ? "已有粗剪任务，进度可在工作区查看。"
    : importing > 0 || recordings.some(isPreparingMedia) ? "正在导入和准备素材，可以在准备完成后开始粗剪。"
    : !recordings.length ? "请先导入带人声的素材。"
    : !effective ? "请先连接可用的剪辑模型。"
    : "";

  async function submit() {
    if (!current || !effective || blocked || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const skillIds = await commandSkillIds(instruction);
      // A new project has no head until its first timeline is read. The timeline route creates that
      // initial version transactionally, so the edit task always starts against a real version.
      let version = current.project.head ?? undefined;
      if (!version) {
        const result = await api.timeline(current.id, "head");
        version = result.timeline.version;
        await useProjectStore.getState().refreshHead(current.id);
      }
      await useProjectStore.getState().createTask(current.id, {
        kind: "edit",
        ...effective,
        instruction,
        context: { version, skillIds },
      });
      onQueued();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <Modal open title="中文口播粗剪" onClose={() => { if (!busy) onClose(); }} footer={<>
    <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>取消</button>
    {!effective && <button type="button" className="btn-ghost" onClick={() => {
      onClose();
      useUiStore.getState().setAgentSetupOpen(true);
    }}>设置模型</button>}
    <button type="button" className="btn-primary" disabled={busy || !!blocked} onClick={() => void submit()}>
      {busy ? "正在提交…" : "开始粗剪"}
    </button>
  </>}>
    <p className="text-muted">按上下文识别废话、长停顿和重说，生成可逐处预览和确认的剪辑建议。</p>
    {blocked && <p className="mt-2 text-muted" role="status">{blocked}</p>}
    <InlineError>{error}</InlineError>
  </Modal>;
}
