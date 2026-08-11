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

test('template exposes one unified spatial canvas for today, archive and Builders', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(template, /id="spatialCanvas"/);
  assert.match(template, /id="spatialStage"/);
  assert.match(template, /id="spatialWorld"/);
  assert.match(template, /data-space-link="today"/);
  assert.match(template, /data-space-link="archive"/);
  assert.match(template, /data-space-link="builders"/);
  assert.doesNotMatch(template, /id="collectionDialog"|class="story-grid"|class="digest-section"/);
});

test('spatial canvas provides pan, zoom, focus and sequential navigation', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
  assert.match(app, /function buildPositions\(items, mode\)/);
  assert.match(app, /function updateScene\(\)/);
  assert.match(app, /function scheduleSceneUpdate\(\)/);
  assert.match(app, /card\.dataset\.sceneVisible/);
  assert.match(app, /state\.renderedActiveIndex = state\.activeIndex/);
  assert.doesNotMatch(app, /card\.style\.filter/);
  assert.match(app, /function focusItem\(index/);
  assert.match(app, /addEventListener\('pointerdown'/);
  assert.match(app, /addEventListener\('pointermove'/);
  assert.match(app, /addEventListener\('wheel'/);
  assert.match(template, /data-canvas-action="previous"/);
  assert.match(template, /data-canvas-action="next"/);
});

test('three spatial modes preserve direct routes and source links', async () => {
  const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
  assert.match(app, /url: `\/daily\/\$\{issue\.date\}\//);
  assert.match(app, /url: `\/builders\/\$\{builder\.slug \|\| slugify\(handle\)\}\//);
  assert.match(app, /action: '查看原文 ↗'/);
  assert.match(app, /target="_blank" rel="noopener noreferrer"/);
});

test('spatial design uses fisheye depth and legible central cards', async () => {
  const styles = await readFile(new URL('../assets/styles.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
  assert.match(styles, /\.spatial-stage \{[^}]*perspective: 1100px/s);
  assert.match(styles, /\.space-card \{[^}]*transform-style: preserve-3d/s);
  assert.match(styles, /\.space-card \{[^}]*will-change: transform, opacity/s);
  assert.match(styles, /\.space-card\.is-active \{[^}]*box-shadow:/s);
  assert.match(app, /const fisheye = 1 \/ \(1 \+ distance \/ 960\)/);
  assert.match(app, /rotateX\(\$\{rotateX\}deg\) rotateY/);
});

test('canvas remains keyboard, touch and reduced-motion accessible', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../assets/styles.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
  assert.match(template, /id="spatialStage" tabindex="0"/);
  assert.match(app, /event\.key === 'ArrowLeft'/);
  assert.match(app, /event\.key === 'Home'/);
  assert.match(styles, /touch-action: none/);
  assert.match(styles, /@media \(hover: none\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('finishing every live signal still triggers the monochrome celebration', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
  assert.match(template, /id="completionCelebration"[^>]*role="status"/);
  assert.match(template, /id="completionFireworks"/);
  assert.match(app, /state\.observedPosts\.size >= state\.items\.length/);
  assert.match(app, /persistCelebratedIssue\(state\.issue\.date\)/);
});

test('mutable spatial assets are versioned for cache safety', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(template, /assets\/styles\.css\?v=\d{8}-\d+/);
  assert.match(template, /assets\/app\.js\?v=\d{8}-\d+/);
  assert.match(template, /assets\/favicon\.svg\?v=\d{8}-\d+/);
});

test('Vercel publishes the committed static site without rebuilding local reports', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, '');
  assert.equal(config.outputDirectory, '.');
});
