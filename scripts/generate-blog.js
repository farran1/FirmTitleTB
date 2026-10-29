#!/usr/bin/env node
/**
 * Builds the static blog (/blog, /blog/<slug>, /blog/feed.xml) from a Google Sheet
 * and refreshes the blog entries in sitemap.xml.
 *
 * Access: only people the sheet is shared with as Editors can create, edit, publish
 * or delete posts. In production the sheet stays private and this script reads it
 * with a read-only Google service account (GOOGLE_SERVICE_ACCOUNT_JSON); setup steps
 * are in scripts/README.md. Without that secret it falls back to the sheet's public
 * "Anyone with the link can view" link, which exposes drafts to anyone with the link.
 *
 * Row 1 holds the headers; columns are matched by header name (case-insensitive), so they can be
 * in any order. Sheets that only have the original five columns (A–E) still work.
 *
 *   Title       required  Post headline
 *   Slug        required  URL path, e.g. "closing-costs-explained" -> /blog/closing-costs-explained
 *   Content     required  Post body. Blank line = new paragraph. Supports **bold**,
 *                         [link text](https://...), bare https:// links, "## Heading",
 *                         and lines starting with "- " for bullet lists.
 *   Date        required  Publish date. Posts dated in the future stay hidden until
 *                         that day (America/New_York), so posts can be scheduled.
 *   Published   required  TRUE / checkbox ticked to publish.
 *   Excerpt     optional  Summary for cards, search results and social shares.
 *   Image       optional  https:// image URL (Google Drive share links work).
 *   Category    optional  e.g. "Closings", "Development Update". Adds filter chips.
 *   Author      optional  Defaults to "Firm Title TB".
 *
 * Environment:
 *   GOOGLE_SHEET_ID     Sheet ID (from the sheet URL). Required unless BLOG_SOURCE_FILE is set.
 *   GOOGLE_SHEET_NAME   Tab name. Default "Sheet1".
 *   GOOGLE_SERVICE_ACCOUNT_JSON  Service-account key (the whole JSON file). When set,
 *                       the sheet is read privately through the Sheets API.
 *   BLOG_SOURCE_FILE    Read rows from a local JSON file (array of objects keyed by
 *                       header name) instead of the sheet. For local previews/tests.
 *   BLOG_ALLOW_SHRINK   Set to 1 to allow a run that would remove more than half of
 *                       the live posts (guards against a broken or emptied sheet).
 *   BLOG_TODAY          Override "today" (YYYY-MM-DD) for scheduling. For tests.
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SITE_URL = 'https://firmtitletb.com';
const SITE_NAME = 'Firm Title TB';
const DEFAULT_AUTHOR = 'Firm Title TB';
const LOGO_URL = `${SITE_URL}/Firm%20Title%20logo%20-%20blue.jpg`;
const PHONE_DISPLAY = '(813) 812-4949';
const PHONE_TEL = '+18138124949';
const TIME_ZONE = 'America/New_York';
const FEED_SIZE = 20;

const ROOT_DIR = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT_DIR, 'blog');
const SITEMAP_PATH = path.join(ROOT_DIR, 'sitemap.xml');
const CSS_SOURCE = path.join(__dirname, 'blog.css');

// Slugs that would collide with files the generator writes into /blog.
const RESERVED_SLUGS = new Set(['feed', 'feed.xml', 'blog.css', 'index', 'page', 'category', 'tag']);

const COLUMN_ALIASES = {
  title: ['title', 'headline', 'post title'],
  slug: ['slug', 'url', 'path', 'permalink'],
  content: ['content', 'body', 'post', 'text', 'post content'],
  date: ['date', 'publish date', 'published date', 'post date'],
  published: ['published', 'publish', 'status', 'live'],
  excerpt: ['excerpt', 'summary', 'description', 'meta description'],
  image: ['image', 'image url', 'cover', 'cover image', 'photo', 'featured image'],
  category: ['category', 'categories', 'type', 'topic'],
  author: ['author', 'by', 'written by'],
};
// Column order of the original five-column sheet, used when headers aren't recognised.
const LEGACY_ORDER = ['title', 'slug', 'content', 'date', 'published'];

const warnings = [];
function warn(msg) {
  warnings.push(msg);
  // Surfaces as an annotation on the GitHub Actions run summary.
  console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `WARNING: ${msg}`);
}

/* ------------------------------------------------------------------ fetching */

