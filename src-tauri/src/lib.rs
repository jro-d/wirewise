use futures_util::StreamExt;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::window::Color;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;

const GITHUB_RELEASES_API: &str = "https://api.github.com/repos/jro-d/wirewise/releases/latest";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAppInfo {
    version: String,
    platform: String,
    is_packaged: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopUpdateStatus {
    state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    percent: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    manual: Option<bool>,
}

#[derive(Debug, Clone)]
struct PendingUpdate {
    version: String,
    download_url: String,
    file_name: String,
}

#[derive(Default)]
struct UpdateStore {
    pending: Option<PendingUpdate>,
    downloaded_path: Option<PathBuf>,
    is_downloading: bool,
}

struct UpdateState(Mutex<UpdateStore>);

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    #[serde(default)]
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

fn emit_status(app: &AppHandle, status: DesktopUpdateStatus) {
    let _ = app.emit("desktop:update-status", status);
}

fn is_safe_release_asset_name(name: &str) -> bool {
    name.starts_with("WireWise-Setup-")
        && name.ends_with(".exe")
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
}

fn is_trusted_github_download_url(raw: &str) -> bool {
    match reqwest::Url::parse(raw) {
        Ok(url) => {
            if url.scheme() != "https" {
                return false;
            }
            matches!(
                url.host_str(),
                Some("github.com")
                    | Some("objects.githubusercontent.com")
                    | Some("release-assets.githubusercontent.com")
            )
        }
        Err(_) => false,
    }
}

fn http_client(app_version: &str) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("WireWise/{app_version}"))
        .timeout(Duration::from_secs(300))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {e}"))
}

async fn perform_update_check(app: AppHandle, manual: bool) {
    let current_str = app.package_info().version.to_string();

    if cfg!(debug_assertions) {
        if manual {
            emit_status(
                &app,
                DesktopUpdateStatus {
                    state: "not-available".into(),
                    version: Some(current_str),
                    percent: None,
                    message: Some(
                        "Running local dev preview — online updates apply to installed WireWise releases."
                            .into(),
                    ),
                    manual: Some(true),
                },
            );
        }
        return;
    }

    emit_status(
        &app,
        DesktopUpdateStatus {
            state: "checking".into(),
            version: None,
            percent: None,
            message: None,
            manual: Some(manual),
        },
    );

    let client = match http_client(&current_str) {
        Ok(c) => c,
        Err(msg) => {
            emit_status(
                &app,
                DesktopUpdateStatus {
                    state: "error".into(),
                    version: None,
                    percent: None,
                    message: Some(msg),
                    manual: Some(manual),
                },
            );
            return;
        }
    };

    let response = match client
        .get(GITHUB_RELEASES_API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            emit_status(
                &app,
                DesktopUpdateStatus {
                    state: "error".into(),
                    version: None,
                    percent: None,
                    message: Some(format!("Could not reach update server ({e}).")),
                    manual: Some(manual),
                },
            );
            return;
        }
    };

    if !response.status().is_success() {
        emit_status(
            &app,
            DesktopUpdateStatus {
                state: "error".into(),
                version: None,
                percent: None,
                message: Some(format!(
                    "Update server returned HTTP {}.",
                    response.status().as_u16()
                )),
                manual: Some(manual),
            },
        );
        return;
    }

    let release: GitHubRelease = match response.json().await {
        Ok(rel) => rel,
        Err(e) => {
            emit_status(
                &app,
                DesktopUpdateStatus {
                    state: "error".into(),
                    version: None,
                    percent: None,
                    message: Some(format!("Invalid release metadata ({e}).")),
                    manual: Some(manual),
                },
            );
            return;
        }
    };

    let remote_ver_str = release.tag_name.trim_start_matches('v').to_string();
    let current_ver = Version::parse(&current_str).ok();
    let remote_ver = Version::parse(&remote_ver_str).ok();

    let is_newer = match (current_ver, remote_ver) {
        (Some(cur), Some(rem)) => rem > cur,
        _ => remote_ver_str != current_str,
    };

    if !is_newer {
        emit_status(
            &app,
            DesktopUpdateStatus {
                state: "not-available".into(),
                version: Some(current_str),
                percent: None,
                message: None,
                manual: Some(manual),
            },
        );
        return;
    }

    let setup_asset = release
        .assets
        .into_iter()
        .find(|a| is_safe_release_asset_name(&a.name) && is_trusted_github_download_url(&a.browser_download_url));

    let Some(asset) = setup_asset else {
        emit_status(
            &app,
            DesktopUpdateStatus {
                state: "not-available".into(),
                version: Some(current_str),
                percent: None,
                message: Some(format!(
                    "WireWise v{remote_ver_str} is still building its Windows installer — try again shortly."
                )),
                manual: Some(manual),
            },
        );
        return;
    };

    let state = app.state::<UpdateState>();
    {
        let mut store = state.0.lock().await;
        store.pending = Some(PendingUpdate {
            version: remote_ver_str.clone(),
            download_url: asset.browser_download_url,
            file_name: asset.name,
        });
        store.downloaded_path = None;
    }

    emit_status(
        &app,
        DesktopUpdateStatus {
            state: "available".into(),
            version: Some(remote_ver_str),
            percent: None,
            message: None,
            manual: Some(manual),
        },
    );
}

