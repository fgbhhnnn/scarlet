// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { buildDb } from "../../lib/mock/fixtures";
import { useHostsStore } from "../../stores/hosts";
import { useModelPreferences } from "../../stores/modelPicker";
import { ModelSettings } from "./ModelSettings";

it("renders each model on one line and places disabled models below active ones", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const oldHosts = useHostsStore.getState();
  const oldPrefs = useModelPreferences.getState();
  const host = buildDb().hosts[0]!;
  useHostsStore.setState({
    hosts: [{
      ...host,
      online: true,
      agents: [{
        id: "claude",
        installed: true,
        models: ["opus", "fable[1m]", "sonnet", "haiku"],
        modelLabels: {
          opus: "Opus 5.5",
          "fable[1m]": "Fable 5.2",
          sonnet: "Sonnet 5.5",
          haiku: "Haiku 5.5",
        },
      }],
    }],
  });
  useModelPreferences.setState({ hidden: ["claude:opus", "claude:sonnet"], favorites: [] });

  const container = document.createElement("div");
  const root = createRoot(container);
  const rows = () => [...container.querySelectorAll("li")];
  const labels = () => rows().map(li => li.querySelector("span")!.textContent);
  const toggle = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="在选择器中显示 Claude Code · ${label}"]`)!;

  try {
    await act(() => root.render(<MemoryRouter><ModelSettings /></MemoryRouter>));

    // Active models appear first in catalog order, disabled models below them in catalog order.
    expect(labels()).toEqual(["Fable 5.2", "Haiku 5.5", "Opus 5.5", "Sonnet 5.5"]);
    expect([...container.querySelectorAll("h4")].map(h => h.textContent)).toEqual(["模型", "隐藏· 2"]);

    // Label and raw model id share a single flex row.
    const textRow = rows()[0]!.querySelector("div")!;
    expect(textRow.className).toContain("flex");
    expect([...textRow.children].map(el => el.textContent)).toEqual(["Fable 5.2", "fable[1m]"]);

    // Turning off an active model moves it below the remaining active models.
    await act(() => toggle("Fable 5.2").click());
    expect(labels()).toEqual(["Haiku 5.5", "Opus 5.5", "Fable 5.2", "Sonnet 5.5"]);
    expect([...container.querySelectorAll("h4")].map(h => h.textContent)).toEqual(["模型", "隐藏· 3"]);

    // Turning a disabled model back on moves it back up with the active models.
    await act(() => toggle("Opus 5.5").click());
    expect(labels()).toEqual(["Opus 5.5", "Haiku 5.5", "Fable 5.2", "Sonnet 5.5"]);
    expect([...container.querySelectorAll("h4")].map(h => h.textContent)).toEqual(["模型", "隐藏· 2"]);
  } finally {
    await act(() => root.unmount());
    useHostsStore.setState(oldHosts, true);
    useModelPreferences.setState(oldPrefs, true);
    vi.unstubAllGlobals();
  }
});

it("shows a scroll cue for hidden models below when the list overflows and lets you scroll through it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const oldHosts = useHostsStore.getState();
  const oldPrefs = useModelPreferences.getState();
  const host = buildDb().hosts[0]!;
  useHostsStore.setState({
    hosts: [{
      ...host,
      online: true,
      agents: [{
        id: "gemini",
        installed: true,
        models: ["m1", "m2", "m3", "m4", "m5", "m6"],
        modelLabels: {
          m1: "Model 1",
          m2: "Model 2",
          m3: "Model 3",
          m4: "Model 4",
          m5: "Model 5",
          m6: "Model 6",
        },
      }],
    }],
  });
  useModelPreferences.setState({ hidden: ["gemini:m4", "gemini:m5", "gemini:m6"], favorites: [] });

  const container = document.createElement("div");
  const root = createRoot(container);

  const clientHeight = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
  const scrollHeight = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(360);

  try {
    await act(() => root.render(<MemoryRouter><ModelSettings /></MemoryRouter>));

    const list = container.querySelector<HTMLDivElement>(".model-list-scroll")!;
    // Simulate viewport height 200 where m4 (first hidden model) is visible and m5/m6 are below the fold.
    const rowTops = [20, 60, 100, 150, 210, 250];
    vi.spyOn(list, "getBoundingClientRect").mockImplementation(() => ({
      top: 0, bottom: 200, left: 0, right: 400, width: 400, height: 200, x: 0, y: 0, toJSON: () => ({}),
    }));
    const rows = [...list.querySelectorAll<HTMLLIElement>("li[data-model-state]")];
    rows.forEach((row, i) => {
      vi.spyOn(row, "getBoundingClientRect").mockImplementation(() => {
        const top = rowTops[i]! - list.scrollTop;
        return { top, bottom: top + 36, left: 0, right: 400, width: 400, height: 36, x: 0, y: top, toJSON: () => ({}) };
      });
    });

    const scrollTo = vi.spyOn(list, "scrollTo").mockImplementation((options?: ScrollToOptions | number, y?: number) => {
      list.scrollTop = typeof options === "number" ? (y ?? 0) : (options?.top ?? 0);
      list.dispatchEvent(new Event("scroll"));
    });

    await act(() => {
      list.dispatchEvent(new Event("scroll"));
    });

    const cueButton = () => [...container.querySelectorAll("button")].find(b =>
      /下方|返回顶部/.test(b.textContent ?? ""),
    );
    expect(cueButton()?.textContent).toBe("下方还有 2 个已隐藏模型");

    // Clicking the cue scrolls down to the bottom and switches the button to Back to top.
    await act(() => {
      cueButton()!.click();
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 160, behavior: "smooth" });
    expect(list.scrollTop).toBe(160);
    expect(cueButton()?.textContent).toBe("返回顶部");

    // Clicking Back to top scrolls back up and restores the below-the-fold cue.
    await act(() => {
      cueButton()!.click();
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
    expect(list.scrollTop).toBe(0);
    expect(cueButton()?.textContent).toBe("下方还有 2 个已隐藏模型");

    // When both active and hidden rows lie below the fold, the cue mentions both.
    clientHeight.mockReturnValue(110);
    vi.spyOn(list, "getBoundingClientRect").mockImplementation(() => ({
      top: 0, bottom: 110, left: 0, right: 400, width: 400, height: 110, x: 0, y: 0, toJSON: () => ({}),
    }));
    await act(() => {
      list.dispatchEvent(new Event("scroll"));
    });
    expect(cueButton()?.textContent).toBe("下方还有 4 个模型 · 3 个已隐藏");

    // When the list no longer overflows, no scroll cue is rendered.
    scrollHeight.mockReturnValue(110);
    await act(() => {
      list.dispatchEvent(new Event("scroll"));
    });
    expect(cueButton()).toBeUndefined();
  } finally {
    clientHeight.mockRestore();
    scrollHeight.mockRestore();
    await act(() => root.unmount());
    useHostsStore.setState(oldHosts, true);
    useModelPreferences.setState(oldPrefs, true);
    vi.unstubAllGlobals();
  }
});