function request(url, { method = 'GET', headers = {}, body, timeoutMs = 20000, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers: { 'User-Agent': 'FirmTitleTB-blog-generator', ...headers } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('Too many redirects'));
        const next = new URL(res.headers.location, url).toString();
        return resolve(request(next, { headers, timeoutMs, redirects: redirects - 1 }));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) return resolve(data);
        const err = new Error(`HTTP ${res.statusCode} from ${new URL(url).host}`);
        err.status = res.statusCode;
        err.body = data;
        reject(err);
      });
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function withRetry(fn, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Permission and not-found errors won't fix themselves; fail fast.
      if (err.status && err.status < 500 && err.status !== 429) throw err;
      if (i < attempts - 1) {
        const delay = 2000 * 2 ** i;
        console.log(`Request failed (${err.message}); retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

const base64url = (input) => Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Exchanges a service-account key for a short-lived, read-only Sheets access token. */
async function getServiceAccountToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 600,
  }));
  const signature = base64url(crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(credentials.private_key));
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${header}.${claims}.${signature}`,
  }).toString();
  const res = await withRetry(() => request('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    body,
  }));
  return JSON.parse(res).access_token;
}

/** Reads a private sheet with a service account that has Viewer access to it. */
async function fetchPrivateSheet(sheetId, sheetName, credentialsJson) {
  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON — paste the whole key file into the secret');
  }
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
  }
  const token = await getServiceAccountToken(credentials);
  const range = encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}` +
    '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';
  let raw;
  try {
    raw = await withRetry(() => request(url, { headers: { Authorization: `Bearer ${token}` } }));
  } catch (err) {
    if (err.status === 403 || err.status === 404) {
      throw new Error(`The service account can't read the sheet. In Google Sheets, click Share and add ${credentials.client_email} as a Viewer.`);
    }
    throw err;
  }
  return valuesToRows(JSON.parse(raw).values || []);
}

/** Converts a Sheets API values grid (first row = headers) into { header: value } row objects. */
function valuesToRows(values) {
  const [headerRow = [], ...dataRows] = values;
  const labels = headerRow.map((h, i) => String(h).trim() || `__col${i}`);
  return dataRows.map((cells) => {
    const obj = { __order: labels };
    labels.forEach((label, i) => { obj[label] = cells[i] === undefined ? null : cells[i]; });
    return obj;
  });
}

/** Parses the gviz JSON response into an array of { header: value } row objects. */
function parseGvizResponse(raw) {
  const match = raw.match(/setResponse\(([\s\S]+)\);?\s*$/);
  if (!match) {
    if (/<html/i.test(raw)) {
      throw new Error('Google returned an HTML page instead of data. Is the sheet shared as "Anyone with the link can view"?');
    }
    throw new Error('Could not parse Google Sheets response');
  }
  const json = JSON.parse(match[1]);
  if (json.status === 'error') {
    const detail = (json.errors || []).map((e) => e.detailed_message || e.message).join('; ');
    throw new Error(`Google Sheets error: ${detail || 'unknown'}`);
  }
  const labels = json.table.cols.map((c) => (c.label || '').trim());
  return json.table.rows.map((row) => {
    const obj = {};
    (row.c || []).forEach((cell, i) => {
      const key = labels[i] || `__col${i}`;
      obj[key] = cell ? cell : null; // keep {v, f} so dates can use the raw value
    });
    obj.__order = labels.map((l, i) => l || `__col${i}`);
    return obj;
  });
}

/* ------------------------------------------------------------------ rows -> posts */

function resolveColumns(keys) {
  const norm = (k) => String(k).toLowerCase().replace(/[_\s]+/g, ' ').trim();
  const map = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const hit = keys.find((k) => aliases.includes(norm(k)));
    if (hit) map[field] = hit;
  }
  if (!map.title || !map.slug || !map.content) {
    // Fall back to the original A–E layout.
    LEGACY_ORDER.forEach((field, i) => {
      if (keys[i] !== undefined) map[field] = keys[i];
    });
  }
  return map;
}

function cellValue(cell) {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object' && 'v' in cell) return cell.v === null ? '' : cell.v;
  return cell;
}

function cellText(cell) {
  if (cell && typeof cell === 'object' && 'v' in cell) {
    // Prefer the displayed text for non-dates so number formatting is preserved.
    return String(cell.f !== undefined && cell.f !== null ? cell.f : cell.v ?? '');
  }
  return cell === null || cell === undefined ? '' : String(cell);
}

