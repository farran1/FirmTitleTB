// Run with: node --test scripts/generate-blog.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const blog = require('./generate-blog');

const row = (o) => ({ Title: 'A post', Slug: 'a-post', Content: 'Hello', Date: '2026-05-01', Published: true, ...o });
const toPosts = (rows) => blog.rowsToPosts(rows.map((r) => ({ ...r, __order: Object.keys(r) })), '2026-06-01');

test('parses the gviz response with headers', () => {
  const raw = `/*O_o*/\ngoogle.visualization.Query.setResponse(${JSON.stringify({
    status: 'ok',
    table: {
      cols: [{ label: 'Title' }, { label: 'Slug' }, { label: 'Content' }, { label: 'Date' }, { label: 'Published' }],
      rows: [{ c: [{ v: 'Hi' }, { v: 'hi' }, { v: 'Body' }, { v: 'Date(2026,3,30)', f: '4/30/2026' }, { v: true }] }],
    },
  })});`;
  const posts = blog.rowsToPosts(blog.parseGvizResponse(raw), '2026-06-01');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].date, '2026-04-30');
});

test('explains a sheet that is not shared publicly', () => {
  assert.throws(() => blog.parseGvizResponse('<html><body>Sign in</body></html>'), /Anyone with the link/);
});

test('dates: gviz, ISO, US format, and invalid', () => {
  assert.equal(blog.parseDate({ v: 'Date(2026,0,5)' }), '2026-01-05');
  assert.equal(blog.parseDate('2026-6-8'), '2026-06-08');
  assert.equal(blog.parseDate({ v: 46000, f: '6/8/2026' }), '2026-06-08');
  assert.equal(blog.parseDate('2026-02-30'), null);
  assert.equal(blog.parseDate(''), null);
});

test('only published, dated, non-future posts are included, newest first', () => {
  const posts = toPosts([
    row({ Slug: 'old', Date: '2026-01-01' }),
    row({ Slug: 'draft', Published: false }),
    row({ Slug: 'scheduled', Date: '2026-07-01' }),
    row({ Slug: 'undated', Date: '' }),
    row({ Slug: 'new', Date: '2026-05-31', Published: 'TRUE' }),
  ]);
  assert.deepEqual(posts.map((p) => p.slug), ['new', 'old']);
});

test('slugs cannot escape the blog directory or hit reserved names', () => {
  assert.equal(blog.normalizeSlug('../../index'), 'index');
  assert.equal(blog.normalizeSlug('/blog/My Post!/'), 'My-Post');
  assert.equal(blog.normalizeSlug('Estate-in-Thonotosassa'), 'Estate-in-Thonotosassa');
  assert.deepEqual(toPosts([row({ Slug: '../index' }), row({ Slug: 'feed' })]), []);
});

test('duplicate slugs keep the newest post', () => {
  const posts = toPosts([row({ Title: 'Old', Date: '2026-01-01' }), row({ Title: 'New', Date: '2026-02-01' })]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].title, 'New');
});

test('columns are matched by header name in any order, with optional columns', () => {
  const posts = toPosts([{ Published: 'yes', Date: '2026-05-01', Category: 'Closings', Content: 'x', Slug: 's', Title: 'T', Image: 'https://drive.google.com/file/d/abcdefghijklmnop/view' }]);
  assert.equal(posts[0].category, 'Closings');
  assert.equal(posts[0].image, 'https://lh3.googleusercontent.com/d/abcdefghijklmnop');
});

test('content is escaped and supports links, bold, headings and lists', () => {
  const html = blog.contentToHtml('<script>alert(1)</script> & **bold**\n[site](https://example.com/a?b=1&c=2)\n\n## Heading\n\n- one\n- two\n\nSee https://example.com/x.');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('href="https://example.com/a?b=1&amp;c=2"'));
  assert.ok(html.includes('<h2>Heading</h2>'));
  assert.ok(html.includes('<li>two</li>'));
  assert.ok(html.includes('href="https://example.com/x"'), 'trailing period is not part of the link');
  assert.ok(!blog.renderInline('[x](javascript:alert(1))').includes('href'));
});

