import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPORTS_DIR = path.join(PROJECT_ROOT, 'data', 'reports');
const ARCHIVE_DIR = path.join(PROJECT_ROOT, 'archive');
const DAILY_DIR = path.join(PROJECT_ROOT, 'daily');
const BUILDERS_DIR = path.join(PROJECT_ROOT, 'builders');
const TOPICS_DIR = path.join(PROJECT_ROOT, 'topics');
const SITE_URL = 'https://www.buildersdaily.today';

export const TOPIC_DEFINITIONS = {
  agent: {
    label: 'Agents',
    keywords: ['agent', 'agents', 'agentic', '智能体', '代理', 'harness', 'skill', 'mcp', 'memory', 'openclaw']
  },
  product: {
    label: '产品',
    keywords: ['product', '产品', '用户', '体验', '交互', 'workflow', '工作流', 'app', '应用', 'feature', '功能']
  },
  model: {
    label: '模型',
    keywords: ['model', '模型', 'gpt', 'claude', 'opus', 'gemini', 'qwen', 'kimi', 'deepseek', 'minimax', 'benchmark', 'token']
  },
  design: {
    label: '设计',
    keywords: ['design', '设计', 'ui', 'ux', 'frontend', '前端', 'interface', 'canvas', 'prototype', '原型', '3d']
  },
  business: {
    label: '商业',
    keywords: ['business', '商业', 'startup', '创业', 'revenue', '收入', 'pricing', '价格', 'market', '市场', '投资', '融资', 'founder']
  },
  infrastructure: {
    label: '基础设施',
    keywords: ['api', 'cloud', 'infra', 'infrastructure', 'deployment', 'deploy', '数据库', '算力', 'gpu', 'server', 'security', '安全', 'permission']
  },
  media: {
    label: '内容与媒体',
    keywords: ['video', 'image', 'content', 'creator', '视频', '图像', '内容', '创作者', '播客', 'newsletter', '分发']
  },
  enterprise: {
    label: '企业 AI',
    keywords: ['enterprise', '企业', 'organization', '组织', 'company', '公司', 'team', '团队', 'governance', '治理']
  },
  other: { label: '其他', keywords: [] }
};

function compactText(value, limit = 320) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function postId(post) {
  const statusId = String(post.url || '').match(/status\/(\d+)/)?.[1];
  if (statusId) return statusId;
  return `${slugify(post.handle)}-${createHash('sha1').update(String(post.summaryEn || post.summary || '')).digest('hex').slice(0, 12)}`;
}

function avatarFor(name, handle) {
  const cleanName = String(name || '').trim();
  if (/^[\u4e00-\u9fff]/.test(cleanName)) return cleanName.slice(0, 2);
  const initials = cleanName.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return initials || String(handle || 'BD').slice(0, 2).toUpperCase();
}