function isTruthy(value) {
  if (value === true) return true;
  return ['true', 'yes', 'y', '1', 'x', 'published', 'live'].includes(String(value).trim().toLowerCase());
}

/** Returns YYYY-MM-DD or null. Accepts gviz Date(...) values, ISO dates and US M/D/YYYY. */
function parseDate(cell) {
  const candidates = [];
  if (cell && typeof cell === 'object' && 'v' in cell) candidates.push(cell.v, cell.f);
  else candidates.push(cell);
  for (const c of candidates) {
    if (c === null || c === undefined || c === '') continue;
    const s = String(c).trim();
    let m = s.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})/);
    if (m) return ymd(+m[1], +m[2] + 1, +m[3]);
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return ymd(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return ymd(+m[3], +m[1], +m[2]);
  }
  return null;
}

function ymd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function todayInTimeZone() {
  if (process.env.BLOG_TODAY) return process.env.BLOG_TODAY;
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

function normalizeSlug(raw) {
  const cleaned = String(raw)
    .trim()
    .replace(/^\/?(blog\/)?/i, '')
    .replace(/\/+$/, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^A-Za-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned;
}

function normalizeImageUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return '';
  if (!/^https:\/\//i.test(url)) {
    warn(`Ignoring image "${url}" — image URLs must start with https://`);
    return '';
  }
  // Google Drive share links -> direct image URL.
  const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/);
  if (drive) return `https://lh3.googleusercontent.com/d/${drive[1]}`;
  return url;
}

function rowsToPosts(rows, today = todayInTimeZone()) {
  if (rows.length === 0) return [];
  const keys = rows[0].__order || Object.keys(rows[0]);
  const col = resolveColumns(keys);
  const get = (row, field) => (col[field] ? row[col[field]] : null);

  const bySlug = new Map();
  rows.forEach((row, i) => {
    const rowNum = i + 2; // +1 for header, +1 for 1-based rows
    const title = String(cellValue(get(row, 'title'))).trim();
    const rawSlug = cellValue(get(row, 'slug'));
    const content = String(cellValue(get(row, 'content')) || '').replace(/\r\n?/g, '\n').trim();
    if (!title && !rawSlug && !content) return; // blank row
    if (!isTruthy(cellValue(get(row, 'published')))) return;

    const label = `Row ${rowNum} ("${title || rawSlug}")`;
    if (!title) return warn(`${label} is published but has no Title — skipped`);
    if (!content) return warn(`${label} is published but has no Content — skipped`);

    const slug = normalizeSlug(rawSlug || title);
    if (!slug) return warn(`${label} has an unusable Slug — skipped`);
    if (rawSlug && slug !== String(rawSlug).trim()) {
      warn(`${label}: slug "${rawSlug}" was cleaned up to "${slug}"`);
    }
    if (RESERVED_SLUGS.has(slug.toLowerCase())) return warn(`${label}: slug "${slug}" is reserved — skipped`);

    const date = parseDate(get(row, 'date'));
    if (!date) return warn(`${label} has a missing or unreadable Date — skipped (use YYYY-MM-DD)`);
    if (date > today) {
      console.log(`Scheduled: /blog/${slug} goes live on ${date}`);
      return;
    }

    const post = {
      title,
      slug,
      content,
      date,
      excerpt: String(cellText(get(row, 'excerpt'))).trim(),
      image: normalizeImageUrl(cellText(get(row, 'image'))),
      category: String(cellText(get(row, 'category'))).trim(),
      author: String(cellText(get(row, 'author'))).trim() || DEFAULT_AUTHOR,
    };

    const key = slug.toLowerCase();
    if (bySlug.has(key)) {
      const prev = bySlug.get(key);
      warn(`Duplicate slug "${slug}" (${label}) — keeping the newer post`);
      if (prev.date > post.date) return;
    }
    if (title.length > 70) warn(`${label}: title is ${title.length} characters; Google shows about 60`);
    bySlug.set(key, post);
  });

  return [...bySlug.values()].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

/* ------------------------------------------------------------------ text helpers */

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(text) {
  return escapeHtml(text).replace(/&#39;/g, '&apos;');
}

/** JSON for embedding inside <script type="application/ld+json">. */
function jsonLd(data) {
  return JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
}

function plainText(content) {
  return String(content)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:!-]+$/, '')}…`;
}

function postSummary(post, max = 160) {
  return truncate(post.excerpt ? plainText(post.excerpt) : plainText(post.content), max);
}

function readingMinutes(content) {
  const words = plainText(content).split(' ').filter(Boolean).length;
  return Math.max(1, Math.round(words / 225));
}

function displayDate(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

function rfc822(date) {
  return new Date(`${date}T12:00:00Z`).toUTCString();
}

/** Inline formatting: links, bare URLs and **bold**. Everything else is escaped. */
function renderInline(text) {
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)'])|\*\*([^*\n]+)\*\*/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = pattern.exec(text))) {
    out += escapeHtml(text.slice(last, m.index));
    if (m[1] !== undefined) out += link(m[2], escapeHtml(m[1]));
    else if (m[3] !== undefined) out += link(m[3], escapeHtml(m[3].replace(/^https?:\/\/(www\.)?/, '')));
    else out += `<strong>${escapeHtml(m[4])}</strong>`;
    last = pattern.lastIndex;
  }
  return out + escapeHtml(text.slice(last));
}

function link(href, label) {
  const internal = href.startsWith(SITE_URL);
  const attrs = internal ? '' : ' target="_blank" rel="noopener noreferrer"';
  return `<a href="${escapeHtml(href)}"${attrs}>${label}</a>`;
}

function contentToHtml(content) {
  return String(content)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const heading = block.match(/^(#{2,3})\s+(.+)$/);
      if (heading && !block.includes('\n')) {
        const level = heading[1].length;
        return `<h${level}>${renderInline(heading[2])}</h${level}>`;
      }
      const lines = block.split('\n');
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return `<ul>\n${lines.map((l) => `  <li>${renderInline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('\n')}\n</ul>`;
      }
      return `<p>${lines.map(renderInline).join('<br>\n')}</p>`;
    })
    .join('\n');
}

