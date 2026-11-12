use std::collections::HashSet;
use std::process::Command;

/// Returns the processes whose executable name is in `known`, as
/// `[executable, window title]` pairs. The game catalog lives in the web app
/// (`src/data/games.js`), which passes the executable names down, so adding a
/// game never means touching Rust.
#[tauri::command]
fn running_games(known: Vec<String>) -> Vec<(String, String)> {
    let wanted: HashSet<String> = known.into_iter().map(|name| name.to_lowercase()).collect();
    list_processes()
        .into_iter()
        .filter(|(exe, _)| wanted.contains(&exe.to_lowercase()))
        .collect()
}

#[cfg(windows)]
fn list_processes() -> Vec<(String, String)> {
    let output = match Command::new("tasklist")
        .args(["/v", "/fo", "csv", "/nh"])
        .output()
    {
        Ok(output) => output,
        Err(_) => return Vec::new(),
    };
    if !output.status.success() {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .filter_map(|line| {
            let fields = parse_csv_line(line);
            if fields.len() < 2 {
                return None;
            }
            // tasklist /v columns end with "Window Title"; the image name is
            // first. Everything between them (session, memory, status, user,
            // CPU time) is irrelevant here.
            let exe = fields.first()?.clone();
            let title = fields.last()?.clone();
            Some((exe, title))
        })
        .collect()
}

#[cfg(not(windows))]
fn list_processes() -> Vec<(String, String)> {
    Vec::new()
}

/// Minimal CSV field splitter that understands the quoted fields tasklist
/// emits (window titles may contain commas and quotes).
#[cfg(windows)]
fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();
    while let Some(character) = chars.next() {
        match character {
            '"' => {
                if quoted && chars.peek() == Some(&'"') {
                    current.push('"');
                    chars.next();
                } else {
                    quoted = !quoted;
                }
            }
            ',' if !quoted => fields.push(std::mem::take(&mut current)),
            _ => current.push(character),
        }
    }
    fields.push(current);
    fields
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![running_games])
        .run(tauri::generate_context!())
        .expect("error while running Blink Chat");
}
