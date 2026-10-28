//! Secrets (e.g. the Streamer.bot WebSocket password) live in the OS credential store,
//! never in files or localStorage.

use keyring::{Entry, Error};

const SERVICE: &str = "dev.chatzooka.client";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_secret(key: &str) -> Result<Option<String>, String> {
    match entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Stores `value`, or removes the secret when `value` is `None` or empty.
#[tauri::command]
pub fn set_secret(key: &str, value: Option<String>) -> Result<(), String> {
    let entry = entry(key)?;
    match value.filter(|v| !v.is_empty()) {
        Some(v) => entry.set_password(&v).map_err(|e| e.to_string()),
        None => match entry.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        },
    }
}