/* ------------------------------------------------------------------ templates */

// Mirrors the site's React Navbar/Footer (src/components/Navbar.tsx on main) so the
// blog is indistinguishable from the rest of firmtitletb.com.
const NAV_LINKS = [
  ['/', 'Home'],
  ['/videos', 'Videos'],
  ['/homestead', 'Homestead'],
  ['/contact', 'Contact'],
  ['/calculators', 'Calculators'],
  ['/blog', 'Blog'],
];

const ICON_ATTRS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const SOCIAL_LINKS = [
  ['https://www.facebook.com/firmtitletampabay/', 'Facebook', `<svg ${ICON_ATTRS}><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`],
  ['https://www.instagram.com/firmtitletb/', 'Instagram', `<svg ${ICON_ATTRS}><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>`],
  ['https://www.youtube.com/@FirmTitleTB', 'YouTube', `<svg ${ICON_ATTRS}><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>`],
  ['https://www.tiktok.com/@firmtitletb', 'TikTok', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>'],
  ['https://www.linkedin.com/in/scott-farrell-0778266/', 'LinkedIn', `<svg ${ICON_ATTRS}><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>`],
];
const MENU_ICON = `<svg ${ICON_ATTRS}><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`;
const CLOSE_ICON = `<svg ${ICON_ATTRS}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
const ARROW_LEFT = `<svg ${ICON_ATTRS}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`;

function navLinks(cls) {
  return NAV_LINKS.map(([href, label]) =>
    `<a class="${cls}" href="${href}"${href === '/blog' ? ' aria-current="page"' : ''}>${label}</a>`).join('');
}

function layout({ title, description, canonical, ogType, image, headExtra = '', body, cssHref }) {
  const ogImage = image || LOGO_URL;
  const card = image ? 'summary_large_image' : 'summary';
  const social = SOCIAL_LINKS.map(([href, label, svg]) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer" aria-label="${label}">${svg}</a>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="author" content="Firm Title TB, LLC" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" type="application/rss+xml" title="Firm Title TB Blog" href="${SITE_URL}/blog/feed.xml" />

    <!-- Open Graph -->
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="${card}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
${headExtra}
    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700;900&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${cssHref}" />

    <!-- Favicon -->
    <link rel="icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/Firm%20Title%20logo%20-%20blue.jpg" />
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="nav-bar">
        <div class="nav-mobile">
          <button type="button" class="menu-button" aria-label="Open menu" aria-expanded="false" aria-controls="drawer">${MENU_ICON}</button>
          <a class="nav-brand" href="/">Firm Title TB</a>
        </div>
        <nav class="nav-desktop" aria-label="Main">${navLinks('nav-link')}</nav>
        <div class="nav-social">${social}</div>
      </div>
    </header>
    <div class="drawer-overlay" hidden></div>
    <nav class="drawer" id="drawer" aria-label="Menu" hidden>
      <button type="button" class="drawer-close" aria-label="Close menu">${CLOSE_ICON}</button>
      ${navLinks('drawer-link')}
    </nav>

${body}

    <footer class="site-footer">
      <p>&copy; ${new Date().getFullYear()} FirmTitleTB. All rights reserved.</p>
      <div class="footer-links">
        <a href="/privacy">Privacy Policy</a><span aria-hidden="true">|</span><a href="/sms-opt-in">SMS Opt-In</a><span aria-hidden="true">|</span><a href="/blog/feed.xml">RSS</a>
      </div>
    </footer>
    <script>
      (function () {
        var btn = document.querySelector('.menu-button');
        var drawer = document.getElementById('drawer');
        var overlay = document.querySelector('.drawer-overlay');
        function set(open) {
          drawer.hidden = overlay.hidden = !open;
          btn.setAttribute('aria-expanded', String(open));
          document.body.style.overflow = open ? 'hidden' : '';
          (open ? drawer.querySelector('a') : btn).focus();
        }
        btn.addEventListener('click', function () { set(true); });
        overlay.addEventListener('click', function () { set(false); });
        drawer.querySelector('.drawer-close').addEventListener('click', function () { set(false); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !drawer.hidden) set(false); });
      })();
    </script>
  </body>
</html>
`.replace(/^[ \t]+\n/gm, ''); // drop lines left blank by optional fragments
}

