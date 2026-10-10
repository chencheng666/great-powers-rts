#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder, WebviewUrl};
use tauri_plugin_dialog::DialogExt;
use std::{fs, io::Read, sync::Mutex};
const LIMIT: usize = 8 * 1024 * 1024;
fn local(window: &WebviewWindow) -> Result<(), String> {
 let url = window.url().map_err(|e|e.to_string())?;
 if window.label() != "main" || !["localhost", "tauri.localhost", "127.0.0.1"].contains(&url.host_str().unwrap_or("")) {return Err("仅本地游戏窗口可使用桌面功能".into())} Ok(())
}
fn validate(contents: &str) -> Result<(), String> {
 if contents.len() > LIMIT { return Err("存档不能超过8MB".into()) }
 let value: serde_json::Value=serde_json::from_str(contents).map_err(|_|"存档不是有效JSON")?;
 if !value.is_object() {return Err("无效存档".into())} Ok(())
}
#[tauri::command]
fn desktop_fullscreen(window: WebviewWindow) -> Result<bool,String> {
 local(&window)?; let next=!window.is_fullscreen().map_err(|e|e.to_string())?;
 window.set_fullscreen(next).map_err(|e|e.to_string())?;Ok(next)
}
#[tauri::command]
fn desktop_online(app: tauri::AppHandle, window: WebviewWindow) -> Result<(),String> {
 local(&window)?;
 if let Some(w)=app.get_webview_window("online") {w.show().map_err(|e|e.to_string())?;return w.set_focus().map_err(|e|e.to_string())}
 let url="http://43.135.186.21:8088/".parse().map_err(|_|"服务器地址无效")?;
 WebviewWindowBuilder::new(&app,"online",WebviewUrl::External(url))
 .title("大国崛起 · 联网窗口（需要网络）").inner_size(1440.,900.)
 .on_navigation(|u|u.scheme()=="http" && u.host_str()==Some("43.135.186.21") && u.port()==Some(8088))
 .build().map_err(|e|e.to_string())?;Ok(())
}
#[tauri::command]
fn desktop_backup(app: tauri::AppHandle, window: WebviewWindow, slot: String, contents: String, lock: tauri::State<Mutex<()>>) -> Result<(),String> {
 local(&window)?;validate(&contents)?;if slot!="manual" && slot!="auto" {return Err("未知存档槽".into())}
 let _guard=lock.lock().map_err(|_|"存档锁异常")?;
 let dir=app.path().app_data_dir().map_err(|e|e.to_string())?.join("saves");fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
 let target=dir.join(format!("{}.json",slot));let temp=dir.join(format!("{}.tmp",slot));
 if target.exists() {fs::copy(&target,dir.join(format!("{}-previous.json",slot))).map_err(|e|e.to_string())?;}
 fs::write(&temp,contents).map_err(|e|e.to_string())?;
 #[cfg(unix)] {use std::os::unix::fs::PermissionsExt;fs::set_permissions(&temp,fs::Permissions::from_mode(0o600)).map_err(|e|e.to_string())?;}
 #[cfg(windows)] if target.exists() {fs::remove_file(&target).map_err(|e|e.to_string())?;}
 fs::rename(temp,target).map_err(|e|e.to_string())?;Ok(())
}
#[tauri::command]
async fn desktop_export(app: tauri::AppHandle, window: WebviewWindow, contents: String) -> Result<bool,String> {
 local(&window)?;validate(&contents)?;
 tauri::async_runtime::spawn_blocking(move|| {
 let Some(file)=app.dialog().file().set_file_name("Great-Powers-save.json").add_filter("游戏存档", &["json"]).blocking_save_file() else{return Ok(false)};
 let path=file.into_path().map_err(|e|e.to_string())?;fs::write(path,contents).map_err(|e|e.to_string())?;Ok(true)
 }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
async fn desktop_import(app: tauri::AppHandle, window: WebviewWindow) -> Result<Option<String>,String> {
 local(&window)?;
 tauri::async_runtime::spawn_blocking(move||{
 let Some(file)=app.dialog().file().add_filter("游戏存档", &["json"]).blocking_pick_file() else{return Ok(None)};
 let path=file.into_path().map_err(|e|e.to_string())?;let file=fs::File::open(path).map_err(|e|e.to_string())?;let mut data=String::new();file.take((LIMIT+1) as u64).read_to_string(&mut data).map_err(|e|e.to_string())?;validate(&data)?;Ok(Some(data))
 }).await.map_err(|e|e.to_string())?
}
fn main() {
 tauri::Builder::default().manage(Mutex::new(())).plugin(tauri_plugin_dialog::init())
 .invoke_handler(tauri::generate_handler![desktop_fullscreen,desktop_online,desktop_backup,desktop_export,desktop_import])
 .run(tauri::generate_context!()).expect("桌面应用启动失败");
}
