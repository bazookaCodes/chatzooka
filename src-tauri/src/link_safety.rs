//! Link safety checks for URLs posted in chat. Everything runs on this PC; no link is ever sent
//! anywhere to be checked.
//!
//! 1. Known-bad lists, downloaded every 12 hours and matched locally:
//!    - Phishing.Database (MIT, github.com/Phishing-Database): known phishing domains.
//!    - OpenPhish Community Feed (github.com/openphish/public_feed): active phishing URLs.
//!    Entries are kept as 64-bit hashes, so ~400k domains take a few MB of memory.
//! 2. Pattern checks: look-alike domains of popular sites, links to raw IP addresses,
//!    internationalized (look-alike character) domains, URL shorteners, and chat-scam wording.
//!
//! A clean result means "nothing known", not "safe": brand-new scam links aren't on any list.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::RwLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::Url;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

const REFRESH_AFTER: Duration = Duration::from_secs(12 * 3600);
const MAX_LIST_BYTES: usize = 64 * 1024 * 1024;

struct Source {
    file: &'static str,
    url: &'static str,
    kind: SourceKind,
    label: &'static str,
}

#[derive(Clone, Copy)]
enum SourceKind {
    Domains,
    Urls,
}

const SOURCES: [Source; 2] = [
    Source {
        file: "phishing-database-domains.txt",
        url: "https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-domains-ACTIVE.txt",
        kind: SourceKind::Domains,
        label: "Phishing.Database",
    },
    Source {
        file: "openphish-feed.txt",
        url: "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt",
        kind: SourceKind::Urls,
        label: "OpenPhish",
    },
];

#[derive(Default)]
struct Lists {
    /// Hashes of known phishing hostnames.
    domains: HashSet<u64>,
    /// Hashes of known phishing URLs (host + path, with and without query).
    urls: HashSet<u64>,
    /// Hosts that OpenPhish lists as a whole (entry with no path).
    url_hosts: HashSet<u64>,
    domain_count: usize,
    url_count: usize,
    updated_at: Option<u64>,
}

