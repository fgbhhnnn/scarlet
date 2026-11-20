//! Asking before Scarlet quits with work under way. Closing the window quits Scarlet, and so does ⌘Q: each asks the
//! engine what quitting would stop, says so in a native question, and quits at once when nothing would.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::host::api::Api;
use crate::AppState;

/// The menu item that stands in for the standard Quit, which ends Scarlet without a word.
#[cfg(target_os = "macos")]
pub const QUIT_MENU_ID: &str = "scarlet-quit";

/// What the engine says quitting would stop (GET /api/under-way).
#[derive(Debug, Default, Deserialize, PartialEq)]
pub struct UnderWay {
    #[serde(default)]
    pub edits: u32,
    #[serde(default)]
    pub queued: u32,
    #[serde(default)]
    pub exports: u32,
}

/// Why Scarlet is closing: the editor quit, or pressed Restart to update, after which it opens again by itself.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Leaving {
    Quit,
    Restart,
}

/// The question to ask before quitting or restarting, naming what would stop. None when nothing would.
pub fn warning(work: &UnderWay, leaving: Leaving) -> Option<String> {
    let name = |n: u32, one: &str, many: &str| match n {
        0 => None,
        1 => Some(one.to_string()),
        n => Some(many.replace("{n}", &n.to_string())),
    };
    let parts: Vec<String> = [
        name(work.edits, "Scarlet 正在处理的剪辑", "Scarlet 正在处理的 {n} 个剪辑"),
        name(work.queued, "一个排队中的剪辑", "{n} 个排队中的剪辑"),
        name(work.exports, "一个导出任务", "{n} 个导出任务"),
    ]
    .into_iter()
    .flatten()
    .collect();
    let list = match parts.as_slice() {
        [] => return None,
        [one] => one.clone(),
        [rest @ .., last] => format!("{}和{last}", rest.join("、")),
    };
    // A run cut short by a quit resumes at the next launch, a queued edit starts then, and an export renders again.
    Some(match leaving {
        Leaving::Quit => format!("退出会停止{list}。下次打开 Scarlet 时会继续。"),
        Leaving::Restart => format!("重启会停止{list}。Scarlet 重新打开时会继续。"),
    })
}

/// Ask the engine what quitting would stop. None when it can't say in a moment.
pub async fn under_way(url: &str, token: &str) -> Option<UnderWay> {
    match tokio::time::timeout(Duration::from_secs(2), Api::new(url, Some(token)).get::<UnderWay>("/under-way")).await {
        Ok(Ok(work)) => Some(work),
        Ok(Err(e)) => {
            log::warn!("could not ask the engine what quitting would stop: {e}");
            None
        }
        Err(_) => {
            log::warn!("the engine did not say in time what quitting would stop");
            None
        }
    }
}

/// What quitting would stop: what the engine says, or else the runs the agent host here has under way. An engine
/// that is gone or stuck can't say, and its exports are lost with it, but the runs here would still be cut short.
fn what_would_stop(engine: Option<UnderWay>, running_here: usize) -> UnderWay {
    engine.unwrap_or(UnderWay { edits: running_here as u32, ..Default::default() })
}

/// The window goes first: stopping the agents and the engine can take some seconds, and a window left on screen
/// meanwhile reads as Scarlet frozen.
fn quit_now(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    app.exit(0);
}

/// Return the editor's choice if ending this session would stop work.
pub async fn confirm_if_busy(app: &AppHandle, leaving: Leaving) -> bool {
    let Some(state) = app.try_state::<AppState>() else { return true };
    let engine = state.engine.status();
    let said = match (engine.url.as_deref(), engine.token.as_deref()) {
        (Some(url), Some(token)) => under_way(url, token).await,
        _ => None,
    };
    let running_here = state.host.status().await.running.len();
    let Some(asked) = warning(&what_would_stop(said, running_here), leaving) else { return true };
    log::info!("asking before {}: {asked}", if leaving == Leaving::Quit { "quitting" } else { "restarting" });
    let (title, yes) = if leaving == Leaving::Quit { ("退出 Scarlet？", "退出") } else { ("重启 Scarlet？", "重启") };
    let dialog = app.dialog().message(asked).title(title)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(yes.into(), "取消".into()));
    #[cfg(windows)]
    let dialog = match app.get_webview_window("main") {
        Some(window) => dialog.parent(&window),
        None => dialog,
    };
    let (answer, received) = tokio::sync::oneshot::channel();
    dialog.show(move |yes| { let _ = answer.send(yes); });
    received.await.unwrap_or(false)
}

/// Close the window or quit: ask first when that would stop work, and quit at once when it wouldn't.
pub fn ask_before_quitting(app: &AppHandle) {
    static ASKING: AtomicBool = AtomicBool::new(false);
    // Another ⌘W while Scarlet asks gets the same question.
    if ASKING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if confirm_if_busy(&app, Leaving::Quit).await {
            quit_now(&app);
        } else {
            ASKING.store(false, Ordering::SeqCst);
        }
    });
}

