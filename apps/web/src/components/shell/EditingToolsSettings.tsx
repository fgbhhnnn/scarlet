import { EDITING_TOOL_GROUPS } from "@scarlet/shared";
import { editingToolsZh } from "../../lib/zh-shell";
import { SectionTitle } from "../ui/primitives";

/** What Scarlet can do on every request. Nothing here is a setting: the model
 * gets every tool its harness can use. */
export function EditingToolsSettings() {
  return (
    <section aria-label="剪辑工具" className="tool-settings">
      <SectionTitle>剪辑工具</SectionTitle>
      <p className="mb-3 text-muted">Scarlet 可以在每次请求中使用这些工具。</p>
      <ul className="skill-list card divide-y divide-line/60">
        {EDITING_TOOL_GROUPS.map(group => (
          <li key={group.title} className="tool-setting-row">
            <div className="font-medium">{editingToolsZh[group.title].title}</div>
            <p className="text-muted text-[12px]">{editingToolsZh[group.title].description}</p>
          </li>
        ))}
      </ul>
      <details className="tool-inventory">
        <summary>查看所有工具名称</summary>
        <dl>
          {EDITING_TOOL_GROUPS.map(group => <div key={group.title}>
            <dt>{editingToolsZh[group.title].title}</dt>
            <dd>{group.tools.map(tool => <code key={tool}>{tool}</code>)}</dd>
          </div>)}
        </dl>
      </details>
    </section>
  );
}