function postMeta(post, { author = false } = {}) {
  return `${author ? `${escapeHtml(post.author)} &middot; ` : ''}<time datetime="${post.date}">${displayDate(post.date)}</time> &middot; ${readingMinutes(post.content)} min read`;
}

function featuredCard(post) {
  return `        <article class="card card-featured${post.image ? ' has-media' : ''}" data-category="${escapeHtml(post.category.toLowerCase())}" data-search="${searchText(post)}">
          ${post.image ? `<div class="card-media"><img src="${escapeHtml(post.image)}" alt="" decoding="async" /></div>` : ''}
          <div class="card-body">
            <p class="eyebrow">Latest${post.category ? ` &middot; ${escapeHtml(post.category)}` : ''}</p>
            <h2 class="card-title"><a href="/blog/${post.slug}">${escapeHtml(post.title)}</a></h2>
            <p class="meta">${postMeta(post)}</p>
            <p class="card-excerpt">${escapeHtml(postSummary(post, 300))}</p>
            <span class="read-more" aria-hidden="true">Read article &rarr;</span>
          </div>
        </article>`;
}

function postCard(post) {
  return `        <article class="card${post.image ? ' has-media' : ''}" data-category="${escapeHtml(post.category.toLowerCase())}" data-search="${searchText(post)}">
          ${post.image ? `<div class="card-media"><img src="${escapeHtml(post.image)}" alt="" loading="lazy" decoding="async" /></div>` : ''}
          <div class="card-body">
            ${post.category ? `<p class="eyebrow">${escapeHtml(post.category)}</p>` : ''}
            <h2 class="card-title"><a href="/blog/${post.slug}">${escapeHtml(post.title)}</a></h2>
            <p class="meta">${postMeta(post)}</p>
            <p class="card-excerpt">${escapeHtml(postSummary(post, 180))}</p>
            <span class="read-more" aria-hidden="true">Read more &rarr;</span>
          </div>
        </article>`;
}

function searchText(post) {
  return escapeHtml(`${post.title} ${post.category} ${plainText(post.content)}`.toLowerCase().slice(0, 2000));
}

function ctaBlock(question = 'Have questions about your closing? We’re here to help.') {
  return `<div class="cta">
          <p>${question}</p>
          <div class="cta-actions">
            <a class="btn-primary" href="/contact">Contact Firm Title TB</a>
            <a class="btn-outline" href="tel:${PHONE_TEL}">Call ${PHONE_DISPLAY}</a>
          </div>
        </div>`;
}

