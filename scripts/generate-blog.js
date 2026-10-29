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

  return enrichPosts([...bySlug.values()].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug)));
}

/* ------------------------------------------------------------------ headlines & categories */

// Many posts were written for LinkedIn: the sheet Title is a short label ("closing",
// "development Update") and the real headline is the post's first line. Use that line
// as the headline when the Title is just a label, so pages read well and rank in Google.
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}]\uFE0F?(\u200D[\p{Extended_Pictographic}]\uFE0F?)*/gu;

function cleanLine(line) {
  return String(line)
    .replace(EMOJI, '')
    .replace(/[\u200D\uFE0F]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:|•·*#]+|[\s\-–—:|•·*]+$/g, '')
    .trim();
}

function sentenceCase(text) {
  return text === text.toUpperCase() ? text.charAt(0) + text.slice(1).toLowerCase() : text;
}

const CLOSINGS = 'Recent Closings';
const DEVELOPMENT = 'Tampa Bay Development';
const FIRM_NEWS = 'Firm News';
const TIPS = 'Tips & Insights';

function inferCategory(post) {
  const head = `${post.title} ${post.content.slice(0, 160)}`.toLowerCase();
  if (/^\W*closed\b/i.test(post.content) || /\bclosed\b/.test(post.title.toLowerCase())) return CLOSINGS;
  if (/\bdevelopment\b/.test(post.title.toLowerCase())) return DEVELOPMENT;
  if (/\bhiring\b|we.re growing|homeownership month|\bholiday\b/.test(head)) return FIRM_NEWS;
  return TIPS;
}

/** Returns { text, paragraphUsed } for the post's opening line, or null if it isn't headline-shaped. */
function headlineFromContent(content) {
  const paragraphs = content.split(/\n\s*\n/).slice(0, 2);
  const lines = [];
  paragraphs.forEach((para, p) => para.split('\n').forEach((raw) => {
    const clean = cleanLine(raw);
    if (clean) lines.push({ clean, p, total: para.split('\n').filter((l) => cleanLine(l)).length });
  }));
  const i = lines.findIndex((l) => l.clean.length >= 15);
  if (i === -1) return null;
  let text = lines[i].clean;
  const shortened = text.length > 110;
  if (shortened) {
    const clause = text.match(/^(.{15,100}?)(?:[,;:—–]|\s-\s|\.\s)/);
    if (!clause) return null;
    text = clause[1];
  }
  text = text.replace(/(?<!\.)\.$/, '');
  const prev = lines[i - 1];
  const prefixed = Boolean(prev && prev.clean.length <= 20);
  if (prefixed) text = `${sentenceCase(prev.clean)}: ${text}`;
  // The headline repeats the opening paragraph when that paragraph was only the headline
  // (or only a one-word opener like "CLOSED 💥"), so drop it from the body.
  const standalone = i === 0 && lines[0].p === 0 && lines[0].total === 1 && !shortened;
  const opener = prefixed && i === 1 && prev.p === 0 && prev.total === 1;
  return { text, paragraphUsed: standalone || opener ? 0 : null };
}

function enrichPosts(posts) {
  const titleCounts = new Map();
  posts.forEach((p) => titleCounts.set(p.title.toLowerCase(), (titleCounts.get(p.title.toLowerCase()) || 0) + 1));
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  return posts.map((post) => {
    const category = post.category || inferCategory(post);
    const isLabel = norm(post.title) === norm(post.slug) ||
      /^[a-z]/.test(post.title.trim()) ||
      titleCounts.get(post.title.toLowerCase()) > 1 ||
      post.title.trim().split(/\s+/).length === 1 ||
      (category === CLOSINGS && !/\d/.test(post.title));
    let displayTitle = post.title;
    let body = post.content;
    if (isLabel) {
      const headline = headlineFromContent(post.content);
      if (headline) {
        displayTitle = headline.text;
        if (headline.paragraphUsed === 0) body = post.content.split(/\n\s*\n/).slice(1).join('\n\n') || post.content;
        console.log(`Headline for /blog/${post.slug}: "${displayTitle}" (sheet Title "${post.title}" looks like a label)`);
      }
    }
    return { ...post, category, displayTitle, body };
  });
}

/** Visual cover for posts without an Image: listing details for closings, otherwise the post's emoji. */
function coverFor(post) {
  if (post.category === CLOSINGS) {
    const price = (post.content.match(/\$\s?\d{1,3}(?:,\d{3})+/) || [])[0];
    const addressLine = post.content.split('\n').find((l) => l.includes('📍'));
    const address = addressLine ? cleanLine(addressLine).split(',')[0] : '';
    const city = addressLine ? (cleanLine(addressLine).split(',')[1] || '').trim() : '';
    const facts = (post.content.match(/\d+\s*beds?\s*\|[^\n]+/i) || [])[0];
    if (price) return { kind: 'closing', price: price.replace(/\s/g, ''), address, city, facts: facts ? facts.trim() : '' };
  }
  const emoji = (post.content.match(EMOJI) || [])[0] || '';
  return { kind: 'emoji', emoji };
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
  if (post.excerpt) return truncate(plainText(post.excerpt), max);
  // Skip listing-detail blocks (address / price / beds) and hashtag lines; they read badly as a summary.
  const prose = String(post.body || post.content).split(/\n\s*\n/)
    .filter((para) => !(para.includes('📍') && /\$\s?\d/.test(para)))
    .filter((para) => !/^(\s*#[\p{L}\p{N}_]+)+\s*$/u.test(para.replace(/\n/g, ' ')))
    .join('\n\n');
  return truncate(plainText(prose || post.body || post.content), max);
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

/** A closing's "📍 address / $price / beds | baths" block, rendered as a listing summary. */
function listingHtml(lines) {
  const addressLine = lines.find((l) => l.includes('📍'));
  const priceLine = lines.find((l) => /^\s*\$\s?\d{1,3}(,\d{3})+\s*$/.test(l));
  if (!addressLine || !priceLine || lines.length > 4) return null;
  const facts = lines.filter((l) => l !== addressLine && l !== priceLine)
    .flatMap((l) => l.split('|')).map((f) => f.trim()).filter(Boolean);
  return `<div class="listing">
  <p class="listing-label">Closed</p>
  <p class="listing-price">${escapeHtml(priceLine.trim())}</p>
  <p class="listing-address">${escapeHtml(cleanLine(addressLine))}</p>${facts.length ? `
  <ul class="listing-facts">${facts.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : ''}
</div>`;
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
      const listing = listingHtml(lines);
      if (listing) return listing;
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return `<ul>\n${lines.map((l) => `  <li>${renderInline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('\n')}\n</ul>`;
      }
      if (lines.every((l) => /^(\s*#[\p{L}\p{N}_]+)+\s*$/u.test(l))) {
        return `<p class="hashtags">${escapeHtml(lines.join(' ').replace(/\s+/g, ' ').trim())}</p>`;
      }
      return `<p>${lines.map(renderInline).join('<br>\n')}</p>`;
    })
    .join('\n');
}

/* ------------------------------------------------------------------ templates */

// The header, drawer, footer, logo placement and hero photos mirror the site's React
// components (Navbar.tsx, Footer.tsx, Hero.tsx on main), so the blog reads as part of
// firmtitletb.com rather than a separate site.
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
const ARROW_RIGHT = `<svg ${ICON_ATTRS}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
const SEARCH_ICON = `<svg ${ICON_ATTRS}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
const PHONE_ICON = `<svg ${ICON_ATTRS}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
const LINK_ICON = `<svg ${ICON_ATTRS}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const MAIL_ICON = `<svg ${ICON_ATTRS}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;

// Site hero photos (also used on the homepage), matched to each kind of post.
const HERO_PHOTOS = {
  index: '/hero/yacht.jpg',
  [CLOSINGS]: '/hero/waterst.jpg',
  [DEVELOPMENT]: '/hero/yacht.jpg',
  [FIRM_NEWS]: '/hero/golf.jpg',
  [TIPS]: '/hero/amphitheater.jpg',
};
const EXTRA_PHOTOS = ['/hero/ybor.jpg', '/hero/amphitheater.jpg', '/hero/waterst.jpg', '/hero/golf.jpg'];

function heroPhoto(post) {
  if (HERO_PHOTOS[post.category]) return HERO_PHOTOS[post.category];
  const hash = [...post.category].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return EXTRA_PHOTOS[hash % EXTRA_PHOTOS.length];
}

function categoryClass(category) {
  return { [CLOSINGS]: 'closings', [DEVELOPMENT]: 'development', [FIRM_NEWS]: 'news', [TIPS]: 'tips' }[category] || 'custom';
}

function navLinks(cls) {
  return NAV_LINKS.map(([href, label]) =>
    `<a class="${cls}" href="${href}"${href === '/blog' ? ' aria-current="page"' : ''}>${label}</a>`).join('');
}

function layout({ title, description, canonical, ogType, image, headExtra = '', body, cssHref, preload }) {
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
    <meta name="theme-color" content="#475569" />
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
    <link href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,400&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${cssHref}" />
    ${preload ? `<link rel="preload" as="image" href="${preload}" />` : ''}

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
    <img class="hero-logo" src="/Firm%20Title%20logo%20-%20blue.jpg" alt="" aria-hidden="true" />

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

function postMeta(post) {
  return `<time datetime="${post.date}">${displayDate(post.date)}</time><span aria-hidden="true">&middot;</span>${readingMinutes(post.body)} min read`;
}

/** Card artwork: the post's own image, or a branded cover built from the post itself. */
function coverHtml(post, { eager = false } = {}) {
  if (post.image) {
    return `<div class="cover cover-photo"><img src="${escapeHtml(post.image)}" alt=""${eager ? '' : ' loading="lazy"'} decoding="async" /></div>`;
  }
  const c = coverFor(post);
  const label = `<span class="cover-label">${escapeHtml(post.category)}</span>`;
  if (c.kind === 'closing') {
    return `<div class="cover cover-${categoryClass(post.category)}" aria-hidden="true">
            ${label}
            <span class="cover-stamp">Closed</span>
            <span class="cover-price">${escapeHtml(c.price)}</span>
            <span class="cover-sub">${escapeHtml([c.address, c.city].filter(Boolean).join(' · '))}</span>
          </div>`;
  }
  return `<div class="cover cover-${categoryClass(post.category)}" aria-hidden="true">
            ${label}
            <span class="cover-emoji">${c.emoji || '🏡'}</span>
          </div>`;
}

function searchText(post) {
  return escapeHtml(`${post.displayTitle} ${post.title} ${post.category} ${plainText(post.content)}`.toLowerCase().slice(0, 2000));
}

function postCard(post, { featured = false, filterable = true } = {}) {
  const attrs = filterable ? ` data-category="${escapeHtml(post.category.toLowerCase())}" data-search="${searchText(post)}"` : '';
  return `        <article class="card${featured ? ' card-featured' : ''}"${attrs}>
          ${coverHtml(post, { eager: featured })}
          <div class="card-body">
            <p class="card-kicker">${featured ? '<span class="badge">Latest</span>' : ''}<span>${escapeHtml(post.category)}</span></p>
            <h${featured ? 2 : 3} class="card-title"><a href="/blog/${post.slug}">${escapeHtml(post.displayTitle)}</a></h${featured ? 2 : 3}>
            <p class="card-excerpt">${escapeHtml(postSummary(post, featured ? 260 : 150))}</p>
            <p class="card-footer"><span class="meta">${postMeta(post)}</span><span class="read-more" aria-hidden="true">${featured ? 'Read article' : 'Read'} ${ARROW_RIGHT}</span></p>
          </div>
        </article>`;
}

function ctaBand() {
  return `<section class="cta-band" aria-labelledby="cta-heading">
      <div class="cta-inner">
        <div>
          <p class="eyebrow eyebrow-light">Firm Title TB &middot; South Tampa</p>
          <h2 id="cta-heading">Close on your phone in 15 minutes.</h2>
          <p>Attorney-owned title company serving buyers, sellers and agents across Tampa Bay, with Remote Online Notary and CertiFID wire-fraud protection on every closing.</p>
        </div>
        <div class="cta-actions">
          <a class="btn btn-primary" href="/contact">Contact Firm Title TB</a>
          <a class="btn btn-ghost" href="tel:${PHONE_TEL}">${PHONE_ICON}${PHONE_DISPLAY}</a>
        </div>
      </div>
    </section>`;
}

function generateBlogListHtml(posts, cssHref) {
  const counts = new Map();
  posts.forEach((p) => counts.set(p.category, (counts.get(p.category) || 0) + 1));
  const categories = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
  const chips = categories.length > 1 ? `
          <div class="filters" role="group" aria-label="Filter posts by topic">
            <button type="button" class="chip" data-filter="" aria-pressed="true">All <span>${posts.length}</span></button>
            ${categories.map((c) => `<button type="button" class="chip" data-filter="${escapeHtml(c.toLowerCase())}" aria-pressed="false">${escapeHtml(c)} <span>${counts.get(c)}</span></button>`).join('\n            ')}
          </div>` : '';

  const [latest, ...rest] = posts;
  const body = `    <main id="main">
      <section class="hero hero-index" style="--hero-image:url('${HERO_PHOTOS.index}')">
        <div class="hero-inner">
          <p class="eyebrow eyebrow-light">The Firm Title Blog</p>
          <h1>Title insight &amp; Tampa Bay real estate news</h1>
          <p class="hero-lede">Recent closings, development updates, and plain-English answers to title and closing questions &mdash; from an attorney-owned title company in South Tampa.</p>
        </div>
      </section>

      <section class="blog-section" aria-label="Blog posts">
        <div class="toolbar">${chips}
          <label class="search">
            ${SEARCH_ICON}
            <span class="visually-hidden">Search posts</span>
            <input type="search" placeholder="Search posts" autocomplete="off" />
          </label>
        </div>
        <p class="empty" hidden>No posts match your search. <button type="button" class="link-button" data-reset>Show all posts</button></p>

${latest ? postCard(latest, { featured: true }) : '        <p class="empty">No posts yet. Check back soon!</p>'}
${rest.length ? `        <div class="card-grid">
${rest.map((p) => postCard(p)).join('\n')}
        </div>` : ''}
      </section>

      ${ctaBand()}
    </main>
    <script>
      (function () {
        var cards = [].slice.call(document.querySelectorAll('.card[data-search]'));
        var input = document.querySelector('.search input');
        var filters = document.querySelector('.filters');
        var empty = document.querySelector('.blog-section > .empty');
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
        function choose(btn) {
          category = btn.getAttribute('data-filter');
          [].forEach.call(filters.querySelectorAll('[data-filter]'), function (b) {
            b.setAttribute('aria-pressed', String(b === btn));
          });
          apply();
        }
        input.addEventListener('input', apply);
        if (filters) filters.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-filter]');
          if (btn) choose(btn);
        });
        empty.querySelector('[data-reset]').addEventListener('click', function () {
          input.value = '';
          if (filters) choose(filters.querySelector('[data-filter=""]')); else apply();
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
      headline: p.displayTitle,
      url: `${SITE_URL}/blog/${p.slug}`,
      datePublished: p.date,
    })),
  })}
    </script>
