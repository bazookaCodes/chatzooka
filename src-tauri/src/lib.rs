mod link_preview;
mod link_safety;
mod secrets;

use tauri_plugin_sql::{Migration, MigrationKind};

/// Local history database (lives in the app data folder). Each migration runs once, in order.
fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "messages and users",
        sql: "
            CREATE TABLE messages (
                platform  TEXT    NOT NULL,
                id        TEXT    NOT NULL,
                user_id   TEXT    NOT NULL,
                ts        INTEGER NOT NULL,
                kind      TEXT    NOT NULL,
                data      TEXT    NOT NULL,
                deleted   INTEGER NOT NULL DEFAULT 0,
                mod_note  TEXT,
                PRIMARY KEY (platform, id)
            );
            CREATE INDEX messages_by_user ON messages (platform, user_id, ts);

            CREATE TABLE users (
                platform      TEXT    NOT NULL,
                user_id       TEXT    NOT NULL,
                login         TEXT,
                display_name  TEXT,
                first_seen    INTEGER NOT NULL,
                last_seen     INTEGER NOT NULL,
                message_count INTEGER NOT NULL DEFAULT 0,
                notes         TEXT,
                PRIMARY KEY (platform, user_id)
            );
        ",
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:chatzooka.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .manage(link_safety::SafetyState::default())
        .setup(|app| {
            // Load the phishing lists and refresh them in the background (every 12 hours).
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    if let Err(e) = link_safety::refresh(handle.clone(), false).await {
                        eprintln!("Link safety lists: {e}");
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            secrets::get_secret,
            secrets::set_secret,
            link_preview::link_preview,
            link_safety::check_links,
            link_safety::safety_status,
            link_safety::safety_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running Chatzooka");
}
