import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AgentId } from "@scarlet/shared";
import { ModelProviders } from "../agent/ModelProviders";
import { Link } from "react-router-dom";
import { ModelRefreshButton, ModelRefreshFeedback, useModelRefresh } from "../agent/ModelRefresh";
import { AGENT_LABEL, onlineAgents, useHostsStore } from "../../stores/hosts";
import { modelChoices, useModelPreferences, type ModelChoice } from "../../stores/modelPicker";
import { FavoriteButton } from "../agent/FavoriteButton";
import { Icon, Loading, SectionTitle, Toggle } from "../ui/primitives";
import { shellZh } from "../../lib/zh-shell";

interface ScrollCue {
  canScrollUp: boolean;
  canScrollDown: boolean;
  activeBelow: number;
  hiddenBelow: number;
}

const EMPTY_SCROLL_CUE: ScrollCue = {
  canScrollUp: false,
  canScrollDown: false,
  activeBelow: 0,
  hiddenBelow: 0,
};

function formatScrollCue(activeBelow: number, hiddenBelow: number, totalHidden: number): string {
  const totalBelow = activeBelow + hiddenBelow;
  if (totalBelow > 0) {
    if (activeBelow > 0 && hiddenBelow > 0) {
      return `下方还有 ${totalBelow} 个模型 · ${hiddenBelow} 个已隐藏`;
    }
    if (hiddenBelow > 0) {
      const someHiddenVisible = hiddenBelow < totalHidden;
      return `下方${someHiddenVisible ? "还有" : "有"} ${hiddenBelow} 个已隐藏模型`;
    }
    return `下方还有 ${activeBelow} 个模型`;
  }
  if (totalHidden > 0) {
    return `下方有 ${totalHidden} 个已隐藏模型`;
  }
  return "向下查看更多模型";
}