`;

  return layout({
    title: 'Blog | Firm Title TB — Title Company in Tampa, FL',
    description: 'Recent closings, Tampa Bay development news, and title and closing tips from Firm Title TB, an attorney-owned title company in South Tampa.',
    canonical: `${SITE_URL}/blog`,
    ogType: 'website',
    headExtra,
    body,
    cssHref,
    preload: HERO_PHOTOS.index,
  });
}

function shareLinks(post) {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(post.displayTitle);
  const fb = SOCIAL_LINKS[0][2];
  const li = SOCIAL_LINKS[4][2];
  return `<div class="share">
            <span class="share-label">Share</span>
            <a href="https://www.linkedin.com/sharing/share-offsite/?url=${u}" target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn">${li}</a>
            <a href="https://www.facebook.com/sharer/sharer.php?u=${u}" target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook">${fb}</a>
            <a href="mailto:?subject=${t}&amp;body=${u}" aria-label="Share by email">${MAIL_ICON}</a>
            <button type="button" class="copy-link" data-url="${escapeHtml(url)}" aria-label="Copy link">${LINK_ICON}<span>Copy link</span></button>
          </div>`;
}

function generatePostHtml(post, posts, cssHref) {
  const index = posts.indexOf(post);
  const newer = posts[index - 1];
  const older = posts[index + 1];
  const sameCategory = (p) => p.category === post.category;
  const related = posts
    .filter((p) => p !== post)
    .sort((a, b) => Number(sameCategory(b)) - Number(sameCategory(a)))
    .slice(0, 3);
  const url = `${SITE_URL}/blog/${post.slug}`;
  const description = postSummary(post, 160);
  const photo = post.image || heroPhoto(post);

  const pager = (newer || older) ? `
        <nav class="pager" aria-label="Previous and next posts">
          ${older ? `<a class="pager-link" href="/blog/${older.slug}"><span>${ARROW_LEFT}Previous</span>${escapeHtml(older.displayTitle)}</a>` : '<span></span>'}
          ${newer ? `<a class="pager-link pager-next" href="/blog/${newer.slug}"><span>Next${ARROW_RIGHT}</span>${escapeHtml(newer.displayTitle)}</a>` : '<span></span>'}
        </nav>` : '';

  const relatedHtml = related.length ? `
      <section class="blog-section related" aria-labelledby="related-heading">
        <div class="section-heading">
          <h2 id="related-heading">Keep reading</h2>
          <a href="/blog">All posts ${ARROW_RIGHT}</a>
        </div>
        <div class="card-grid">
