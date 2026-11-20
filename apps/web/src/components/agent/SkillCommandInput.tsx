import { useEffect, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { useSearchParams } from "react-router-dom";
import type { Skill } from "@scarlet/shared";
import type { MessageTimestamp } from "../../lib/messageTimestamps";
import { isComposing } from "../../lib/hotkeys";
import { skillCommands, useSkillsStore } from "../../stores/skills";
import { Icon } from "../ui/primitives";
import { useTokenList } from "./useTokenList";
import { zhAgent } from "../../lib/zh-agent";

interface Props {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  skills: Skill[];
  id: string;
  placeholder: string;
  timestamps?: MessageTimestamp[];
  onTimestamp?(time: number): void;
  onChange(value: string): void;
  onSubmit(): void;
  /** No list opens: a skill's own page has no skills to pick. */
  plain?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * The message box's text, with the list that opens over it as the editor types: `/` lists the editing skills. What
 * follows the sign filters the list, ↑ ↓ light a row, Enter or Tab puts its name in the box and Esc puts the list away.
 */
export function SkillCommandInput({ inputRef, value, skills, id, placeholder, timestamps, onTimestamp, onChange, onSubmit, plain, disabled, ariaLabel }: Props) {
  const list = useTokenList(inputRef, value, onChange);
  const { caret, index } = list;
  const [, setSearch] = useSearchParams();
  const listId = useId();
  const activeRow = useRef<HTMLButtonElement>(null);
  const status = useSkillsStore(s => s.status);
  const load = useSkillsStore(s => s.load);
  const token = caret === null || plain ? undefined : skillCommands(value).find(token => token.start < caret && caret <= token.end);
  const open = list.focused && !list.dismissed && !!token;
  const query = token && caret !== null ? value.slice(token.start + 1, caret).toLowerCase() : "";
  const matches = open ? skills.filter(s => s.name.includes(query) || s.description.toLowerCase().includes(query))
    .sort((a, b) => Number(b.name.startsWith(query)) - Number(a.name.startsWith(query))) : [];
  const activeIndex = list.activeIndex(matches.length);
  const active = matches[activeIndex];
  const activeId = index === "create" ? `${listId}-create-action` : active && `${listId}-skill-${active.name}`;
  const hasCommand = !!token;

  useEffect(() => {
    if (hasCommand && status === "idle") void load();
  }, [hasCommand, status, load]);
  useEffect(() => {
    activeRow.current?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  const choose = (row: Skill) => list.replaceToken(token, "/" + row.name);

  function createSkill() {
    list.close();
    setSearch(previous => {
      const next = new URLSearchParams(previous);
      next.set("createSkill", "1");
      return next;
    }, { replace: true });
  }

  const overlay = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (overlay.current && inputRef.current) overlay.current.scrollTop = inputRef.current.scrollTop;
  }, [value, timestamps, inputRef]);
  const markedText: ReactNode[] = [];
  let end = 0;
  for (const stamp of timestamps ?? []) {
    markedText.push(<span key={`before-${stamp.start}`} aria-hidden="true">{value.slice(end, stamp.start)}</span>, <button key={stamp.start} type="button" className="composer-timestamp"
      aria-label={`跳转到 ${stamp.text}`} title={`跳转到 ${stamp.text}`}
      onMouseDown={e => e.preventDefault()} onClick={() => onTimestamp?.(stamp.time)}>{stamp.text}</button>);
    end = stamp.start + stamp.text.length;
  }

  return <>
    <div className="composer-message">
      <span aria-hidden="true">{value || placeholder}{"​"}</span>
      <textarea id={id} ref={inputRef} rows={1} className="placeholder:text-dim" disabled={disabled} aria-label={ariaLabel}
        placeholder={placeholder} aria-description={plain ? undefined : "输入 / 选择剪辑技能。"}
        aria-autocomplete="list" aria-haspopup="listbox" aria-controls={open ? listId : undefined}
        aria-activedescendant={activeId} value={value}
        onScroll={e => { if (overlay.current) overlay.current.scrollTop = e.currentTarget.scrollTop; }}
        onSelect={e => { list.syncCaret(e.currentTarget); }}
        onFocus={e => list.focus(e.currentTarget)}
        onBlur={() => list.setFocused(false)}
        onChange={e => {
          // WebKit can return the caret from a native dialog before the textarea receives another focus event.
          list.setFocused(document.activeElement === e.currentTarget);
          list.typed(e.currentTarget);
          onChange(e.target.value);
        }}
        onKeyDown={e => {
          if (isComposing(e)) return;
          if (open && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (list.navigate(e, matches.length)) return;
            if (e.key === "Enter" || (e.key === "Tab" && active)) {
              e.preventDefault();
              if (index === "create") {
                if (!e.repeat) createSkill();
              } else if (e.key === "Enter" && active?.name === query && caret === token?.end) onSubmit();
              else if (active) choose(active);
              else if (status === "error") void load();
              // A command no row matches still sends: the send says when no skill has that name, and a shortcut such
              // as /dialogue-pass goes to the skill it stands for.
              else if (e.key === "Enter" && caret === token?.end && !e.repeat) onSubmit();
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            // Held down, Enter is one press: its repeats don't send whatever the box shows next.
            if (!e.repeat) onSubmit();
          }
          if (e.key === "Escape") e.currentTarget.blur();
        }} />
      {markedText.length > 0 && <div ref={overlay} className="composer-timestamp-overlay">
        {markedText}<span aria-hidden="true">{value.slice(end)}{"​"}</span>
      </div>}
    </div>
    {open && <div className="composer-skills" role="listbox" id={listId} aria-label="剪辑技能" data-shortcut-overlay>
      <div className="eyebrow px-2 py-1">{zhAgent.skills}</div>
      <div className="composer-skill-list">
        {matches.map(skill => <button key={skill.name} type="button" role="option" tabIndex={-1}
          id={`${listId}-skill-${skill.name}`} aria-selected={skill === active} ref={skill === active ? activeRow : undefined}
          onMouseDown={e => e.preventDefault()} onClick={() => choose(skill)}>
          <span className="font-mono text-[12px]">/{skill.name}</span>
          {skill.description && <span className="block truncate text-muted text-[12px]" title={skill.description}>{skill.description}</span>}
        </button>)}
      </div>
      {!matches.length && <div role="status" className="px-2 py-1 text-muted text-[12px]">
        {status === "error" ? <>无法加载技能。 <button type="button" className="underline" onMouseDown={e => e.preventDefault()} onClick={() => void load()} title="按 Enter 重试">{zhAgent.retry}</button></>
          : status !== "ready" ? "正在加载技能…" : query ? "没有匹配的技能。" : "此项目未启用任何技能。"}
      </div>}
      <div className="composer-skill-footer">
        <button type="button" role="option" tabIndex={-1} id={`${listId}-create-action`} aria-selected={index === "create"}
          onMouseDown={e => e.preventDefault()} onClick={createSkill}>
          <Icon name="plus" size={14} /> 创建技能
        </button>
      </div>
    </div>}
  </>;
}