#[derive(Default)]
pub struct SafetyState {
    lists: RwLock<Lists>,
    updating: RwLock<bool>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinkVerdict {
    url: String,
    /// "danger", "warning" or "ok".
    level: &'static str,
    reasons: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetyStatus {
    domain_count: usize,
    url_count: usize,
    /// Unix ms of the oldest list file, or null if the lists aren't downloaded yet.
    updated_at: Option<u64>,
    updating: bool,
}

fn hash(s: &str) -> u64 {
    let mut h = DefaultHasher::new();
    s.hash(&mut h);
    h.finish()
}

fn normalize_host(host: &str) -> String {
    host.trim_end_matches('.').trim_start_matches("www.").to_ascii_lowercase()
}

/// "host/path" and "host/path?query" keys for URL-list matching.
fn url_keys(url: &Url) -> Option<(String, String, Option<String>)> {
    let host = normalize_host(url.host_str()?);
    let path = url.path().trim_end_matches('/').to_string();
    let base = format!("{host}{path}");
    let with_query = url.query().map(|q| format!("{base}?{q}"));
    Some((host, base, with_query))
}

// --- Downloading and loading ------------------------------------------------------------------

fn lists_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("link-safety");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn modified_ms(path: &PathBuf) -> Option<u64> {
    let m = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(m.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

async fn download(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .user_agent("Chatzooka/0.1 (link safety lists)")
        .build()
        .map_err(|e| e.to_string())?;
    let mut res = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status().as_u16()));
    }
    let mut body = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        if body.len() + chunk.len() > MAX_LIST_BYTES {
            return Err("List is unexpectedly large".into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn load(dir: &PathBuf) -> Lists {
    let mut lists = Lists::default();
    let mut oldest: Option<u64> = None;
    for source in &SOURCES {
        let path = dir.join(source.file);
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        if let Some(ms) = modified_ms(&path) {
            oldest = Some(oldest.map_or(ms, |o| o.min(ms)));
        }
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            match source.kind {
                SourceKind::Domains => {
                    lists.domains.insert(hash(&normalize_host(line)));
                    lists.domain_count += 1;
                }
                SourceKind::Urls => {
                    let Ok(url) = Url::parse(line) else { continue };
                    let Some((host, base, with_query)) = url_keys(&url) else { continue };
                    if url.path() == "/" && url.query().is_none() {
                        lists.url_hosts.insert(hash(&host));
                    }
                    lists.urls.insert(hash(&base));
                    if let Some(q) = with_query {
                        lists.urls.insert(hash(&q));
                    }
                    lists.url_count += 1;
                }
            }
        }
    }
    lists.updated_at = oldest;
    lists
}

/// Load the saved lists, then download fresh copies if they're older than 12 hours (or `force`).
pub async fn refresh(app: AppHandle, force: bool) -> Result<(), String> {
    let state = app.state::<SafetyState>();
    {
        let mut updating = state.updating.write().unwrap();
        if *updating {
            return Ok(());
        }
        *updating = true;
    }
    let result = async {
        let dir = lists_dir(&app)?;
        if state.lists.read().unwrap().updated_at.is_none() {
            *state.lists.write().unwrap() = load(&dir);
        }
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
        let mut changed = false;
        let mut errors = Vec::new();
        for source in &SOURCES {
            let path = dir.join(source.file);
            let stale = modified_ms(&path).map_or(true, |ms| now.saturating_sub(ms) > REFRESH_AFTER.as_millis() as u64);
            if !(force || stale) {
                continue;
            }
            match download(source.url).await {
                Ok(bytes) => {
                    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
                    changed = true;
                }
                Err(e) => errors.push(format!("{}: {e}", source.label)),
            }
        }
        if changed {
            *state.lists.write().unwrap() = load(&dir);
        }
        if errors.is_empty() { Ok(()) } else { Err(format!("Couldn't update {}", errors.join(", "))) }
    }
    .await;
    *state.updating.write().unwrap() = false;
    result
}

// --- Pattern checks ---------------------------------------------------------------------------

/// Sites commonly imitated in gaming/streaming chat scams, with their real domains. Kept to
/// distinctive names: short everyday words (e.g. "apple") would flag innocent sites.
const BRANDS: &[(&str, &[&str])] = &[
    ("twitch", &["twitch.tv", "twitch.com", "twitchcdn.net", "twitchsvc.net", "ttvnw.net", "jtvnw.net"]),
    ("youtube", &["youtube.com", "youtu.be", "youtube-nocookie.com", "ytimg.com", "ggpht.com"]),
    ("discord", &["discord.com", "discord.gg", "discordapp.com", "discordapp.net", "discord.media", "discord.new", "discordstatus.com"]),
    ("steamcommunity", &["steamcommunity.com"]),
    ("steampowered", &["steampowered.com"]),
    ("paypal", &["paypal.com", "paypal.me"]),
    ("epicgames", &["epicgames.com"]),
    ("roblox", &["roblox.com", "rbxcdn.com"]),
    ("streamelements", &["streamelements.com"]),
    ("streamlabs", &["streamlabs.com"]),
    ("instagram", &["instagram.com", "cdninstagram.com"]),
    ("spotify", &["spotify.com", "spotify.link"]),
];

const SHORTENERS: &[&str] = &[
    "bit.ly", "tinyurl.com", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "shorturl.at", "tiny.cc", "s.id", "ow.ly",
    "buff.ly", "rebrand.ly", "t.ly", "v.gd", "bl.ink", "shorturl.com", "tinu.be", "lnkd.in", "s4w.in", "qr.ae",
];

/// Words used in "free nitro / free skins" scams; only alarming next to a brand name.
const SCAM_WORDS: &[&str] = &["nitro", "gift", "free", "giveaway", "airdrop", "claim", "promo", "reward", "skins", "drop"];

/// The registrable part of a host, approximately (handles "example.co.uk").
fn registrable(host: &str) -> String {
    let labels: Vec<&str> = host.split('.').collect();
    let n = labels.len();
    if n >= 3 && labels[n - 1].len() == 2 && ["co", "com", "net", "org", "gov", "edu", "ac"].contains(&labels[n - 2]) {
        labels[n - 3..].join(".")
    } else if n >= 2 {
        labels[n - 2..].join(".")
    } else {
        host.to_string()
    }
}

fn is_or_under(host: &str, domain: &str) -> bool {
    host == domain || host.ends_with(&format!(".{domain}"))
}

/// Levenshtein distance, for spotting "twltch" vs "twitch".
fn edit_distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut cur = vec![i + 1; b.len() + 1];
        for (j, cb) in b.iter().enumerate() {
            cur[j + 1] = (prev[j + 1] + 1).min(cur[j] + 1).min(prev[j] + usize::from(ca != cb));
        }
        prev = cur;
    }
    prev[b.len()]
}

fn pattern_checks(url: &Url, host: &str, danger: &mut Vec<String>, warning: &mut Vec<String>) {
    if host.parse::<IpAddr>().is_ok() || url.host_str().is_some_and(|h| h.starts_with('[')) {
        warning.push("Links straight to an IP address instead of a website name".into());
    }
    if host.split('.').any(|label| label.starts_with("xn--")) {
        warning.push("Uses unusual characters that can imitate normal letters".into());
    }
    if SHORTENERS.iter().any(|s| is_or_under(host, s)) {
        warning.push("Shortened link: it hides where it really goes".into());
    }

    let reg = registrable(host);
    let core = reg.split('.').next().unwrap_or("").to_string();
    for (brand, official) in BRANDS {
        if official.iter().any(|d| is_or_under(host, d)) {
            return; // A real site of this brand.
        }
        let pretty = official[0];
        let core_compact: String = core.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
        // A near-miss spelling ("twltch", "dlscord"). Fakes nearly always keep the first letter,
        // which also keeps real words like "switch" or "glitch" from matching "twitch".
        let max_typos = if brand.len() <= 7 { 1 } else { 2 };
        if core_compact != *brand
            && core_compact.chars().next() == brand.chars().next()
            && core_compact.len().abs_diff(brand.len()) <= max_typos
            && edit_distance(&core_compact, brand) <= max_typos
        {
            danger.push(format!("Looks like {pretty} but isn't"));
            return;
        }
        // Brand name inside some other domain (e.g. "twitch-gift.com", "free-nitro-discord.xyz").
        let whole = host.replace('.', "-");
        if brand.len() >= 5 && whole.contains(brand) {
            if SCAM_WORDS.iter().any(|w| whole.contains(w) || url.path().to_ascii_lowercase().contains(w)) {
                danger.push(format!("Uses \"{brand}\" with giveaway-style wording on a site that isn't {pretty}"));
            } else {
                warning.push(format!("Uses \"{brand}\" in its name but isn't {pretty}"));
            }
            return;
        }
    }
}

fn check_one(lists: &Lists, raw: &str) -> LinkVerdict {
    let mut danger = Vec::new();
    let mut warning = Vec::new();
    match Url::parse(raw) {
        Ok(url) if url.scheme() == "http" || url.scheme() == "https" => {
            if let Some((host, base, with_query)) = url_keys(&url) {
                // Known-bad lists: the host or any parent domain, or the exact page.
                let mut h = host.as_str();
                loop {
                    if lists.domains.contains(&hash(h)) {
                        danger.push("Listed as a phishing site (Phishing.Database)".into());
                        break;
                    }
                    match h.split_once('.') {
                        Some((_, rest)) if rest.contains('.') => h = rest,
                        _ => break,
                    }
                }
                if lists.url_hosts.contains(&hash(&host))
                    || lists.urls.contains(&hash(&base))
                    || with_query.as_deref().is_some_and(|q| lists.urls.contains(&hash(q)))
                {
                    danger.push("Listed as an active phishing link (OpenPhish)".into());
                }
                pattern_checks(&url, &host, &mut danger, &mut warning);
            }
        }
        _ => warning.push("Not a normal web link".into()),
    }
    let level = if !danger.is_empty() { "danger" } else if !warning.is_empty() { "warning" } else { "ok" };
    danger.extend(warning);
    LinkVerdict { url: raw.to_string(), level, reasons: danger }
}

// --- Commands ---------------------------------------------------------------------------------

#[tauri::command]
pub fn check_links(state: State<SafetyState>, urls: Vec<String>) -> Vec<LinkVerdict> {
    let lists = state.lists.read().unwrap();
    urls.iter().map(|u| check_one(&lists, u)).collect()
}

#[tauri::command]
pub fn safety_status(state: State<SafetyState>) -> SafetyStatus {
    let lists = state.lists.read().unwrap();
    SafetyStatus {
        domain_count: lists.domain_count,
        url_count: lists.url_count,
        updated_at: lists.updated_at,
        updating: *state.updating.read().unwrap(),
    }
}

#[tauri::command]
pub async fn safety_update(app: AppHandle) -> Result<(), String> {
    refresh(app, true).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lists_with(domains: &[&str], urls: &[&str]) -> Lists {
        let mut l = Lists::default();
        for d in domains {
            l.domains.insert(hash(d));
        }
        for u in urls {
            let url = Url::parse(u).unwrap();
            let (host, base, q) = url_keys(&url).unwrap();
            if url.path() == "/" && url.query().is_none() {
                l.url_hosts.insert(hash(&host));
            }
            l.urls.insert(hash(&base));
            if let Some(q) = q {
                l.urls.insert(hash(&q));
            }
        }
        l
    }

    fn level(l: &Lists, url: &str) -> &'static str {
        check_one(l, url).level
    }