function generateBlogListHtml(posts, cssHref) {
  const categories = [...new Set(posts.map((p) => p.category).filter(Boolean))].sort();
  const filters = categories.length > 1 ? `
          <div class="filters" role="group" aria-label="Filter posts by category">
            <button type="button" class="chip" data-filter="" aria-pressed="true">All</button>
            ${categories.map((c) => `<button type="button" class="chip" data-filter="${escapeHtml(c.toLowerCase())}" aria-pressed="false">${escapeHtml(c)}</button>`).join('\n            ')}
          </div>` : '';

  const [latest, ...rest] = posts;
  const body = `    <main id="main" class="page">
      <div class="container container-wide">
        <header class="page-header">
          <h1>Blog</h1>
          <p class="page-subtitle">Closings, title insurance, and Tampa Bay real estate news from Firm Title TB.</p>
        </header>

        <div class="toolbar" hidden>
          <label class="search">
            <svg ${ICON_ATTRS}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <span class="visually-hidden">Search posts</span>
            <input type="search" placeholder="Search posts" autocomplete="off" />
          </label>${filters}
        </div>
        <p class="empty" hidden>No posts match your search.</p>

${latest ? featuredCard(latest) : '        <p class="empty">No posts yet. Check back soon!</p>'}
${rest.length ? `        <div class="card-grid">
${rest.map(postCard).join('\n')}
        </div>` : ''}

        ${ctaBlock()}
      </div>
    </main>
    <script>
      (function () {
        var cards = [].slice.call(document.querySelectorAll('.card'));
        var toolbar = document.querySelector('.toolbar');
        if (cards.length < 4) return;
        toolbar.hidden = false;
        var input = toolbar.querySelector('input');
        var filters = toolbar.querySelector('.filters');
        var empty = document.querySelector('.page .empty');
        var category = '';
        function apply() {
          var q = input.value.trim().toLowerCase();
          var shown = 0;
          cards.forEach(function (card) {
            var ok = (!category || card.getAttribute('data-category') === category) &&
                     (!q || card.getAttribute('data-search').indexOf(q) !== -1);
            card.hidden = !ok;
            if (ok) shown++;
          });
          empty.hidden = shown !== 0;
        }
        input.addEventListener('input', apply);
        if (filters) filters.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-filter]');
          if (!btn) return;
          category = btn.getAttribute('data-filter');
          [].forEach.call(filters.querySelectorAll('[data-filter]'), function (b) {
            b.setAttribute('aria-pressed', String(b === btn));
          });
          apply();
        });
      })();
    </script>`;

  const headExtra = `
    <!-- Structured Data: Blog -->
    <script type="application/ld+json">
${jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Firm Title TB Blog',
    url: `${SITE_URL}/blog`,
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: { '@type': 'ImageObject', url: LOGO_URL } },
    blogPost: posts.slice(0, 20).map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${SITE_URL}/blog/${p.slug}`,
      datePublished: p.date,
    })),
  })}
    </script>