#[tauri::command]
fn desktop_get_info(app: AppHandle) -> DesktopAppInfo {
    DesktopAppInfo {
        version: app.package_info().version.to_string(),
        platform: if cfg!(target_os = "windows") {
            "win32".into()
        } else {
            std::env::consts::OS.into()
        },
        is_packaged: !cfg!(debug_assertions),
    }
}

#[tauri::command]
async fn desktop_check_updates(app: AppHandle) {
    perform_update_check(app, true).await;
}

#[tauri::command]
async fn desktop_download_update(app: AppHandle) {
    let state = app.state::<UpdateState>();
    let pending = {
        let mut store = state.0.lock().await;
        if store.is_downloading {
            return;
        }
        let Some(p) = store.pending.clone() else {
            return;
        };
        store.is_downloading = true;
        p
    };

    let result = download_installer_file(&app, &pending).await;

    let mut store = state.0.lock().await;
    store.is_downloading = false;
    match result {
        Ok(path) => {
            store.downloaded_path = Some(path);
            emit_status(
                &app,
                DesktopUpdateStatus {
                    state: "downloaded".into(),
                    version: Some(pending.version),
                    percent: Some(100),
                    message: None,
                    manual: Some(true),
                },
            );
        }
        Err(err) => {
            emit_status(
                &app,
                DesktopUpdateStatus {
                    state: "error".into(),
                    version: Some(pending.version),
                    percent: None,
                    message: Some(err),
                    manual: Some(true),
                },
            );
        }
    }
}

async fn download_installer_file(
    app: &AppHandle,
    pending: &PendingUpdate,
) -> Result<PathBuf, String> {
    if !is_trusted_github_download_url(&pending.download_url) {
        return Err("Refused download from untrusted host.".into());
    }

    let current_str = app.package_info().version.to_string();
    let client = http_client(&current_str)?;

    emit_status(
        app,
        DesktopUpdateStatus {
            state: "downloading".into(),
            version: Some(pending.version.clone()),
            percent: Some(0),
            message: None,
            manual: Some(true),
        },
    );

    let response = client
        .get(&pending.download_url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Installer download returned HTTP {}.",
            response.status().as_u16()
        ));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let update_dir = std::env::temp_dir().join("WireWise-Update");
    std::fs::create_dir_all(&update_dir)
        .map_err(|e| format!("Could not prepare temp update folder: {e}"))?;
    let dest_path = update_dir.join(&pending.file_name);

    let mut file = std::fs::File::create(&dest_path)
        .map_err(|e| format!("Could not create installer file: {e}"))?;

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_percent: u8 = 0;
    let mut header_checked = false;

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| format!("Download interrupted: {e}"))?;
        if !header_checked && chunk.len() >= 2 {
            if &chunk[0..2] != b"MZ" {
                let _ = std::fs::remove_file(&dest_path);
                return Err("Downloaded file is not a valid Windows executable.".into());
            }
            header_checked = true;
        }
        file.write_all(&chunk)
            .map_err(|e| format!("Failed writing installer file: {e}"))?;
        downloaded += chunk.len() as u64;

        if total_bytes > 0 {
            let pct = ((downloaded.saturating_mul(100)) / total_bytes).min(100) as u8;
            if pct != last_percent {
                last_percent = pct;
                emit_status(
                    app,
                    DesktopUpdateStatus {
                        state: "downloading".into(),
                        version: Some(pending.version.clone()),
                        percent: Some(pct),
                        message: None,
                        manual: Some(true),
                    },
                );
            }
        }
    }

    file.flush()
        .map_err(|e| format!("Failed finalizing installer file: {e}"))?;

    if downloaded == 0 || (total_bytes > 0 && downloaded != total_bytes) {
        let _ = std::fs::remove_file(&dest_path);
        return Err("Installer download was incomplete. Please try again.".into());
    }

    Ok(dest_path)
}

