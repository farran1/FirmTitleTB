#!/usr/bin/env node
/**
 * Fetches blog posts from a public Google Sheet and generates static HTML pages.
 *
 * Google Sheet columns (Row 1 = headers):
 *   A: Title
 *   B: Slug (URL-friendly, e.g. "closing-costs-explained")
 *   C: Content (the blog post body — plain text or basic HTML)
 *   D: Date (YYYY-MM-DD)
 *   E: Published (TRUE or FALSE)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
if (!SHEET_ID) {
  console.error('ERROR: GOOGLE_SHEET_ID environment variable is required');
  process.exit(1);
}

const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;

const ROOT_DIR = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT_DIR, 'blog');
const SITEMAP_PATH = path.join(ROOT_DIR, 'sitemap.xml');

function fetch(url) {
  return new Promise((resolve, reject) => {
    const doFetch = (fetchUrl) => {
      https.get(fetchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doFetch(res.headers.location);
          return;
        }
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    };
    doFetch(url);
  });
}

function parseGoogleJSON(raw) {
  // Google wraps the JSON in a callback: google.visualization.Query.setResponse({...})
  const match = raw.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\);?\s*$/);
  if (!match) throw new Error('Could not parse Google Sheets response');
  const json = JSON.parse(match[1]);
  const rows = json.table.rows;
  const posts = [];

  for (const row of rows) {
    const cells = row.c;
    if (!cells || !cells[0]) continue;

    const title = cells[0] ? cells[0].v : '';
    const slug = cells[1] ? String(cells[1].v).trim() : '';
    const content = cells[2] ? cells[2].v : '';
    const date = cells[3] ? (cells[3].f || cells[3].v || '') : '';
    const published = cells[4] ? String(cells[4].v).toUpperCase() === 'TRUE' : false;

    if (title && slug && published) {
      posts.push({ title, slug, content, date: formatDate(date) });
    }
  }

  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

function formatDate(raw) {
  if (!raw) return new Date().toISOString().split('T')[0];
  // Handle "Date(2026,3,30)" format from Google
  const dateMatch = String(raw).match(/Date\((\d+),(\d+),(\d+)\)/);
  if (dateMatch) {
    const y = dateMatch[1];
    const m = String(Number(dateMatch[2]) + 1).padStart(2, '0');
    const d = dateMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // Already YYYY-MM-DD or similar
  const isoMatch = String(raw).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2,'0')}-${isoMatch[3].padStart(2,'0')}`;
  return new Date().toISOString().split('T')[0];
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contentToHtml(content) {
  // Always treat sheet content as plain text for safety — convert to paragraphs
  const escaped = escapeHtml(content);
  return escaped
    .split(/\n\s*\n/)
    .map(para => `<p style="color:#334155;line-height:1.8;margin-bottom:16px">${para.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function generatePostHtml(post) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(post.title)} | Firm Title TB Blog</title>
    <meta name="description" content="${escapeHtml(post.content.replace(/\n/g, ' ').substring(0, 155))}..." />
    <meta name="author" content="Firm Title TB, LLC" />
    <link rel="canonical" href="https://firmtitletb.com/blog/${post.slug}" />

    <!-- Open Graph -->
    <meta property="og:title" content="${escapeHtml(post.title)}" />
    <meta property="og:description" content="${escapeHtml(post.content.replace(/\n/g, ' ').substring(0, 155))}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="https://firmtitletb.com/blog/${post.slug}" />
    <meta property="og:image" content="https://firmtitletb.com/Firm%20Title%20logo%20-%20blue.jpg" />
    <meta property="og:site_name" content="Firm Title TB" />
    <meta property="article:published_time" content="${post.date}" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(post.title)}" />
    <meta name="twitter:description" content="${escapeHtml(post.content.replace(/\n/g, ' ').substring(0, 155))}" />
    <meta name="twitter:image" content="https://firmtitletb.com/Firm%20Title%20logo%20-%20blue.jpg" />

    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700;900&display=swap" rel="stylesheet" />

    <!-- Favicon -->
    <link rel="icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/Firm%20Title%20logo%20-%20blue.jpg" />

    <!-- Structured Data: BlogPosting -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": "${escapeHtml(post.title)}",
      "datePublished": "${post.date}",
      "author": {
        "@type": "Organization",
        "name": "Firm Title TB",
        "url": "https://firmtitletb.com"
      },
      "publisher": {
        "@type": "Organization",
        "name": "Firm Title TB",
        "logo": {
          "@type": "ImageObject",
          "url": "https://firmtitletb.com/Firm%20Title%20logo%20-%20blue.jpg"
        }
      },
      "mainEntityOfPage": "https://firmtitletb.com/blog/${post.slug}"
    }
    </script>

    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Merriweather, serif; background: #f8fafc; color: #334155; }
      a { color: #0057FF; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <header style="background:#475569e6;padding:16px 24px;color:#fff">
      <nav style="display:flex;justify-content:space-between;align-items:center;max-width:1200px;margin:0 auto">
        <a href="/" style="font-weight:700;font-size:1.125rem;color:#fff">Firm Title TB</a>
        <div style="display:flex;gap:24px">
          <a href="/" style="color:#fff">Home</a>
          <a href="/blog" style="color:#fff;text-decoration:underline;text-underline-offset:4px">Blog</a>
          <a href="/videos" style="color:#fff">Videos</a>
          <a href="/homestead" style="color:#fff">Homestead</a>
          <a href="/contact" style="color:#fff">Contact</a>
          <a href="/calculators" style="color:#fff">Calculators</a>
        </div>
      </nav>
    </header>

    <main style="max-width:760px;margin:0 auto;padding:48px 24px">
      <a href="/blog" style="color:#64748b;font-size:0.875rem;display:inline-block;margin-bottom:24px">&larr; Back to Blog</a>
      <article>
        <h1 style="font-size:2rem;font-weight:700;color:#1e293b;margin-bottom:12px;line-height:1.3">${escapeHtml(post.title)}</h1>
        <p style="color:#64748b;font-size:0.875rem;margin-bottom:32px">${new Date(post.date + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} &middot; Firm Title TB</p>
        <div style="font-size:1.05rem">
          ${contentToHtml(post.content)}
        </div>
      </article>

      <div style="margin-top:48px;padding-top:32px;border-top:1px solid #e2e8f0;text-align:center">
        <p style="color:#64748b;margin-bottom:12px">Have questions about your closing? We're here to help.</p>
        <a href="/contact" style="display:inline-block;background:#0057FF;color:#fff;padding:12px 32px;border-radius:9999px;font-weight:600;text-decoration:none">Contact Firm Title TB</a>
      </div>
    </main>

    <footer style="background:#475569e6;color:#fff;padding:24px;text-align:center;font-size:0.875rem">
      <p>&copy; ${new Date().getFullYear()} FirmTitleTB. All rights reserved.</p>
      <p style="margin-top:8px">
        <a href="/privacy" style="color:#d1d5db">Privacy Policy</a>
        <span style="color:#6b7280"> | </span>
        <a href="/sms-opt-in" style="color:#d1d5db">SMS Opt-In</a>
      </p>
    </footer>
  </body>
</html>`;
}

function generateBlogListHtml(posts) {
  const postCards = posts.map(post => `
          <a href="/blog/${post.slug}" style="display:block;background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:24px;text-decoration:none;transition:box-shadow .2s">
            <h2 style="font-size:1.125rem;font-weight:700;color:#1e293b;margin-bottom:8px">${escapeHtml(post.title)}</h2>
            <p style="color:#64748b;font-size:0.875rem;margin-bottom:12px">${new Date(post.date + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p style="color:#334155;line-height:1.6">${escapeHtml(post.content.replace(/\n/g, ' ').substring(0, 200))}...</p>
          </a>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Blog | Firm Title TB — Title Company in Tampa, FL</title>
    <meta name="description" content="Read the latest from Firm Title TB in Tampa, FL. Tips on closings, title insurance, RON, 1031 exchanges, and real estate in Tampa Bay." />
    <meta name="author" content="Firm Title TB, LLC" />
    <link rel="canonical" href="https://firmtitletb.com/blog" />

    <!-- Open Graph -->
    <meta property="og:title" content="Blog | Firm Title TB" />
    <meta property="og:description" content="Tips on closings, title insurance, RON, and real estate in Tampa Bay." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://firmtitletb.com/blog" />
    <meta property="og:image" content="https://firmtitletb.com/Firm%20Title%20logo%20-%20blue.jpg" />
    <meta property="og:site_name" content="Firm Title TB" />

    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700;900&display=swap" rel="stylesheet" />

    <!-- Favicon -->
    <link rel="icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/Firm%20Title%20logo%20-%20blue.jpg" />

    <!-- Structured Data: Blog -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      "name": "Firm Title TB Blog",
      "url": "https://firmtitletb.com/blog",
      "publisher": {
        "@type": "Organization",
        "name": "Firm Title TB",
        "url": "https://firmtitletb.com"
      }
    }
    </script>

    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Merriweather, serif; background: #f8fafc; color: #334155; }
      a { color: #0057FF; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <header style="background:#475569e6;padding:16px 24px;color:#fff">
      <nav style="display:flex;justify-content:space-between;align-items:center;max-width:1200px;margin:0 auto">
        <a href="/" style="font-weight:700;font-size:1.125rem;color:#fff">Firm Title TB</a>
        <div style="display:flex;gap:24px">
          <a href="/" style="color:#fff">Home</a>
          <a href="/blog" style="color:#fff;text-decoration:underline;text-underline-offset:4px">Blog</a>
          <a href="/videos" style="color:#fff">Videos</a>
          <a href="/homestead" style="color:#fff">Homestead</a>
          <a href="/contact" style="color:#fff">Contact</a>
          <a href="/calculators" style="color:#fff">Calculators</a>
        </div>
      </nav>
    </header>

    <main style="max-width:800px;margin:0 auto;padding:48px 24px">
      <h1 style="font-size:2rem;font-weight:700;color:#1e293b;margin-bottom:8px">Blog</h1>
      <p style="color:#64748b;margin-bottom:40px">Tips, insights, and updates from Firm Title TB in Tampa Bay.</p>

      <div style="display:flex;flex-direction:column;gap:24px">
${postCards || '        <p style="color:#64748b">No posts yet. Check back soon!</p>'}
      </div>
    </main>

    <footer style="background:#475569e6;color:#fff;padding:24px;text-align:center;font-size:0.875rem">
      <p>&copy; ${new Date().getFullYear()} FirmTitleTB. All rights reserved.</p>
      <p style="margin-top:8px">
        <a href="/privacy" style="color:#d1d5db">Privacy Policy</a>
        <span style="color:#6b7280"> | </span>
        <a href="/sms-opt-in" style="color:#d1d5db">SMS Opt-In</a>
      </p>
    </footer>
  </body>
</html>`;
}

function updateSitemap(posts) {
  let sitemap = fs.readFileSync(SITEMAP_PATH, 'utf8');
  const today = new Date().toISOString().split('T')[0];

  // Remove any existing blog entries
  sitemap = sitemap.replace(/\s*<url>\s*<loc>https:\/\/firmtitletb\.com\/blog[^]*?<\/url>/g, '');

  // Build new blog entries
  const blogListEntry = `
  <url>
    <loc>https://firmtitletb.com/blog</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;

  const postEntries = posts.map(post => `
  <url>
    <loc>https://firmtitletb.com/blog/${post.slug}</loc>
    <lastmod>${post.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`).join('');

  // Insert before closing </urlset>
  sitemap = sitemap.replace('</urlset>', `${blogListEntry}${postEntries}\n</urlset>`);

  fs.writeFileSync(SITEMAP_PATH, sitemap, 'utf8');
  console.log(`Sitemap updated with ${posts.length} blog posts`);
}

async function main() {
  console.log('Fetching posts from Google Sheet...');
  const raw = await fetch(CSV_URL);
  const posts = parseGoogleJSON(raw);
  console.log(`Found ${posts.length} published posts`);

  if (posts.length === 0) {
    console.log('No published posts found. Skipping generation.');
    return;
  }

  // Clean and recreate blog directory
  if (fs.existsSync(BLOG_DIR)) {
    fs.rmSync(BLOG_DIR, { recursive: true });
  }
  fs.mkdirSync(BLOG_DIR, { recursive: true });

  // Generate blog listing page
  fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), generateBlogListHtml(posts), 'utf8');
  console.log('Generated /blog/index.html');

  // Generate individual post pages
  for (const post of posts) {
    const postDir = path.join(BLOG_DIR, post.slug);
    fs.mkdirSync(postDir, { recursive: true });
    fs.writeFileSync(path.join(postDir, 'index.html'), generatePostHtml(post), 'utf8');
    console.log(`Generated /blog/${post.slug}/index.html`);
  }

  // Update sitemap
  updateSitemap(posts);

  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
