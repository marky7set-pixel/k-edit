#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{collections::HashMap, fs::File, io::Write, sync::Mutex};
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

fn hex(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            if let (Some(h), Some(l)) = (b.get(i + 1).and_then(|c| hex(*c)), b.get(i + 2).and_then(|c| hex(*c))) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

struct Saves(Mutex<HashMap<String, (File, String)>>);

/// Step 1: the normal Windows "Save as" window; returns a ticket ("" when cancelled).
#[tauri::command]
fn save_begin(name: String, state: State<'_, Saves>) -> Result<String, String> {
    let ext = std::path::Path::new(&name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mut dlg = rfd::FileDialog::new().set_file_name(&name).set_title("K-Edit");
    if !ext.is_empty() {
        dlg = dlg.add_filter(ext.to_uppercase(), &[ext.as_str()]);
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        let pics = std::path::Path::new(&home).join("Pictures");
        if pics.is_dir() {
            dlg = dlg.set_directory(pics);
        }
    }
    let path = match dlg.save_file() {
        Some(p) => p,
        None => return Ok(String::new()),
    };
    let file = File::create(&path).map_err(|e| e.to_string())?;
    let id = format!(
        "{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    state
        .0
        .lock()
        .map_err(|_| "busy".to_string())?
        .insert(id.clone(), (file, path.to_string_lossy().into_owned()));
    Ok(id)
}

/// Step 2: append one piece of the file (raw bytes, a few MB each).
#[tauri::command]
fn save_chunk(request: Request<'_>, state: State<'_, Saves>) -> Result<(), String> {
    let id = request
        .headers()
        .get("x-id")
        .and_then(|v| v.to_str().ok())
        .map(pct_decode)
        .unwrap_or_default();
    let data: &[u8] = match request.body() {
        InvokeBody::Raw(d) => d.as_slice(),
        _ => return Err("no data".into()),
    };
    let mut map = state.0.lock().map_err(|_| "busy".to_string())?;
    let entry = map.get_mut(&id).ok_or_else(|| "unknown save".to_string())?;
    entry.0.write_all(data).map_err(|e| e.to_string())
}

/// Step 3: finish and return the saved path.
#[tauri::command]
fn save_end(id: String, state: State<'_, Saves>) -> Result<String, String> {
    let item = state.0.lock().map_err(|_| "busy".to_string())?.remove(&id);
    match item {
        Some((mut f, p)) => {
            f.flush().map_err(|e| e.to_string())?;
            Ok(p)
        }
        None => Err("unknown save".into()),
    }
}

/// Cancelled half-way: remove the unfinished file.
#[tauri::command]
fn save_abort(id: String, state: State<'_, Saves>) {
    if let Ok(mut m) = state.0.lock() {
        if let Some((f, p)) = m.remove(&id) {
            drop(f);
            let _ = std::fs::remove_file(p);
        }
    }
}

/// Show the saved file in Explorer.
#[tauri::command]
fn reveal(path: String) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("explorer")
            .raw_arg(format!("/select,\"{}\"", path))
            .spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = path;
    }
}

fn main() {
    tauri::Builder::default()
        .manage(Saves(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![save_begin, save_chunk, save_end, save_abort, reveal])
        .run(tauri::generate_context!())
        .expect("K-Edit failed to start");
}
