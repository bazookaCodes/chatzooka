//! Link previews for URLs posted in chat: fetches the page and reads its title, description and
//! image (Open Graph / Twitter / plain HTML tags).
//!
//! Chat links come from anyone, so fetching is locked down:
//! - only http/https, only on public internet addresses: loopback, private LAN, link-local,
//!   carrier-grade NAT and similar ranges are refused, so a link can't reach your router or
//!   anything else on your network;
//! - each hop's DNS answer is checked and then pinned for the request, so a hostname can't
//!   resolve to a public address for the check and a private one for the fetch;
//! - redirects are followed by hand (max 5), re-checking every hop;
//! - 6 second timeout per request and at most 1 MB of HTML is read.

use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

use reqwest::{redirect::Policy, Client, Url};
use scraper::{Html, Selector};
use serde::Serialize;

const MAX_REDIRECTS: usize = 5;
const MAX_BYTES: usize = 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(6);
const USER_AGENT: &str = "Mozilla/5.0 (compatible; Chatzooka-LinkPreview/0.1; like facebookexternalhit)";

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LinkPreview {
    /// Final URL after redirects.
    url: String,
    site_name: Option<String>,
    title: Option<String>,
    description: Option<String>,
    image: Option<String>,
    /// Set when the link points straight at an image instead of a page.
    is_image: bool,
}

fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            !(v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.is_multicast()
                || v4.is_documentation()
                || o[0] == 0
                // 100.64.0.0/10 carrier-grade NAT
                || (o[0] == 100 && (o[1] & 0xC0) == 64)
                // 198.18.0.0/15 benchmarking
                || (o[0] == 198 && (o[1] & 0xFE) == 18)
                // 240.0.0.0/4 reserved
                || o[0] >= 240)
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public(IpAddr::V4(v4));
            }
            let s = v6.segments();
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                // fc00::/7 unique local
                || (s[0] & 0xFE00) == 0xFC00
                // fe80::/10 link-local
                || (s[0] & 0xFFC0) == 0xFE80)
        }
    }
}

/// Resolve the URL's host and return a public address to pin, or an error.
async fn checked_address(url: &Url) -> Result<SocketAddr, String> {
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("Only web links can be previewed".into());
    }
    let host = url.host_str().ok_or("Link has no host")?;
    let port = url.port_or_known_default().ok_or("Link has no port")?;
    let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host.trim_start_matches('[').trim_end_matches(']'), port))
        .await
        .map_err(|_| "Couldn't find that website".to_string())?
        .collect();
    if addrs.is_empty() {
        return Err("Couldn't find that website".into());
    }
    // Refuse if any answer is non-public, so mixed answers can't sneak a private address in.
    if addrs.iter().any(|a| !is_public(a.ip())) {
        return Err("Previews are disabled for local network addresses".into());
    }
    Ok(addrs[0])
}