test('post pages escape titles everywhere, including JSON-LD', () => {
  const [post] = toPosts([row({ Title: 'Evil </script><img src=x onerror=alert(1)> "quote"' })]);
  const html = blog.generatePostHtml(post, [post], '/blog/blog.css');
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('</script><img'));
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(ld)['@graph'][0].headline, post.title);
});

test('excerpts truncate on a word boundary', () => {
  assert.equal(blog.truncate('one two three four', 12), 'one two…');
  assert.equal(blog.truncate('short', 12), 'short');
});

test('sitemap: blog entries are replaced and lastmod is stable', () => {
  const base = '<?xml version="1.0"?>\n<urlset>\n  <url>\n    <loc>https://firmtitletb.com/</loc>\n  </url>\n  <url>\n    <loc>https://firmtitletb.com/blog/gone</loc>\n  </url>\n</urlset>\n';
  const posts = toPosts([row({ Slug: 'a', Date: '2026-05-02' }), row({ Slug: 'b', Date: '2026-05-01' })]);
  const out = blog.updateSitemapXml(base, posts);
  assert.ok(!out.includes('/blog/gone'));
  assert.ok(out.includes('<loc>https://firmtitletb.com/</loc>'));
  assert.match(out, /<loc>https:\/\/firmtitletb\.com\/blog<\/loc>\s*<lastmod>2026-05-02<\/lastmod>/);
  assert.equal(blog.updateSitemapXml(out, posts), out, 'second run is a no-op');
});

test('RSS feed is well-formed enough to escape special characters', () => {
  const posts = toPosts([row({ Title: 'Q&A <today>' })]);
  const feed = blog.generateFeed(posts);
  assert.ok(feed.includes('<title>Q&amp;A &lt;today&gt;</title>'));
});

test('private-sheet rows (Sheets API values) parse like the public feed', () => {
  const rows = blog.valuesToRows([
    ['Title', 'Slug', 'Content', 'Date', 'Published', 'Category'],
    ['Hello', 'hello', 'Body', '6/8/2026', true, 'Closings'],
    ['Draft', 'draft', 'Body', '6/9/2026', false],
    [],
  ]);
  const posts = blog.rowsToPosts(rows, '2026-07-01');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].date, '2026-06-08');
  assert.equal(posts[0].category, 'Closings');
});

test('label-style titles get a headline from the post, real titles are kept', () => {
  const [hotel, closing, real, long] = toPosts([
    row({ Slug: 'hotel', Title: 'development Update', Date: '2026-05-04', Content: '🚨 Tampa Hospitality Expansion News 🚨\n\nHotel Ora is growing.' }),
    row({ Slug: 'mcelroy', Title: 'closing', Date: '2026-05-03', Content: 'CLOSED💥\n\n📍 4810 W McElroy Ave Unit 17, Tampa, FL 33611\n$568,500\n2 beds | 3 baths\n\nGreat sale.' }),
    row({ Slug: 'guide', Title: 'How Title Insurance Works', Date: '2026-05-02', Content: 'Intro paragraph here.' }),
    row({ Slug: 'month', Title: 'holiday', Date: '2026-05-01', Content: 'June is National Homeownership Month, a great reminder of what it really means to own a place you can call your own.\n\nMore.' }),
  ]);
  assert.equal(hotel.displayTitle, 'Tampa Hospitality Expansion News');
  assert.equal(hotel.body, 'Hotel Ora is growing.');
  assert.equal(hotel.category, 'Tampa Bay Development');
  assert.equal(closing.displayTitle, 'Closed: 4810 W McElroy Ave Unit 17, Tampa, FL 33611');
  assert.equal(closing.category, 'Recent Closings');
  assert.ok(closing.body.startsWith('📍'), 'the bare "CLOSED" opener is dropped');
  assert.ok(blog.contentToHtml(closing.body).includes('<p class="listing-price">$568,500</p>'));
  assert.equal(real.displayTitle, 'How Title Insurance Works');
  assert.equal(long.displayTitle, 'June is National Homeownership Month');
  assert.ok(long.body.startsWith('June is National'), 'a shortened headline keeps the full sentence in the body');
});

test('a Category column wins over the automatic category', () => {
  const [post] = toPosts([row({ Title: 'development Update', Category: 'Market News' })]);
  assert.equal(post.category, 'Market News');
});