${related.map((p) => postCard(p, { filterable: false })).join('\n')}
        </div>
      </section>` : '';

  const body = `    <main id="main">
      <section class="hero hero-post" style="--hero-image:url('${escapeHtml(photo)}')">
        <div class="hero-inner hero-inner-narrow">
          <a class="back-link" href="/blog">${ARROW_LEFT}All posts</a>
          <p class="hero-chip">${escapeHtml(post.category)}</p>
          <h1>${escapeHtml(post.displayTitle)}</h1>
          <p class="hero-meta">By ${escapeHtml(post.author)}<span aria-hidden="true">&middot;</span>${postMeta(post)}</p>
        </div>
      </section>

      <div class="article-wrap">
        <article class="article">
          <div class="prose">
${contentToHtml(post.body)}
          </div>
          <div class="article-footer">
            <div class="about">
              <img src="/Firm%20Title%20logo%20-%20blue.jpg" alt="Firm Title TB logo" width="56" height="56" loading="lazy" />
              <div>
                <p class="about-name">Firm Title TB</p>
                <p class="about-text">Attorney-owned title company at 3502 Henderson Blvd, South Tampa. Questions about a closing? <a href="/contact">Get in touch</a>.</p>
              </div>
            </div>
            ${shareLinks(post)}
          </div>
        </article>