/// The standard Mac menu, with a Quit that asks first in place of the standard one.
#[cfg(target_os = "macos")]
pub fn menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem as Item, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID};
    let package = app.package_info();
    let bundle = &app.config().bundle;
    let name = &package.name;
    let about = AboutMetadata {
        name: Some(name.clone()),
        version: Some(package.version.to_string()),
        copyright: bundle.copyright.clone(),
        authors: bundle.publisher.clone().map(|publisher| vec![publisher]),
        ..Default::default()
    };
    let scarlet = Submenu::with_items(app, name, true, &[
        &Item::about(app, Some(&format!("关于 {name}")), Some(about))?,
        &Item::separator(app)?,
        &Item::services(app, Some("服务"))?,
        &Item::separator(app)?,
        &Item::hide(app, Some(&format!("隐藏 {name}")))?,
        &Item::hide_others(app, Some("隐藏其他应用"))?,
        &Item::separator(app)?,
        &MenuItem::with_id(app, QUIT_MENU_ID, format!("退出 {name}"), true, Some("CmdOrCtrl+Q"))?,
    ])?;
    let file = Submenu::with_items(app, "文件", true, &[&Item::close_window(app, Some("关闭窗口"))?])?;
    let edit = Submenu::with_items(app, "编辑", true, &[
        &Item::undo(app, Some("撤销"))?,
        &Item::redo(app, Some("重做"))?,
        &Item::separator(app)?,
        &Item::cut(app, Some("剪切"))?,
        &Item::copy(app, Some("复制"))?,
        &Item::paste(app, Some("粘贴"))?,
        &Item::select_all(app, Some("全选"))?,
    ])?;
    let view = Submenu::with_items(app, "视图", true, &[&Item::fullscreen(app, Some("切换全屏"))?])?;
    let window = Submenu::with_id_and_items(app, WINDOW_SUBMENU_ID, "窗口", true, &[
        &Item::minimize(app, Some("最小化"))?,
        &Item::maximize(app, Some("缩放"))?,
        &Item::separator(app)?,
        &Item::close_window(app, Some("关闭窗口"))?,
    ])?;
    let help = Submenu::with_id_and_items(app, HELP_SUBMENU_ID, "帮助", true, &[])?;
    Menu::with_items(app, &[&scarlet, &file, &edit, &view, &window, &help])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::api::fake;

    #[test]
    fn names_what_quitting_would_stop() {
        let asks = |edits, queued, exports| warning(&UnderWay { edits, queued, exports }, Leaving::Quit);
        assert_eq!(asks(0, 0, 0), None);
        assert_eq!(asks(1, 0, 0).as_deref(), Some("退出会停止Scarlet 正在处理的剪辑。下次打开 Scarlet 时会继续。"));
        assert_eq!(asks(1, 2, 0).as_deref(), Some("退出会停止Scarlet 正在处理的剪辑和2 个排队中的剪辑。下次打开 Scarlet 时会继续。"));
        assert_eq!(asks(2, 1, 1).as_deref(), Some("退出会停止Scarlet 正在处理的 2 个剪辑、一个排队中的剪辑和一个导出任务。下次打开 Scarlet 时会继续。"));
        assert_eq!(asks(0, 0, 3).as_deref(), Some("退出会停止3 个导出任务。下次打开 Scarlet 时会继续。"));
        // Restart to update opens Scarlet again by itself, and says so in its own words.
        let restart = |edits, queued| warning(&UnderWay { edits, queued, exports: 0 }, Leaving::Restart);
        assert_eq!(restart(0, 0), None);
        assert_eq!(restart(1, 0).as_deref(), Some("重启会停止Scarlet 正在处理的剪辑。Scarlet 重新打开时会继续。"));
        assert_eq!(restart(1, 2).as_deref(), Some("重启会停止Scarlet 正在处理的剪辑和2 个排队中的剪辑。Scarlet 重新打开时会继续。"));
    }

    #[tokio::test]
    async fn asks_the_engine_and_else_counts_the_runs_here_before_quitting_at_once() {
        let busy = fake::engine(|route, _| match route {
            "GET /api/under-way" => (200, r#"{"edits":1,"queued":0,"exports":1}"#.into()),
            _ => (404, String::new()),
        })
        .await;
        let said = under_way(&busy.url, "sct_t").await;
        assert_eq!(said, Some(UnderWay { edits: 1, queued: 0, exports: 1 }));
        assert_eq!(warning(&what_would_stop(said, 1), Leaving::Quit).as_deref(), Some("退出会停止Scarlet 正在处理的剪辑和一个导出任务。下次打开 Scarlet 时会继续。"));
        // The engine's word stands over the host's: nothing under way, so Scarlet quits at once.
        let idle = fake::engine(|_, _| (200, r#"{"edits":0,"queued":0,"exports":0}"#.into())).await;
        assert_eq!(warning(&what_would_stop(under_way(&idle.url, "sct_t").await, 0), Leaving::Quit), None);
        // An engine that has gone, or one too old to say, can't: the runs under way here are what quitting would stop.
        let gone = format!("http://{}", std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap());
        let old = fake::engine(|_, _| (404, r#"{"error":{"code":"not_found","message":"Not found"}}"#.into())).await;
        for silent in [under_way(&gone, "sct_t").await, under_way(&old.url, "sct_t").await] {
            assert_eq!(silent, None);
            assert_eq!(warning(&what_would_stop(None, 2), Leaving::Quit).as_deref(), Some("退出会停止Scarlet 正在处理的 2 个剪辑。下次打开 Scarlet 时会继续。"));
            assert_eq!(warning(&what_would_stop(silent, 0), Leaving::Quit), None);
        }
    }
}
