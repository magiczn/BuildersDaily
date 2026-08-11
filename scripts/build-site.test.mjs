import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inferTopics, parseReport, resolveReportSource, slugify } from './build-site.mjs';

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

test('missing local reports safely retain a complete committed static site', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'buildersdaily-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const reportsDir = path.join(root, 'data', 'reports');
  const prebuiltFiles = [
    path.join(root, 'index.html'),
    path.join(root, 'archive', 'index.json'),
    path.join(root, 'builders', 'index.json'),
    path.join(root, 'topics', 'index.json'),
    path.join(root, 'sitemap.xml')
  ];

  for (const file of prebuiltFiles) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '{}\n', 'utf8');
  }

  assert.deepEqual(await resolveReportSource(reportsDir, prebuiltFiles), { mode: 'prebuilt', files: [] });
});

test('missing reports still fail when committed static artifacts are incomplete', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'buildersdaily-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(
    resolveReportSource(path.join(root, 'data', 'reports'), [path.join(root, 'archive', 'index.json')]),
    /prebuilt site is incomplete/
  );
});

test('primary navigation opens archive and Builder directories without homepage sections', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
  assert.match(template, /<a href="\/" data-nav="today">今日<\/a>/);
  assert.match(template, /<button type="button" data-open-collection="archive" aria-haspopup="dialog" aria-controls="collectionDialog">归档<\/button>/);
  assert.match(template, /<button type="button" data-open-collection="builders" aria-haspopup="dialog" aria-controls="collectionDialog">Builders<\/button>/);
  assert.doesNotMatch(template, /href="\/#(?:archive|builders)"/);
  assert.doesNotMatch(template, /<section class="(?:archive|builders)-section"/);
  assert.match(app, /event\.target\.closest\('\[data-open-collection\]'\)/);
  assert.match(app, /async function openCollectionDialog\(mode, trigger\) \{\s*if \(mode === 'builders'\) await ensureBuilderDirectory\(\)/s);
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
  assert.doesNotMatch(template, /assets\/illustrations\/(?:archive-mineral|builder-notes)-transparent\.png/);
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
  const favicon = await readFile(new URL('../assets/favicon.svg', import.meta.url), 'utf8');
  assert.match(template, /assets\/styles\.css\?v=\d{8}-\d+/);
  assert.match(template, /assets\/config\.js\?v=\d{8}-\d+/);
  assert.match(template, /assets\/app\.js\?v=\d{8}-\d+/);
  assert.match(template, /assets\/favicon\.svg\?v=\d{8}-\d+/);
  assert.match(favicon, /<circle[^>]*fill="#d71920"/);
  assert.match(favicon, /text-anchor="middle"[^>]*>BD<\/text>/);
});

test('today heading renders the current issue date from issue data', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
  assert.match(template, /<time class="digest-date" id="digestDate" datetime=""><\/time>/);
  assert.match(app, /elements\.digestDate\.dateTime = issue\.date/);
  assert.match(app, /elements\.digestDate\.textContent = formatDate\(issue\.date\)/);
});

test('today cards use one readable column with direct source links instead of a reader dialog', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../assets/styles.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
  assert.match(styles, /\.today-view \.story-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\)/s);
  assert.doesNotMatch(styles, /\.today-view \.story-grid \{[^}]*repeat\(2,/s);
  assert.match(styles, /\.today-view \.story-grid\.compact \.story-card-top \{[^}]*grid-template-columns: 34px minmax\(0, 1fr\) 18px/s);
  assert.match(styles, /\.today-view \.digest-heading h2 \{[^}]*font-size: clamp\(38px, 3\.8vw, 54px\)[^}]*font-weight: 300/s);
  assert.match(styles, /\.today-view \.story-grid\.compact \.story-copy \{[^}]*max-width: 760px[^}]*margin-left: 50px[^}]*color: #292927[^}]*font-family: var\(--ui\)[^}]*font-size: clamp\(16px, 1\.45vw, 17\.5px\)[^}]*font-weight: 400[^}]*line-height: 1\.82/s);
  assert.match(styles, /\.archive-card \{[^}]*border-radius: 14px/s);
  assert.match(styles, /\.builder-card \{[^}]*border-radius: 14px/s);
  assert.match(app, /\$\{isToday \? builderIdentity : ''\}[\s\S]*\$\{isHighlighted/);
  assert.doesNotMatch(app, /post\.verified \? ' ✓'/);
  assert.doesNotMatch(template, /id="readerDialog"|id="readerAvatar"|id="readerConclusion"|id="readerWhy"/);
  assert.doesNotMatch(app, /openReader|data-reader-card|data-open-post|readerPost/);
  assert.match(app, /class="story-source-link"[\s\S]*target="_blank"[\s\S]*data-source-post=/);
  assert.match(styles, /\.story-source-link \{[^}]*opacity: 0[^}]*pointer-events: none[^}]*transform: translateY\(4px\)/s);
  assert.match(styles, /\.story-card:hover \.story-source-link,[\s\S]*\.story-card:focus-within \.story-source-link \{[^}]*opacity: 1[^}]*pointer-events: auto/s);
  assert.match(styles, /@media \(hover: none\) \{[\s\S]*\.story-source-link \{[^}]*opacity: 1[^}]*pointer-events: auto/s);
  assert.doesNotMatch(template, /id="archiveTitle"|id="buildersTitle"/);
  assert.doesNotMatch(template, /不让昨天的信号消失|按日期回看 Builder 圈的变化/);
});

test('finishing every live card triggers one accessible monochrome celebration', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../assets/styles.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
  assert.match(template, /id="completionCelebration"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(template, /id="completionFireworks"/);
  assert.match(template, /DAILY COMPLETE[\s\S]*今日已读完/);
  assert.match(app, /state\.observedPosts\.size >= state\.visiblePosts\.length/);
  assert.match(app, /persistCelebratedIssue\(state\.issue\.date\)/);
  assert.match(app, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.completion-celebration \{[^}]*position: fixed[^}]*background: rgba\(17, 17, 17, 0\.1\)/s);
  assert.match(styles, /\.completion-message \{[^}]*background: var\(--ink\)[^}]*color: var\(--paper\)/s);
});

test('Vercel publishes the committed static site without rebuilding local reports', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, '');
  assert.equal(config.outputDirectory, '.');
});
