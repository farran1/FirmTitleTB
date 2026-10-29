#!/usr/bin/env node
/**
 * Builds the static blog (/blog, /blog/<slug>, /blog/feed.xml) from a Google Sheet
 * and refreshes the blog entries in sitemap.xml.
 *
 * The sheet must be shared as "Anyone with the link can view". Row 1 holds the
 * headers; columns are matched by header name (case-insensitive), so they can be
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

function fetchText(url, { timeoutMs = 20000, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'FirmTitleTB-blog-generator' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('Too many redirects'));
        const next = new URL(res.headers.location, url).toString();
        return resolve(fetchText(next, { timeoutMs, redirects: redirects - 1 }));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} from Google Sheets`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
  });
}

async function fetchWithRetry(url, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchText(url);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const delay = 2000 * 2 ** i;
        console.log(`Fetch failed (${err.message}); retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
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

const NAV_LINKS = [
  ['/', 'Home'],
  ['/videos', 'Videos'],
  ['/homestead', 'Homestead'],
  ['/contact', 'Contact'],
  ['/calculators', 'Calculators'],
  ['/blog', 'Blog'],
];

function layout({ title, description, canonical, ogType, image, headExtra = '', body, cssHref }) {
  const ogImage = image || LOGO_URL;
  const card = image ? 'summary_large_image' : 'summary';
  const nav = NAV_LINKS.map(([href, label]) =>
    `<a href="${href}"${href === '/blog' ? ' aria-current="page"' : ''}>${label}</a>`).join('\n          ');
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
    <link href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,400&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${cssHref}" />

    <!-- Favicon -->
    <link rel="icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/Firm%20Title%20logo%20-%20blue.jpg" />
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="wrap header-inner">
        <a class="brand" href="/">Firm Title TB</a>
        <nav class="site-nav" aria-label="Main">
          ${nav}
        </nav>
        <a class="header-phone" href="tel:${PHONE_TEL}">${PHONE_DISPLAY}</a>
      </div>
    </header>

${body}

    <footer class="site-footer">
      <div class="wrap">
        <p class="footer-contact">3502 Henderson Blvd, Suite 225, Tampa, FL 33609 &middot; <a href="tel:${PHONE_TEL}">${PHONE_DISPLAY}</a> &middot; <a href="mailto:contracts@firmtitletb.com">contracts@firmtitletb.com</a></p>
        <p>&copy; ${new Date().getFullYear()} FirmTitleTB. All rights reserved.</p>
        <p class="footer-links">
          <a href="/privacy">Privacy Policy</a>
          <span aria-hidden="true">|</span>
          <a href="/sms-opt-in">SMS Opt-In</a>
          <span aria-hidden="true">|</span>
          <a href="/blog/feed.xml">RSS</a>
        </p>
      </div>
    </footer>
  </body>
</html>
`.replace(/^[ \t]+\n/gm, ''); // drop lines left blank by optional fragments
}

function postCard(post, { featured = false, searchable = false } = {}) {
  const category = post.category
    ? `<span class="tag">${escapeHtml(post.category)}</span>` : '';
  const image = post.image
    ? `<div class="card-media"><img src="${escapeHtml(post.image)}" alt="" loading="lazy" decoding="async" /></div>` : '';
  const search = searchable && escapeHtml(`${post.title} ${post.category} ${plainText(post.content)}`.toLowerCase().slice(0, 2000));
  return `        <article class="card${featured ? ' card-featured' : ''}${post.image ? ' has-media' : ''}" ${searchable ? ` data-category="${escapeHtml(post.category.toLowerCase())}" data-search="${search}"` : ''}>
          ${image}
          <div class="card-body">
            <p class="meta">${category}<time datetime="${post.date}">${displayDate(post.date)}</time> &middot; ${readingMinutes(post.content)} min read</p>
            <h2 class="card-title"><a href="/blog/${post.slug}">${escapeHtml(post.title)}</a></h2>
            <p class="card-excerpt">${escapeHtml(postSummary(post, featured ? 280 : 180))}</p>
            <span class="read-more" aria-hidden="true">Read more &rarr;</span>
          </div>
        </article>`;
}

function generateBlogListHtml(posts, cssHref) {
  const categories = [...new Set(posts.map((p) => p.category).filter(Boolean))].sort();
  const filters = categories.length > 1 ? `
        <div class="filters" role="group" aria-label="Filter posts by category" hidden>
          <button type="button" class="chip" data-filter="" aria-pressed="true">All</button>
          ${categories.map((c) => `<button type="button" class="chip" data-filter="${escapeHtml(c.toLowerCase())}" aria-pressed="false">${escapeHtml(c)}</button>`).join('\n          ')}
        </div>` : '';

  const cards = posts.map((p, i) => postCard(p, { featured: i === 0, searchable: true })).join('\n');
  const body = `    <main id="main">
      <section class="blog-hero">
        <div class="wrap">
          <h1>The Firm Title TB Blog</h1>
          <p>Closings, title insurance, Florida real estate tips, and Tampa Bay market news &mdash; from an attorney-owned title company in South Tampa.</p>
        </div>
      </section>

      <section class="wrap blog-list" aria-label="Blog posts">
        <div class="toolbar" hidden>
          <label class="search">
            <span class="visually-hidden">Search posts</span>
            <input type="search" placeholder="Search posts…" autocomplete="off" />
          </label>${filters}
        </div>
        <p class="empty" hidden>No posts match your search.</p>
        <div class="cards">
${cards || '          <p class="empty">No posts yet. Check back soon!</p>'}
        </div>
      </section>

      ${ctaBlock()}
    </main>
    <script>
      (function () {
        var cards = [].slice.call(document.querySelectorAll('.card'));
        var toolbar = document.querySelector('.toolbar');
        if (!toolbar || cards.length < 4) return;
        toolbar.hidden = false;
        var filters = document.querySelector('.filters');
        if (filters) filters.hidden = false;
        var input = toolbar.querySelector('input');
        var empty = document.querySelector('.blog-list > .empty');
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

function ctaBlock() {
  return `<section class="cta">
        <div class="wrap">
          <h2>Have questions about your closing?</h2>
          <p>Our attorney-owned team handles closings across Tampa Bay &mdash; and you can close on your phone in about 15 minutes.</p>
          <div class="cta-actions">
            <a class="btn btn-primary" href="/contact">Contact Firm Title TB</a>
            <a class="btn btn-secondary" href="tel:${PHONE_TEL}">Call ${PHONE_DISPLAY}</a>
          </div>
        </div>
      </section>`;
}

function shareLinks(post) {
  const url = encodeURIComponent(`${SITE_URL}/blog/${post.slug}`);
  const text = encodeURIComponent(post.title);
  return `<div class="share" aria-label="Share this post">
          <span>Share:</span>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${url}" target="_blank" rel="noopener noreferrer">Facebook</a>
          <a href="https://www.linkedin.com/sharing/share-offsite/?url=${url}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
          <a href="https://twitter.com/intent/tweet?url=${url}&amp;text=${text}" target="_blank" rel="noopener noreferrer">X</a>
          <a href="mailto:?subject=${text}&amp;body=${url}">Email</a>
        </div>`;
}

function generatePostHtml(post, posts, cssHref) {
  const index = posts.indexOf(post);
  const newer = posts[index - 1];
  const older = posts[index + 1];
  const related = posts
    .filter((p) => p !== post)
    .sort((a, b) => (b.category === post.category && post.category ? 1 : 0) - (a.category === post.category && post.category ? 1 : 0))
    .slice(0, 3);
  const url = `${SITE_URL}/blog/${post.slug}`;
  const description = postSummary(post, 160);

  const pager = (newer || older) ? `
        <nav class="pager" aria-label="More posts">
          ${older ? `<a class="pager-prev" href="/blog/${older.slug}"><span>&larr; Previous</span>${escapeHtml(older.title)}</a>` : '<span></span>'}
          ${newer ? `<a class="pager-next" href="/blog/${newer.slug}"><span>Next &rarr;</span>${escapeHtml(newer.title)}</a>` : '<span></span>'}
        </nav>` : '';

  const relatedHtml = related.length ? `
      <section class="wrap related" aria-labelledby="related-heading">
        <h2 id="related-heading">More from the blog</h2>
        <div class="cards cards-grid">
${related.map((p) => postCard(p)).join('\n')}
        </div>
      </section>` : '';

  const body = `    <main id="main">
      <article class="wrap-narrow post">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/blog">Blog</a>${post.category ? ` <span aria-hidden="true">/</span> <span>${escapeHtml(post.category)}</span>` : ''}
        </nav>
        <header class="post-header">
          ${post.category ? `<p class="tag">${escapeHtml(post.category)}</p>` : ''}
          <h1>${escapeHtml(post.title)}</h1>
          <p class="meta">By ${escapeHtml(post.author)} &middot; <time datetime="${post.date}">${displayDate(post.date)}</time> &middot; ${readingMinutes(post.content)} min read</p>
        </header>
        ${post.image ? `<figure class="post-image"><img src="${escapeHtml(post.image)}" alt="" decoding="async" /></figure>` : ''}
        <div class="prose">
${contentToHtml(post.content)}
        </div>
        ${shareLinks(post)}
${pager}
      </article>

      ${ctaBlock()}
${relatedHtml}
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
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(sheetName)}`;
  console.log(`Fetching posts from Google Sheet (tab "${sheetName}")...`);
  return parseGvizResponse(await fetchWithRetry(url));
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
