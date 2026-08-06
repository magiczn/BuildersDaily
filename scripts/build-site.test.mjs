import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inferTopics, parseReport, slugify } from './build-site.mjs';

test('slugify produces stable route segments', () => {
  assert.equal(slugify('@PeterGYang'), 'petergyang');
  assert.equal(slugify('AI Product Design'), 'ai-product-design');
});

test('inferTopics returns ranked product signals', () => {
  const topics = inferTopics({
    summaryEn: 'We built an agent workflow for product design and frontend prototypes.',
    analysis: '',
    role: ''
  });
  assert.ok(topics.includes('agent'));
  assert.ok(topics.includes('product'));
  assert.ok(topics.includes('design'));
});

test('parseReport preserves posts, source links, profiles and date', () => {
  const report = `# X Daily Digest - 2026-08-05

- Total posts: 2
- Accounts: 1

## @builder_one (2)

- 2026/08/05 08:10 [link](https://x.com/builder_one/status/123)
  We built a production agent workflow for product teams.
- 2026/08/05 07:20 [link](https://x.com/builder_one/status/122)
  A second signal about model cost and infrastructure.
`;
  const issue = parseReport(report, '2026-08-05', [{ handle: 'builder_one', name: 'Builder One', role: 'Product builder' }]);
  assert.equal(issue.date, '2026-08-05');
  assert.equal(issue.posts.length, 2);
  assert.equal(issue.builderCount, 1);
  assert.equal(issue.posts[0].name, 'Builder One');
  assert.equal(issue.posts[0].id, '123');
  assert.ok(issue.posts[0].topics.includes('agent'));
  assert.ok(issue.highlights.length >= 1);
  assert.ok(issue.highlights.every((id) => issue.posts.some((post) => post.id === id)));
});

test('primary navigation leaves Builder and topic timelines for homepage sections', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(template, /<a href="\/" data-nav="today">今日<\/a>/);
  assert.match(template, /<a href="\/#archive" data-nav="archive">归档<\/a>/);
  assert.match(template, /<a href="\/#builders" data-nav="builders">Builders<\/a>/);
});

test('template does not expose unavailable RSS subscription controls', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(template, /feed\.xml/);
  assert.doesNotMatch(template, /subscribe-section/);
  assert.doesNotMatch(template, /openRss/);
  assert.doesNotMatch(template, /copyRss/);
});

test('homepage template includes editorial art and one reusable collection dialog', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(template, /assets\/illustrations\/signal-orbit-transparent\.png/);
  assert.match(template, /assets\/illustrations\/archive-mineral-transparent\.png/);
  assert.match(template, /assets\/illustrations\/builder-notes-transparent\.png/);
  assert.match(template, /id="collectionDialog"/);
  assert.match(template, /id="collectionDialogGrid"/);
});

test('footer does not expose a visible Sitemap shortcut', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(template, /<a href="\/sitemap\.xml">/);
});

test('live cards and Builder directory avoid redundant prompts and controls', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(template, /id="builderSearch"|id="followedOnly"/);
  assert.doesNotMatch(template, /找到持续在一个方向上构建的人/);
  assert.doesNotMatch(app, /展开深度阅读/);
  assert.match(app, /class="story-highlight"/);
  assert.match(app, /state\.issue\.highlights\?\.includes\(post\.id\)/);
});

test('homepage versions mutable assets to prevent stale DOM and script pairings', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(template, /assets\/styles\.css\?v=\d{8}-\d+/);
  assert.match(template, /assets\/config\.js\?v=\d{8}-\d+/);
  assert.match(template, /assets\/app\.js\?v=\d{8}-\d+/);
});