#[tauri::command]
async fn desktop_install_update(app: AppHandle) -> Result<(), String> {
    let state = app.state::<UpdateState>();
    let installer_path = {
        let store = state.0.lock().await;
        store.downloaded_path.clone()
    };

    let Some(path) = installer_path else {
        return Err("No downloaded update installer found.".into());
    };

    if !path.exists() {
        return Err("Downloaded installer is no longer on disk.".into());
    }

    Command::new(&path)
        .spawn()
        .map_err(|e| format!("Failed to launch WireWise updater: {e}"))?;

    app.exit(0);
    Ok(())
}

fn build_app_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&PredefinedMenuItem::quit(app, Some("Exit WireWise"))?)
        .build()?;

    let open_keybinds_edit = MenuItemBuilder::with_id("open_keybinds", "Keyboard Shortcuts…")
        .build(app)?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&open_keybinds_edit)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .fullscreen()
        .build()?;

    let edit_keybinds_item = MenuItemBuilder::with_id("open_keybinds", "Edit Keybinds…")
        .build(app)?;
    let reset_keybinds_item = MenuItemBuilder::with_id("reset_keybinds", "Reset Keybinds to Defaults")
        .build(app)?;

    let keybinds_menu = SubmenuBuilder::new(app, "Keybinds")
        .item(&edit_keybinds_item)
        .item(&reset_keybinds_item)
        .build()?;

    let check_updates_item = MenuItemBuilder::with_id("check_updates", "Check for Updates…")
        .build(app)?;
    let about_item = MenuItemBuilder::with_id("about", "About WireWise").build(app)?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&check_updates_item)
        .separator()
        .item(&about_item)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&file_menu, &edit_menu, &view_menu, &keybinds_menu, &help_menu])
        .build()
}

fn is_local_app_url(url: &tauri::Url) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "about" | "blob" | "data" => true,
        "http" | "https" => matches!(
            url.host_str(),
            Some("localhost") | Some("127.0.0.1") | Some("tauri.localhost")
        ),
        _ => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(UpdateState(Mutex::new(UpdateStore::default())))
        .invoke_handler(tauri::generate_handler![
            desktop_get_info,
            desktop_check_updates,
            desktop_download_update,
            desktop_install_update,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            let menu = build_app_menu(&handle)?;
            app.set_menu(menu)?;

            let nav_handle = handle.clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("WireWise — Electrical Installation Simulator")
                .inner_size(1400.0, 900.0)
                .min_inner_size(1024.0, 680.0)
                .background_color(Color(0x14, 0x18, 0x1d, 0xff))
                .resizable(true)
                .on_navigation(move |url| {
                    if is_local_app_url(url) {
                        true
                    } else {
                        if matches!(url.scheme(), "http" | "https") {
                            let _ = nav_handle.opener().open_url(url.as_str(), None::<&str>);
                        }
                        false
                    }
                })
                .build()?;

            #[cfg(not(debug_assertions))]
            {
                let bg_handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    perform_update_check(bg_handle, false).await;
                });
            }

            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_keybinds" => {
                let _ = app.emit("desktop:open-keybinds", ());
            }
            "reset_keybinds" => {
                let _ = app.emit("desktop:reset-keybinds", ());
            }
            "check_updates" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    perform_update_check(handle, true).await;
                });
            }
            "about" => {
                let version = app.package_info().version.to_string();
                app.dialog()
                    .message(format!(
                        "WireWise v{version}\n\nInteractive Electrical Installation & Motor Control Simulator (PEC 2017 / IEC 60364).\nDesktop Edition (Tauri + Rust)."
                    ))
                    .title("About WireWise")
                    .kind(MessageDialogKind::Info)
                    .show(|_| {});
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running WireWise desktop application");
}