export function inferTopics(post) {
  const haystack = [post.summary, post.summaryEn, post.analysis, post.role]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const scored = Object.entries(TOPIC_DEFINITIONS)
    .filter(([key]) => key !== 'other')
    .map(([key, definition]) => ({
      key,
      score: definition.keywords.reduce((total, keyword) => total + (haystack.includes(keyword.toLowerCase()) ? 1 : 0), 0)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.key);
  return scored.length ? scored : ['other'];
}

function normalizeProfile(profile) {
  const handle = String(profile?.handle || '').replace(/^@/, '').trim();
  return {
    handle,
    slug: slugify(handle),
    name: String(profile?.name || handle || 'Unknown Builder').trim(),
    role: String(profile?.role || profile?.bio || '').trim(),
    summary: String(profile?.summary || profile?.role || profile?.bio || '').trim(),
    avatar: String(profile?.avatar || avatarFor(profile?.name, handle)).trim(),
    verified: Boolean(profile?.verified)
  };
}

function normalizePost(post, date, profile = {}) {
  const handle = String(post?.handle || profile.handle || '').replace(/^@/, '').trim();
  const normalized = {
    id: String(post?.id || postId(post || {})),
    date,
    name: String(post?.name || profile.name || handle || 'Unknown Builder').trim(),
    handle,
    role: String(post?.role || profile.role || '').trim(),
    avatar: String(post?.avatar || profile.avatar || avatarFor(post?.name || profile.name, handle)).trim(),
    summary: String(post?.summary || post?.summaryEn || '').trim(),
    summaryEn: String(post?.summaryEn || post?.summary || '').trim(),
    analysis: String(post?.analysis || '').trim(),
    url: String(post?.url || '').trim(),
    verified: Boolean(post?.verified || profile.verified),
    hotComments: Array.isArray(post?.hotComments) ? post.hotComments : []
  };
  normalized.topics = Array.isArray(post?.topics) && post.topics.length ? post.topics : inferTopics(normalized);
  normalized.primaryTopic = normalized.topics[0] || 'other';
  normalized.id = post?.id || postId(normalized);
  return normalized;
}

function countTopics(posts) {
  return posts.reduce((counts, post) => {
    post.topics.forEach((topic) => {
      counts[topic] = (counts[topic] || 0) + 1;
    });
    return counts;
  }, {});
}

function scorePost(post) {
  const text = `${post.summaryEn || ''} ${post.analysis || ''}`;
  let score = Math.min(text.length, 900) / 90;
  if (post.analysis?.length > 100) score += 5;
  if (post.verified) score += 1;
  if (/\b(launch|release|built|ship|workflow|product)\b|发布|推出|开源|工作流|产品|构建/i.test(text)) score += 3;
  if (/政治|遇害|财报后|咳醒|吃饭|旅游|politic|murder/i.test(text)) score -= 7;
  return score;
}

function selectHighlights(posts, count = 3) {
  const ranked = [...posts].sort((a, b) => scorePost(b) - scorePost(a));
  const selected = [];
  const handles = new Set();
  for (const post of ranked) {
    if (handles.has(post.handle.toLowerCase()) && selected.length < count - 1) continue;
    selected.push(post);
    handles.add(post.handle.toLowerCase());
    if (selected.length === count) break;
  }
  return selected;
}

function summarizeIssue(posts) {
  const topTopics = Object.entries(countTopics(posts))
    .filter(([topic]) => topic !== 'other')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => TOPIC_DEFINITIONS[topic].label);
  if (!topTopics.length) return '这一天的 Builder 动态已完成归档。';
  return `这一天的高频 Builder 信号集中在${topTopics.join('、')}。回看这些独立动态，可以判断哪些变化只是短期热度，哪些正在变成真实工作流。`;
}

function buildIssue(date, posts, summary = '') {
  const normalizedPosts = posts.filter((post) => post.summaryEn || post.summary);
  const topicCounts = countTopics(normalizedPosts);
  const highlights = selectHighlights(normalizedPosts);
  return {
    date,
    builderCount: new Set(normalizedPosts.map((post) => post.handle.toLowerCase()).filter(Boolean)).size,
    postCount: normalizedPosts.length,
    topTopics: Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([topic]) => topic),
    summary: summary || summarizeIssue(normalizedPosts),
    highlights: highlights.map((post) => post.id),
    posts: normalizedPosts
  };
}

export function parseReport(source, date, profiles = []) {
  const profileMap = new Map(profiles.map((profile) => {
    const normalized = normalizeProfile(profile);
    return [normalized.handle.toLowerCase(), normalized];
  }));
  const posts = [];
  const lines = String(source || '').split(/\r?\n/);
  let currentHandle = '';
  let currentPost = null;

  const flushPost = () => {
    if (!currentPost) return;
    currentPost.summary = currentPost.summary.trim();
    currentPost.summaryEn = currentPost.summary;
    if (currentPost.summary) {
      const profile = profileMap.get(currentPost.handle.toLowerCase()) || {};
      posts.push(normalizePost(currentPost, date, profile));
    }
    currentPost = null;
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+@([^\s(]+)(?:\s+\(\d+\))?/);
    if (heading) {
      flushPost();
      currentHandle = heading[1];
      continue;
    }

    const item = line.match(/^-\s+(\d{4}\/\d{2}\/\d{2})\s+\d{2}:\d{2}\s+\[link\]\((https?:\/\/[^)]+)\)\s*(.*)$/);
    if (item && currentHandle) {
      flushPost();
      currentPost = {
        handle: currentHandle,
        url: item[2],
        summary: item[3] || ''
      };
      continue;
    }

    if (currentPost && /^\s{2,}\S/.test(line)) {
      currentPost.summary += `${currentPost.summary ? ' ' : ''}${line.trim()}`;
    }
  }
  flushPost();
  return buildIssue(date, posts);
}

function normalizeCurrentData(data, date, profiles) {
  const profileMap = new Map(profiles.map((profile) => {
    const normalized = normalizeProfile(profile);
    return [normalized.handle.toLowerCase(), normalized];
  }));
  const summaryItem = data.find((item) => item?.isSummary);
  const posts = data
    .filter((item) => item && !item.isSummary)
    .map((post) => normalizePost(post, date, profileMap.get(String(post.handle || '').toLowerCase()) || {}));
  return buildIssue(date, posts, summaryItem?.summaryEn || summaryItem?.summary || '');
}

function compactPost(post) {
  return {
    id: post.id,
    date: post.date,
    name: post.name,
    handle: post.handle,
    role: post.role,
    avatar: post.avatar,
    summary: post.summary,
    summaryEn: post.summaryEn,
    analysis: post.analysis,
    url: post.url,
    verified: post.verified,
    topics: post.topics,
    primaryTopic: post.primaryTopic
  };
}

