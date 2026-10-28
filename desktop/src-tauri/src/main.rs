#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::ipc::{InvokeBody, Request};

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

/// Save bytes sent from the page, through the normal Windows "Save as" window.
#[tauri::command]
fn save_file(request: Request<'_>) -> Result<String, String> {
    let name = request
        .headers()
        .get("x-name")
        .and_then(|v| v.to_str().ok())
        .map(pct_decode)
        .unwrap_or_else(|| "k-edit".to_string());
    let data: &[u8] = match request.body() {
        InvokeBody::Raw(d) => d.as_slice(),
        _ => return Err("no data".into()),
    };
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
    match dlg.save_file() {
        Some(p) => {
            std::fs::write(&p, data).map_err(|e| e.to_string())?;
            Ok(p.to_string_lossy().into_owned())
        }
        None => Ok(String::new()),
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
        .invoke_handler(tauri::generate_handler![save_file, reveal])
        .run(tauri::generate_context!())
        .expect("K-Edit failed to start");
}
