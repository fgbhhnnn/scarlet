import { useEffect, useState } from "react";
import { FEATURE_NAMES, type TelemetryUnavailable } from "@scarlet/shared";
import appIcon from "../../../../desktop/src-tauri/icons/128x128@2x.png";
import { api, errorMessage } from "../../lib/client";
import { desktop } from "../../lib/desktop";
import { Icon, InlineError, Loading, Toggle } from "../ui/primitives";
import { Changelog } from "./Changelog";
import { UpdateSettings } from "./UpdateSettings";
import { shellZh } from "../../lib/zh-shell";

export function AboutSettings() {
  return (
    <section className="about-settings" aria-label={shellZh.settings.about}>
      <div className="card about-build">
        <div className="about-identity">
          <img src={appIcon} width={72} height={72} alt="" />
          <div>
            <h2>Scarlet</h2>
            <dl>
              <div><dt>{shellZh.settings.version}</dt><dd>{__SCARLET_VERSION__}</dd></div>
              {__SCARLET_REVISION__ && (
                <div><dt>提交版本</dt><dd><code title={__SCARLET_REVISION__}>{__SCARLET_REVISION__.slice(0, 7)}</code></dd></div>
              )}
            </dl>
          </div>
        </div>
        <UpdateSettings />
      </div>
      <div className="about-content">
        <Changelog />
        <div>
          <section className="card about-telemetry" aria-labelledby="telemetry-heading">
            <h2 id="telemetry-heading">{shellZh.about.telemetry}</h2>
            <TelemetrySwitch />
            <p>Scarlet 正式版默认向美国的 PostHog 发送使用情况报告，用于了解剪辑频率、用户是否再次使用或导出，以及用户如何审阅 Scarlet 的修改。</p>
            <details className="about-disclosure">
              <summary>Scarlet 会发送哪些信息<Icon name="chevron" size={12} /></summary>
              <div className="about-telemetry-details">
                <ul className="list-disc space-y-1 pl-5">
                  <li>启动时，Scarlet 会发送项目库中的项目数量，废纸篓中的项目除外。</li>
                  <li>受统计的功能执行成功后，Scarlet 会发送功能名称，包括代表你执行的操作。</li>
                  <li>任务排队时，Scarlet 会发送任务类型、选用的模型服务和快速模式设置。任务结束后，Scarlet 会发送任务类型、模型服务、结果（完成、失败或取消）、是否中断、可用的耗时和已记录的更改数。这些信息也涵盖后台转写和恢复的任务。</li>
                  <li>导出结束时，Scarlet 会发送渲染类型、结果和可用的质量设置。</li>
                  <li>当你明确保留、提出修改或拒绝一项已应用的剪辑时，Scarlet 会发送你的选择和该剪辑在此安装中的专用代码，用于关联后续选择。修改或拒绝会在请求获接受时计入。仅打开、关闭卡片或不处理剪辑时，不会发送审阅决定。</li>
                </ul>
                <p>每个事件附带时间、避免重复计数的随机事件 ID、Scarlet 版本、操作系统、处理器架构和用于关联同一安装事件的匿名 ID。PostHog 会看到连接的 IP 地址。Scarlet 会关闭位置查询和个人资料功能。</p>
                <p>报告不含账号信息、素材、音频、转写、提示词、备注、剪辑标题、修改文字、项目名称、文件路径、模型名称、错误信息或项目库中的 ID。</p>
                <p>你也可以在启动 Scarlet 前设置 <code>SCARLET_TELEMETRY_ENABLED=false</code> 关闭报告。</p>
                <details>
                  <summary className="cursor-pointer">{shellZh.about.tracked}</summary>
                  <ul className="mt-2 list-disc pl-5">{FEATURE_NAMES.map(name => <li key={name}><code>{name}</code></li>)}</ul>
                </details>
              </div>
            </details>
          </section>
          <ModelCredit />
        </div>
      </div>
    </section>
  );
}

function TelemetrySwitch() {
  const [state, setState] = useState<{ enabled: boolean; unavailable?: TelemetryUnavailable }>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = () => {
    setError("");
    return api.settings().then(({ settings, telemetryUnavailable }) => {
      setState({ enabled: settings.telemetryEnabled, unavailable: telemetryUnavailable });
    }).catch(e => setError(errorMessage(e)));
  };
  useEffect(() => { void load(); }, []);
  async function change(enabled: boolean) {
    setSaving(true);
    setError("");
    try {
      const { settings } = await api.updateSettings({ telemetryEnabled: enabled });
      setState({ enabled: settings.telemetryEnabled });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  return <>
    {state ? <div className="about-telemetry-toggle">
      <span>{shellZh.about.send}</span>
      <Toggle label={shellZh.about.send} checked={!state.unavailable && state.enabled} disabled={saving || !!state.unavailable} onChange={change} />
    </div> : !error && <Loading label={shellZh.about.loading} />}
    {state?.unavailable === "environment" && <p>{shellZh.about.offEnv}</p>}
    {state?.unavailable === "unconfigured" && <p>{shellZh.about.noProject}</p>}
    <InlineError>{error}</InlineError>
    {error && !state && <button className="btn-quiet" onClick={() => void load()}>{shellZh.about.retry}</button>}
  </>;
}

function ModelCredit() {
  const [error, setError] = useState("");
  const url = "https://desertant.com";
  return <div className="about-credit">
    语气词检测使用 <a className="underline" href={url} onClick={e => {
      e.preventDefault();
      setError("");
      void desktop.openUrl(url).catch(e => setError(errorMessage(e)));
    }}>Desert Ant Labs 的 Uhm</a>。
    <InlineError>{error}</InlineError>
  </div>;
}