`;

  return layout({
    title: 'Blog | Firm Title TB — Title Company in Tampa, FL',
    description: 'Read the latest from Firm Title TB in Tampa, FL. Tips on closings, title insurance, RON, 1031 exchanges, and real estate in Tampa Bay.',
    canonical: `${SITE_URL}/blog`,
    ogType: 'website',
    headExtra,
    body,
    cssHref,
  });
}

function shareLinks(post) {
  const url = encodeURIComponent(`${SITE_URL}/blog/${post.slug}`);
  const text = encodeURIComponent(post.title);
  return `<div class="share">
          <span class="share-label">Share this post</span>
          <div class="share-buttons">
            <a href="https://www.facebook.com/sharer/sharer.php?u=${url}" target="_blank" rel="noopener noreferrer">Facebook</a>
            <a href="https://www.linkedin.com/sharing/share-offsite/?url=${url}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <a href="https://twitter.com/intent/tweet?url=${url}&amp;text=${text}" target="_blank" rel="noopener noreferrer">X</a>
            <a href="mailto:?subject=${text}&amp;body=${url}">Email</a>
          </div>
        </div>`;
}

function generatePostHtml(post, posts, cssHref) {
  const index = posts.indexOf(post);
  const newer = posts[index - 1];
  const older = posts[index + 1];
  const sameCategory = (p) => Boolean(post.category) && p.category === post.category;
  const related = posts
    .filter((p) => p !== post && p !== newer && p !== older)
    .sort((a, b) => Number(sameCategory(b)) - Number(sameCategory(a)))
    .slice(0, 3);
  const url = `${SITE_URL}/blog/${post.slug}`;
  const description = postSummary(post, 160);

  const pager = (newer || older) ? `
        <nav class="pager" aria-label="Previous and next posts">
          ${older ? `<a class="pager-link" href="/blog/${older.slug}"><span>&larr; Previous post</span>${escapeHtml(older.title)}</a>` : '<span></span>'}
          ${newer ? `<a class="pager-link pager-next" href="/blog/${newer.slug}"><span>Next post &rarr;</span>${escapeHtml(newer.title)}</a>` : '<span></span>'}
        </nav>` : '';

  const relatedHtml = related.length ? `
        <section class="related" aria-labelledby="related-heading">
          <h2 id="related-heading">More From the Blog</h2>
          ${related.map((p) => `<a class="row-link" href="/blog/${p.slug}">
            <span class="row-text"><span class="row-title">${escapeHtml(p.title)}</span><span class="row-meta">${displayDate(p.date)}</span></span>
            <span class="row-action" aria-hidden="true">Read &rarr;</span>
          </a>`).join('\n          ')}
        </section>` : '';

  const body = `    <main id="main" class="page">
      <div class="container">
        <a class="back-link" href="/blog">${ARROW_LEFT}Back to Blog</a>
        <article>
          <header class="page-header">
            ${post.category ? `<p class="eyebrow">${escapeHtml(post.category)}</p>` : ''}
            <h1>${escapeHtml(post.title)}</h1>
            <p class="page-subtitle">${postMeta(post, { author: true })}</p>
          </header>
          <div class="post-card">
            ${post.image ? `<figure class="post-image"><img src="${escapeHtml(post.image)}" alt="" decoding="async" /></figure>` : ''}
            <div class="prose">
${contentToHtml(post.content)}
            </div>
          </div>
        </article>
        ${shareLinks(post)}
${pager}
${relatedHtml}

        ${ctaBlock()}
      </div>
    </main>`;

  const headExtra = `    <meta property="article:published_time" content="${post.date}" />
    <meta property="article:author" content="${escapeHtml(post.author)}" />${post.category ? `
    <meta property="article:section" content="${escapeHtml(post.category)}" />` : ''}

    <!-- Structured Data: BlogPosting -->
    <script type="application/ld+json">
${jsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: post.title,
        description,
        datePublished: post.date,
        dateModified: post.date,
        image: post.image || LOGO_URL,
        wordCount: plainText(post.content).split(' ').length,
        ...(post.category ? { articleSection: post.category } : {}),
        author: post.author === DEFAULT_AUTHOR
          ? { '@type': 'Organization', name: SITE_NAME, url: SITE_URL }
          : { '@type': 'Person', name: post.author },
        publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: { '@type': 'ImageObject', url: LOGO_URL } },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: url },
        ],
      },
    ],
  })}
    </script>
`;

  return layout({
    title: `${post.title} | Firm Title TB Blog`,
    description,
    canonical: url,
    ogType: 'article',
    image: post.image,
    headExtra,
    body,
    cssHref,
  });
}

function generateFeed(posts) {
  const items = posts.slice(0, FEED_SIZE).map((p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${SITE_URL}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>${p.category ? `
      <category>${escapeXml(p.category)}</category>` : ''}
      <description>${escapeXml(postSummary(p, 300))}</description>
      <content:encoded><![CDATA[${contentToHtml(p.content).replace(/]]>/g, ']]]]><![CDATA[>')}]]></content:encoded>
    </item>`).join('\n');
  const updated = posts.length ? rfc822(posts[0].date) : rfc822('2026-01-01');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Firm Title TB Blog</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/rss+xml" />
    <description>Closings, title insurance, and Tampa Bay real estate news from Firm Title TB.</description>
    <language>en-us</language>
    <lastBuildDate>${updated}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

/* ------------------------------------------------------------------ sitemap */

