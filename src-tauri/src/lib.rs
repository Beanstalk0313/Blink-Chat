use std::collections::HashMap;

/// Returns the processes whose executable name is in `known`, as
/// `[executable, window title]` pairs. The game catalog lives in the web app
/// (`src/data/games.js`), which passes the executable names down, so adding a
/// game never means touching Rust.
///
/// Async on purpose: Tauri runs synchronous commands on the main thread, and a
/// process scan there would freeze the window. The scan itself is a Win32
/// Toolhelp snapshot plus one EnumWindows pass, so it returns in about a
/// millisecond and never starts a child process.
#[tauri::command]
async fn running_games(known: Vec<String>) -> Vec<(String, String)> {
    let wanted: std::collections::HashSet<String> =
        known.into_iter().map(|name| name.to_lowercase()).collect();
    let processes = list_processes();
    let matches: Vec<(String, String)> = processes
        .into_iter()
        .filter(|(exe, _)| wanted.contains(&exe.to_lowercase()))
        .collect();
    debug_log(&format!("matches: {:?}", matches));
    matches
}

/// Diagnostics for game detection, written only when the shell is started with
/// `BLINK_PRESENCE_DEBUG=1`, so a normal install never touches the disk.
#[allow(dead_code)]
fn debug_log(message: &str) {
    if std::env::var_os("BLINK_PRESENCE_DEBUG").is_none() {
        return;
    }
    use std::io::Write;
    let mut path = std::env::temp_dir();
    path.push("blink-presence-debug.log");
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{}", message);
    }
}

#[cfg(windows)]
fn list_processes() -> Vec<(String, String)> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    let started = std::time::Instant::now();
    let titles = window_titles();

    let mut processes = Vec::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            debug_log("scan: snapshot failed");
            return processes;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let end = entry.szExeFile.iter().position(|c| *c == 0).unwrap_or(entry.szExeFile.len());
                let exe = String::from_utf16_lossy(&entry.szExeFile[..end]);
                let title = titles.get(&entry.th32ProcessID).cloned().unwrap_or_default();
                processes.push((exe, title));
                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
    }
    debug_log(&format!(
        "scan: {} processes, {} with titles, {} us",
        processes.len(),
        processes.iter().filter(|(_, title)| !title.is_empty()).count(),
        started.elapsed().as_micros()
    ));
    processes
}

/// Top-level window titles keyed by owning process id. A process can own
/// several windows; the first non-empty title wins, which is the game window in
/// practice.
#[cfg(windows)]
fn window_titles() -> HashMap<u32, String> {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return 1;
        }
        let mut buffer = [0u16; 512];
        let length = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
        if length <= 0 {
            return 1;
        }
        let title = String::from_utf16_lossy(&buffer[..length as usize]);
        if title.trim().is_empty() {
            return 1;
        }
        let titles = &mut *(lparam as *mut HashMap<u32, String>);
        titles.entry(pid).or_insert(title);
        1
    }

    let mut titles: HashMap<u32, String> = HashMap::new();
    unsafe {
        EnumWindows(Some(collect), &mut titles as *mut HashMap<u32, String> as LPARAM);
    }
    titles
}

#[cfg(not(windows))]
fn list_processes() -> Vec<(String, String)> {
    Vec::new()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![running_games])
        .setup(|_app| {
            debug_log("app started");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Blink Chat");
}