function archiveEntry(issue) {
  const highlightPosts = issue.highlights
    .map((id) => issue.posts.find((post) => post.id === id))
    .filter(Boolean)
    .map((post) => ({
      id: post.id,
      text: compactText(post.analysis || post.summaryEn, 180),
      handle: post.handle,
      name: post.name,
      topic: post.primaryTopic,
      url: post.url
    }));
  return {
    date: issue.date,
    builderCount: issue.builderCount,
    postCount: issue.postCount,
    topTopics: issue.topTopics,
    summary: issue.summary,
    highlights: highlightPosts
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceMeta(html, { title, description, canonical, type = 'website', bodyView = 'latest', bodyFilter = '', issueDate = '', structuredData }) {
  const replacements = [
    [/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`],
    [/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">`],
    [/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${type}">`],
    [/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(title)}">`],
    [/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeHtml(description)}">`],
    [/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escapeHtml(canonical)}">`],
    [/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${escapeHtml(title)}">`],
    [/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${escapeHtml(description)}">`],
    [/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${escapeHtml(canonical)}">`],
    [/<body data-issue-date="[^"]*" data-view="[^"]*" data-filter="[^"]*">/, `<body data-issue-date="${escapeHtml(issueDate)}" data-view="${escapeHtml(bodyView)}" data-filter="${escapeHtml(bodyFilter)}">`],
    [/<script type="application\/ld\+json" id="structuredData">[\s\S]*?<\/script>/, `<script type="application/ld+json" id="structuredData">${JSON.stringify(structuredData)}</script>`]
  ];
  return replacements.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), html);
}

async function writeDatedPages(template, issues) {
  for (const issue of issues) {
    const canonical = `${SITE_URL}/daily/${issue.date}/`;
    const description = compactText(issue.summary, 150);
    const title = `${issue.date} AI Builder 情报日报 — Builders Daily`;
    const html = replaceMeta(template, {
      title,
      description,
      canonical,
      type: 'article',
      issueDate: issue.date,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: title,
        description,
        datePublished: issue.date,
        dateModified: issue.date,
        mainEntityOfPage: canonical,
        author: { '@type': 'Organization', name: 'Builders Daily' },
        publisher: { '@type': 'Organization', name: 'Builders Daily', url: SITE_URL }
      }
    });
    const outputDir = path.join(DAILY_DIR, issue.date);
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, 'index.html'), html, 'utf8');
  }
}

function buildBuilderDirectory(issues, profiles) {
  const builders = new Map();
  profiles.map(normalizeProfile).filter((profile) => profile.handle).forEach((profile) => {
    builders.set(profile.handle.toLowerCase(), { ...profile, signalCount: 0, posts: [] });
  });

  for (const issue of issues) {
    for (const post of issue.posts) {
      const key = post.handle.toLowerCase();
      if (!builders.has(key)) {
        builders.set(key, {
          handle: post.handle,
          slug: slugify(post.handle),
          name: post.name,
          role: post.role,
          summary: post.role,
          avatar: post.avatar,
          verified: post.verified,
          signalCount: 0,
          posts: []
        });
      }
      const builder = builders.get(key);
      builder.signalCount += 1;
      if (builder.posts.length < 100) builder.posts.push(compactPost(post));
    }
  }

  return [...builders.values()].sort((a, b) => b.signalCount - a.signalCount || a.name.localeCompare(b.name, 'zh-CN'));
}

function buildTopicDirectory(issues) {
  return Object.entries(TOPIC_DEFINITIONS)
    .map(([key, definition]) => {
      const posts = [];
      let signalCount = 0;
      for (const issue of issues) {
        for (const post of issue.posts) {
          if (!post.topics.includes(key)) continue;
          signalCount += 1;
          if (posts.length < 240) posts.push(compactPost(post));
        }
      }
      return {
        key,
        slug: slugify(key),
        label: definition.label,
        signalCount,
        summary: `汇总 Builder 讨论中与「${definition.label}」相关的连续信号，帮助判断这个方向正在发生什么变化。`,
        posts
      };
    })
    .filter((topic) => topic.signalCount > 0)
    .sort((a, b) => b.signalCount - a.signalCount);
}

async function writeEntityPages(template, builders, topics) {
  for (const builder of builders) {
    const canonical = `${SITE_URL}/builders/${builder.slug}/`;
    const title = `${builder.name} (@${builder.handle}) — Builders Daily`;
    const description = compactText(builder.summary || builder.role || `查看 ${builder.name} 的 Builder 信号时间线。`, 150);
    const html = replaceMeta(template, {
      title,
      description,
      canonical,
      bodyView: 'builder',
      bodyFilter: builder.handle,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        name: title,
        description,
        mainEntity: { '@type': 'Person', name: builder.name, alternateName: `@${builder.handle}` }
      }
    });
    const outputDir = path.join(BUILDERS_DIR, builder.slug);
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(outputDir, 'index.html'), html, 'utf8'),
      writeFile(path.join(outputDir, 'data.json'), `${JSON.stringify(builder)}\n`, 'utf8')
    ]);
  }

  for (const topic of topics) {
    const canonical = `${SITE_URL}/topics/${topic.slug}/`;
    const title = `${topic.label} Builder 信号时间线 — Builders Daily`;
    const description = compactText(topic.summary, 150);
    const html = replaceMeta(template, {
      title,
      description,
      canonical,
      bodyView: 'topic',
      bodyFilter: topic.key,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url: canonical
      }
    });
    const outputDir = path.join(TOPICS_DIR, topic.slug);
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(outputDir, 'index.html'), html, 'utf8'),
      writeFile(path.join(outputDir, 'data.json'), `${JSON.stringify(topic)}\n`, 'utf8')
    ]);
  }
}