function updateSitemapXml(sitemap, posts) {
  // Remove existing blog entries, then append fresh ones. lastmod comes from post
  // dates (not "today") so runs with no new content leave the file untouched.
  let out = sitemap.replace(/\s*<url>\s*<loc>https:\/\/firmtitletb\.com\/blog[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
  const newest = posts.length ? posts[0].date : null;
  const entries = [`
  <url>
    <loc>${SITE_URL}/blog</loc>${newest ? `
    <lastmod>${newest}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`].concat(posts.map((p) => `
  <url>
    <loc>${SITE_URL}/blog/${p.slug}</loc>
    <lastmod>${p.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`));
  return out.replace(/\s*<\/urlset>\s*$/, `${entries.join('')}\n</urlset>\n`);
}

/* ------------------------------------------------------------------ build */

function countExistingPosts() {
  if (!fs.existsSync(BLOG_DIR)) return 0;
  return fs.readdirSync(BLOG_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(BLOG_DIR, d.name, 'index.html'))).length;
}

function buildSite(posts) {
  const css = fs.readFileSync(CSS_SOURCE, 'utf8');
  const cssHref = `/blog/blog.css?v=${crypto.createHash('sha256').update(css).digest('hex').slice(0, 10)}`;

  // Build into a temp directory and swap it in, so a crash never leaves a half-written blog.
  const tmpDir = path.join(ROOT_DIR, `.blog-build-${process.pid}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    fs.writeFileSync(path.join(tmpDir, 'blog.css'), css, 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'index.html'), generateBlogListHtml(posts, cssHref), 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'feed.xml'), generateFeed(posts), 'utf8');
    for (const post of posts) {
      const dir = path.join(tmpDir, post.slug);
      // normalizeSlug only allows [A-Za-z0-9-], but never write outside the build dir.
      if (path.dirname(dir) !== tmpDir) throw new Error(`Refusing unsafe slug ${post.slug}`);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'index.html'), generatePostHtml(post, posts, cssHref), 'utf8');
    }

    const oldDir = `${BLOG_DIR}.old-${process.pid}`;
    if (fs.existsSync(BLOG_DIR)) fs.renameSync(BLOG_DIR, oldDir);
    fs.renameSync(tmpDir, BLOG_DIR);
    fs.rmSync(oldDir, { recursive: true, force: true });
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }

  const sitemap = fs.readFileSync(SITEMAP_PATH, 'utf8');
  fs.writeFileSync(SITEMAP_PATH, updateSitemapXml(sitemap, posts), 'utf8');
}

async function loadRows() {
  if (process.env.BLOG_SOURCE_FILE) {
    console.log(`Reading posts from ${process.env.BLOG_SOURCE_FILE}`);
    const rows = JSON.parse(fs.readFileSync(process.env.BLOG_SOURCE_FILE, 'utf8'));
    return rows.map((r) => ({ ...r, __order: Object.keys(r) }));
  }
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID environment variable is required');
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.log(`Reading private Google Sheet (tab "${sheetName}") with the service account...`);
    return fetchPrivateSheet(sheetId, sheetName, process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
  warn('Reading the sheet through its public link, so anyone with the link can read every row, drafts included. ' +
    'Add a GOOGLE_SERVICE_ACCOUNT_JSON secret and make the sheet private (see scripts/README.md).');
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(sheetName)}`;
  return parseGvizResponse(await withRetry(() => request(url)));
}

async function main() {
  const rows = await loadRows();
  const posts = rowsToPosts(rows);
  console.log(`Found ${posts.length} published posts`);

  const existing = countExistingPosts();
  const allowShrink = process.env.BLOG_ALLOW_SHRINK === '1';
  if (posts.length === 0 && !allowShrink) {
    throw new Error('No published posts found — leaving the live blog untouched. Set BLOG_ALLOW_SHRINK=1 to publish an empty blog.');
  }
  if (existing >= 4 && posts.length < existing / 2 && !allowShrink) {
    throw new Error(`Sheet has ${posts.length} published posts but the site has ${existing}. ` +
      'Refusing to remove more than half the blog; re-run with BLOG_ALLOW_SHRINK=1 if this is intended.');
  }

  buildSite(posts);
  console.log(`Generated /blog with ${posts.length} posts, /blog/feed.xml, and updated sitemap.xml`);
  if (warnings.length) console.log(`${warnings.length} warning(s) — see above.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(process.env.GITHUB_ACTIONS ? `::error::${err.message}` : `ERROR: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  parseGvizResponse,
  valuesToRows,
  rowsToPosts,
  parseDate,
  normalizeSlug,
  normalizeImageUrl,
  contentToHtml,
  renderInline,
  escapeHtml,
  truncate,
  generatePostHtml,
  generateBlogListHtml,
  generateFeed,
  updateSitemapXml,
  warnings,
};