    #[test]
    fn real_sites_are_ok() {
        let l = Lists::default();
        for url in [
            "https://www.twitch.tv/somestreamer",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://discord.gg/abc",
            "https://steamcommunity.com/id/someone",
            "https://clips.twitch.tv/SomeClip",
            "https://github.com/Phishing-Database/Phishing.Database",
            "https://en.wikipedia.org/wiki/Counter-Strike",
        ] {
            assert_eq!(level(&l, url), "ok", "{url}");
        }
    }

    #[test]
    fn listed_domains_and_urls_are_danger() {
        let l = lists_with(&["evil-login.com"], &["https://phish.weebly.com/", "https://host.example/path/login?x=1"]);
        assert_eq!(level(&l, "https://evil-login.com/a"), "danger");
        assert_eq!(level(&l, "https://sub.evil-login.com/"), "danger");
        assert_eq!(level(&l, "https://phish.weebly.com/anything"), "danger");
        assert_eq!(level(&l, "https://host.example/path/login?x=1"), "danger");
        assert_eq!(level(&l, "https://host.example/path/login/"), "danger");
        assert_eq!(level(&l, "https://host.example/other"), "ok");
    }

    #[test]
    fn look_alikes_are_danger() {
        let l = Lists::default();
        for url in ["https://twltch.tv/gift", "https://steamcommunlty.com/tradeoffer", "https://dlscord.com/nitro", "https://youtube-free-nitro.xyz/"] {
            assert_eq!(level(&l, url), "danger", "{url}");
        }
    }

    #[test]
    fn ordinary_sites_are_not_mistaken_for_brands() {
        let l = Lists::default();
        for url in ["https://glitch.com/", "https://switch.com/", "https://apply.com/", "https://www.nintendo.com/switch/", "https://dictionary.com/"] {
            assert_eq!(level(&l, url), "ok", "{url}");
        }
    }

    #[test]
    fn softer_signals_are_warnings() {
        let l = Lists::default();
        for url in ["https://bit.ly/3abc", "http://203.0.113.9/login", "https://xn--twtch-zua.tv/", "https://twitchtracker.com/somestreamer"] {
            assert_eq!(level(&l, url), "warning", "{url}");
        }
    }
}