${pager}
      </div>
${relatedHtml}

      ${ctaBand()}
    </main>
    <script>
      (function () {
        var btn = document.querySelector('.copy-link');
        if (!btn || !navigator.clipboard) { if (btn) btn.hidden = true; return; }
        btn.addEventListener('click', function () {
          navigator.clipboard.writeText(btn.getAttribute('data-url')).then(function () {
            btn.querySelector('span').textContent = 'Copied!';
            setTimeout(function () { btn.querySelector('span').textContent = 'Copy link'; }, 2000);
          });
        });
      })();
    </script>`;

  const headExtra = `    <meta property="article:published_time" content="${post.date}" />
    <meta property="article:author" content="${escapeHtml(post.author)}" />
    <meta property="article:section" content="${escapeHtml(post.category)}" />

    <!-- Structured Data: BlogPosting -->
    <script type="application/ld+json">
${jsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: post.displayTitle,
        description,
        datePublished: post.date,
        dateModified: post.date,
        image: post.image || `${SITE_URL}${heroPhoto(post)}`,
        wordCount: plainText(post.body).split(' ').length,
        articleSection: post.category,
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
          { '@type': 'ListItem', position: 3, name: post.displayTitle, item: url },
        ],
      },
    ],
  })}
    </script>
`;

  return layout({
    title: `${post.displayTitle} | Firm Title TB`,
    description,
    canonical: url,
    ogType: 'article',
    image: post.image,
    headExtra,
    body,
    cssHref,
    preload: post.image ? null : photo,
  });
}

function generateFeed(posts) {
  const items = posts.slice(0, FEED_SIZE).map((p) => `    <item>
      <title>${escapeXml(p.displayTitle)}</title>
      <link>${SITE_URL}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <category>${escapeXml(p.category)}</category>
      <description>${escapeXml(postSummary(p, 300))}</description>
      <content:encoded><![CDATA[${contentToHtml(p.body).replace(/]]>/g, ']]]]><![CDATA[>')}]]></content:encoded>
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