function sitemapXml(issues, builders, topics) {
  const paths = [
    { loc: '/', lastmod: issues[0]?.date },
    ...issues.map((issue) => ({ loc: `/daily/${issue.date}/`, lastmod: issue.date })),
    ...builders.map((builder) => ({ loc: `/builders/${builder.slug}/`, lastmod: issues[0]?.date })),
    ...topics.map((topic) => ({ loc: `/topics/${topic.slug}/`, lastmod: issues[0]?.date }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((item) => `  <url><loc>${SITE_URL}${item.loc}</loc>${item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

export async function buildSite() {
  const [template, profilesSource, currentDataSource] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, 'index.html'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'profiles.json'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'data.json'), 'utf8')
  ]);
  const profiles = JSON.parse(profilesSource);
  const currentData = JSON.parse(currentDataSource);
  const reportFiles = (await readdir(REPORTS_DIR))
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.md$/.test(file))
    .sort()
    .reverse();
  if (!reportFiles.length) throw new Error(`No report files found in ${REPORTS_DIR}`);

  const latestDate = process.env.BUILDERS_DAILY_DATE || reportFiles[0].replace(/\.md$/, '');
  const issues = [];
  for (const filename of reportFiles) {
    const date = filename.replace(/\.md$/, '');
    const source = await readFile(path.join(REPORTS_DIR, filename), 'utf8');
    issues.push(parseReport(source, date, profiles));
  }

  const currentIssue = normalizeCurrentData(currentData, latestDate, profiles);
  const currentIndex = issues.findIndex((issue) => issue.date === latestDate);
  if (currentIndex >= 0) issues[currentIndex] = currentIssue;
  else issues.unshift(currentIssue);
  issues.sort((a, b) => b.date.localeCompare(a.date));

  await Promise.all([ARCHIVE_DIR, DAILY_DIR, BUILDERS_DIR, TOPICS_DIR].map((directory) => mkdir(directory, { recursive: true })));
  for (const issue of issues) {
    await writeFile(path.join(ARCHIVE_DIR, `${issue.date}.json`), `${JSON.stringify(issue, null, 2)}\n`, 'utf8');
  }

  const archive = issues.map(archiveEntry);
  const builders = buildBuilderDirectory(issues, profiles);
  const topics = buildTopicDirectory(issues);
  const postCount = issues.reduce((total, issue) => total + issue.posts.length, 0);
  const builderIndex = builders.map(({ posts, ...builder }) => builder);
  const topicIndex = topics.map(({ posts, ...topic }) => topic);

  await Promise.all([
    writeFile(path.join(ARCHIVE_DIR, 'index.json'), `${JSON.stringify(archive, null, 2)}\n`, 'utf8'),
    writeFile(path.join(BUILDERS_DIR, 'index.json'), `${JSON.stringify(builderIndex, null, 2)}\n`, 'utf8'),
    writeFile(path.join(TOPICS_DIR, 'index.json'), `${JSON.stringify(topicIndex, null, 2)}\n`, 'utf8'),
    writeFile(path.join(PROJECT_ROOT, 'sitemap.xml'), sitemapXml(issues, builders, topics), 'utf8')
  ]);

  await writeDatedPages(template, issues);
  await writeEntityPages(template, builders, topics);

  return {
    issueCount: issues.length,
    postCount,
    builderCount: builders.length,
    topicCount: topics.length,
    latestDate
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  buildSite()
    .then((stats) => {
      console.log(`Built Builders Daily: ${stats.issueCount} issues, ${stats.postCount} posts, ${stats.builderCount} builders, ${stats.topicCount} topics. Latest: ${stats.latestDate}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