export function ModelSettings({ onSignIn }: { onSignIn?: () => void } = {}) {
  const { hosts, customOpenaiModels, customClaudeModels, customGeminiModels, status, error } = useHostsStore();
  const { hidden, favorites, setVisible } = useModelPreferences();
  const [provider, setProvider] = useState<AgentId>();
  const [search, setSearch] = useState("");
  const [scrollCue, setScrollCue] = useState<ScrollCue>(EMPTY_SCROLL_CUE);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const refresh = useModelRefresh();
  const agents = onlineAgents(hosts, customOpenaiModels, customClaudeModels, customGeminiModels);
  const choices = modelChoices(agents);
  const query = search.trim().toLowerCase();
  const providers = agents.filter(a => choices.some(m => m.agent === a.id)).map(a => a.id);
  const active = providers.find(id => id === provider) ?? providers[0];
  const catalog = choices.filter(m => m.agent === active);
  const visible = catalog.filter(m => !hidden.includes(m.key)).length;
  const matches = catalog.filter(m => `${m.label} ${m.model ?? ""}`.toLowerCase().includes(query));

  const favoriteRows = matches.filter(m => !hidden.includes(m.key) && favorites.includes(m.key));
  const activeRows = matches.filter(m => !hidden.includes(m.key) && !favorites.includes(m.key));
  const hiddenRows = matches.filter(m => hidden.includes(m.key));
  const sections: { id: "favorites" | "models" | "hidden"; label: string; count?: number; rows: ModelChoice[] }[] = [
    { id: "favorites" as const, label: "收藏", rows: favoriteRows },
    { id: "models" as const, label: "模型", rows: activeRows },
    { id: "hidden" as const, label: "隐藏", count: hiddenRows.length, rows: hiddenRows },
  ].filter(section => section.rows.length > 0);

  const measureScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) {
      setScrollCue(prev => (prev === EMPTY_SCROLL_CUE ? prev : EMPTY_SCROLL_CUE));
      return;
    }
    const canScrollUp = el.scrollTop > 2;
    const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    let activeBelow = 0;
    let hiddenBelow = 0;
    if (canScrollDown) {
      const box = el.getBoundingClientRect();
      if (box.height > 0) {
        for (const row of el.querySelectorAll<HTMLLIElement>("li[data-model-state]")) {
          const rect = row.getBoundingClientRect();
          if (rect.height > 0 && rect.bottom > box.bottom + 4) {
            if (row.dataset.modelState === "hidden") hiddenBelow++;
            else activeBelow++;
          }
        }
      }
    }
    setScrollCue(prev =>
      prev.canScrollUp === canScrollUp &&
      prev.canScrollDown === canScrollDown &&
      prev.activeBelow === activeBelow &&
      prev.hiddenBelow === hiddenBelow
        ? prev
        : { canScrollUp, canScrollDown, activeBelow, hiddenBelow },
    );
  }, []);

  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [active]);

  useLayoutEffect(() => {
    measureScroll();
  }, [measureScroll, active, search, matches.length, hidden, favorites]);

  useEffect(() => {
    const list = listRef.current;
    const content = contentRef.current;
    if (!list) return;
    window.addEventListener("resize", measureScroll);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measureScroll) : null;
    observer?.observe(list);
    if (content) observer?.observe(content);
    return () => {
      window.removeEventListener("resize", measureScroll);
      observer?.disconnect();
    };
  }, [measureScroll, active, matches.length]);

  const scrollBehavior = (): ScrollBehavior =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

  const scrollMore = () => {
    const el = listRef.current;
    if (!el) return;
    const step = Math.max(Math.round(el.clientHeight * 0.8), 160);
    const nextTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + step);
    if (typeof el.scrollTo === "function") el.scrollTo({ top: nextTop, behavior: scrollBehavior() });
    else el.scrollTop = nextTop;
    measureScroll();
  };

  const scrollToTop = () => {
    const el = listRef.current;
    if (!el) return;
    if (typeof el.scrollTo === "function") el.scrollTo({ top: 0, behavior: scrollBehavior() });
    else el.scrollTop = 0;
    measureScroll();
  };

  const scrollCueLabel = formatScrollCue(scrollCue.activeBelow, scrollCue.hiddenBelow, hiddenRows.length);

  return (
    <section className="card p-5">
      <SectionTitle right={<ModelRefreshButton action={refresh} />}>{shellZh.settings.modelPicker}</SectionTitle>
      <ModelRefreshFeedback action={refresh} loadError={error} />
      {!choices.length && (status === "loading" ? <Loading label={shellZh.settings.readingModels} /> :
        // Every model a signed-in agent offers is listed, so none at all means its list couldn't be read.
        agents.length ? <p className="mt-4 text-[13px] text-muted">无法读取模型列表。请刷新模型后重试，若仍失败请更新 Claude Code、Codex 或 Gemini。</p> :
        <p className="mt-4 text-[13px] text-muted">Claude Code、Codex 或 Gemini 在线时会显示可用模型。 {onSignIn
          ? <button className="underline" onClick={onSignIn}>{shellZh.settings.manageSignIn}</button>
          : <Link to="/settings#hosts" className="underline">{shellZh.settings.manageSignIn}</Link>}</p>)}
      {active && <div className="mt-4">
        <ModelProviders providers={providers} active={active} onChange={id => { setProvider(id); setSearch(""); }} />
        <div className="flex flex-wrap items-center gap-2 py-3">
          <label className="field flex min-w-32 flex-1 items-center gap-2 text-muted">
            <Icon name="search" />
            <input type="search" className="min-w-0 flex-1 bg-transparent text-fg outline-none" aria-label="筛选模型" placeholder={`筛选 ${AGENT_LABEL[active]} 模型…`} value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <span className="text-xs text-dim">已显示 {visible} / {catalog.length} 个</span>
          <button className="btn-quiet" aria-label={`${visible ? "隐藏" : "显示"}所有 ${AGENT_LABEL[active]} 模型`} onClick={() => setVisible(catalog.map(m => m.key), visible === 0)}>{visible ? "全部隐藏" : "全部显示"}</button>
        </div>
        {!matches.length && <p className="py-4 text-[13px] text-muted">{shellZh.settings.noModels}</p>}
        {matches.length > 0 && <>
          <div className="relative">
            <div
              ref={listRef}
              onScroll={measureScroll}
              className="model-list-scroll max-h-[46vh] overflow-y-auto pr-2"
            >
              <div ref={contentRef}>
                {sections.map((section, index) => (
                  <section key={section.id} className={index > 0 ? "mt-2" : undefined}>
                    <h4 className="eyebrow flex items-center gap-1.5 border-b border-line py-2">
                      <span>{section.label}</span>
                      {section.count != null && <span className="tnum">· {section.count}</span>}
                    </h4>
                    <ul className="divide-y divide-line/60">
                      {section.rows.map((m) => {
                        const isHidden = section.id === "hidden";
                        return (
                          <li key={m.key} data-model-state={isHidden ? "hidden" : "active"} className="flex items-center gap-2 py-1">
                            <FavoriteButton choice={m} />
                            <div className="flex min-w-0 flex-1 items-baseline gap-2">
                              <span className={`truncate text-[13px] ${isHidden ? "text-dim" : "text-fg"}`}>{m.label}</span>
                              {m.model && m.model !== m.label && <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-dim">{m.model}</span>}
                            </div>
                            <Toggle checked={!isHidden} label={`在选择器中显示 ${AGENT_LABEL[m.agent]} · ${m.label}`} onChange={(v) => setVisible([m.key], v)} />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
            {scrollCue.canScrollUp && (
              <div aria-hidden className="pointer-events-none absolute left-0 right-2 top-0 h-5 bg-gradient-to-b from-panel to-transparent" />
            )}
            {scrollCue.canScrollDown && (
              <div aria-hidden className="pointer-events-none absolute left-0 right-2 bottom-0 h-8 bg-gradient-to-t from-panel via-panel/80 to-transparent" />
            )}
          </div>
          {(scrollCue.canScrollDown || scrollCue.canScrollUp) && (
            <div className="mt-1 border-t border-line/70 pt-2">
              <button
                type="button"
                onClick={scrollCue.canScrollDown ? scrollMore : scrollToTop}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-bg/50 px-3 py-1.5 text-xs text-muted transition-colors hover:bg-raised hover:text-fg"
              >
                <span className={scrollCue.canScrollDown ? "inline-flex" : "inline-flex rotate-180"}>
                  <Icon name="down" size={12} />
                </span>
                <span>{scrollCue.canScrollDown ? scrollCueLabel : "返回顶部"}</span>
              </button>
            </div>
          )}
        </>}
      </div>}
    </section>
  );
}