fn client_for(url: &Url, addr: SocketAddr) -> Result<Client, String> {
    let mut builder = Client::builder()
        .redirect(Policy::none())
        .timeout(TIMEOUT)
        .user_agent(USER_AGENT);
    if let Some(domain) = url.domain() {
        builder = builder.resolve(domain, addr);
    }
    builder.build().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn link_preview(url: String) -> Result<LinkPreview, String> {
    let mut current = Url::parse(&url).map_err(|_| "Not a valid link".to_string())?;

    for _ in 0..=MAX_REDIRECTS {
        let addr = checked_address(&current).await?;
        let client = client_for(&current, addr)?;
        let mut res = client
            .get(current.clone())
            .header("Accept", "text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5")
            .header("Accept-Language", "en-US,en;q=0.8")
            .send()
            .await
            .map_err(|e| if e.is_timeout() { "The website took too long".to_string() } else { "Couldn't reach the website".to_string() })?;

        if res.status().is_redirection() {
            let location = res
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or("Broken redirect")?;
            current = current.join(location).map_err(|_| "Broken redirect".to_string())?;
            continue;
        }
        if !res.status().is_success() {
            return Err(format!("The website answered {}", res.status().as_u16()));
        }

        let content_type = res
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_ascii_lowercase();
        if content_type.starts_with("image/") {
            return Ok(LinkPreview { url: current.to_string(), image: Some(current.to_string()), is_image: true, ..Default::default() });
        }
        if !content_type.contains("html") {
            return Ok(LinkPreview { url: current.to_string(), title: current.host_str().map(String::from), ..Default::default() });
        }

        // Read at most MAX_BYTES; the tags we want are in <head>.
        let mut body: Vec<u8> = Vec::new();
        while let Some(chunk) = res.chunk().await.map_err(|_| "Couldn't read the page".to_string())? {
            let room = MAX_BYTES - body.len();
            body.extend_from_slice(&chunk[..chunk.len().min(room)]);
            if body.len() >= MAX_BYTES {
                break;
            }
        }
        let html = String::from_utf8_lossy(&body);
        return Ok(parse(&html, &current));
    }
    Err("Too many redirects".into())
}

fn parse(html: &str, base: &Url) -> LinkPreview {
    let doc = Html::parse_document(html);
    let meta = |names: &[&str]| -> Option<String> {
        for name in names {
            let selector = Selector::parse(&format!(r#"meta[property="{name}"], meta[name="{name}"]"#)).ok()?;
            if let Some(content) = doc.select(&selector).find_map(|el| el.value().attr("content")) {
                let text = content.trim();
                if !text.is_empty() {
                    return Some(text.to_string());
                }
            }
        }
        None
    };
    let title_tag = Selector::parse("title")
        .ok()
        .and_then(|s| doc.select(&s).next().map(|el| el.text().collect::<String>().trim().to_string()))
        .filter(|t| !t.is_empty());

    let image = meta(&["og:image", "og:image:url", "twitter:image", "twitter:image:src"])
        .and_then(|src| base.join(&src).ok())
        .filter(|u| u.scheme() == "https" || u.scheme() == "http")
        .map(|u| u.to_string());

    LinkPreview {
        url: base.to_string(),
        site_name: meta(&["og:site_name", "application-name"]),
        title: meta(&["og:title", "twitter:title"]).or(title_tag).map(|t| truncate(&t, 200)),
        description: meta(&["og:description", "twitter:description", "description"]).map(|d| truncate(&d, 300)),
        image,
        is_image: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_non_public_addresses() {
        for ip in [
            "127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.1", "169.254.169.254", "100.64.1.1", "0.0.0.0",
            "::1", "fd12::1", "fe80::1", "::ffff:192.168.1.1",
        ] {
            assert!(!is_public(ip.parse().unwrap()), "{ip} should be refused");
        }
        for ip in ["1.1.1.1", "142.250.80.46", "2606:4700:4700::1111"] {
            assert!(is_public(ip.parse().unwrap()), "{ip} should be allowed");
        }
    }

    #[tokio::test]
    async fn refuses_localhost_and_other_schemes() {
        for url in ["http://localhost:8080/", "http://127.0.0.1/", "file:///C:/Windows/win.ini", "ftp://example.com/"] {
            let u = Url::parse(url).unwrap();
            assert!(checked_address(&u).await.is_err(), "{url} should be refused");
        }
    }

    #[test]
    fn reads_open_graph_tags() {
        let html = r#"<html><head>
            <title>Fallback title</title>
            <meta property="og:site_name" content="Example">
            <meta property="og:title" content="The Real Title">
            <meta name="description" content="A description.">
            <meta property="og:image" content="/img/cover.png">
        </head></html>"#;
        let p = parse(html, &Url::parse("https://example.com/post/1").unwrap());
        assert_eq!(p.site_name.as_deref(), Some("Example"));
        assert_eq!(p.title.as_deref(), Some("The Real Title"));
        assert_eq!(p.description.as_deref(), Some("A description."));
        assert_eq!(p.image.as_deref(), Some("https://example.com/img/cover.png"));
    }

    #[test]
    fn falls_back_to_title_tag() {
        let p = parse("<title> Just a title </title>", &Url::parse("https://example.com/").unwrap());
        assert_eq!(p.title.as_deref(), Some("Just a title"));
        assert!(p.image.is_none());
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        format!("{}…", s.chars().take(max).collect::<String>().trim_end())
    }
}
