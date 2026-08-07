const CONFIG = window.BUILDERS_DAILY_CONFIG || {};

const TOPIC_DEFINITIONS = {
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
  other: {
    label: '其他',
    keywords: []
  }
};

const STORAGE_KEYS = {
  followed: 'builders-daily:followed:v2',
  events: 'builders-daily:events:v2'
};

const state = {
  issue: null,
  archive: [],
  profiles: [],
  builderDirectory: [],
  visiblePosts: [],
  followed: new Set(),
  archiveLimit: 9,
  builderLimit: 12,
  readerPost: null,
  collectionMode: '',
  collectionTrigger: null,
  observedPosts: new Set(),
  firstContentTracked: false
};

const elements = {};
let toastTimer = null;
let cardObserver = null;

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return String(value || '');
  }
}

function loadJsonStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function persistFollowed() {
  localStorage.setItem(STORAGE_KEYS.followed, JSON.stringify([...state.followed]));
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function postId(post) {
  const match = String(post.url || '').match(/status\/(\d+)/);
  return match?.[1] || `${slugify(post.handle)}-${hashText(post.summaryEn || post.summary || '')}`;
}

function avatarFor(name, handle) {
  const cleanName = String(name || '').trim();
  if (/^[\u4e00-\u9fff]/.test(cleanName)) {
    return cleanName.slice(0, 2);
  }
  const initials = cleanName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return initials || String(handle || 'BD').slice(0, 2).toUpperCase();
}

function inferTopics(post) {
  if (Array.isArray(post.topics) && post.topics.length) {
    return [...new Set(post.topics.filter((topic) => TOPIC_DEFINITIONS[topic]))];
  }

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

function normalizePost(rawPost, date = '') {
  const post = rawPost || {};
  const normalized = {
    id: String(post.id || postId(post)),
    date: String(post.date || date || ''),
    name: String(post.name || post.handle || 'Unknown Builder').trim(),
    handle: String(post.handle || '').replace(/^@/, '').trim(),
    role: String(post.role || '').trim(),
    avatar: String(post.avatar || avatarFor(post.name, post.handle)).trim(),
    summary: String(post.summary || post.summaryEn || '').trim(),
    summaryEn: String(post.summaryEn || post.summary || '').trim(),
    analysis: String(post.analysis || '').trim(),
    url: String(post.url || '').trim(),
    verified: Boolean(post.verified),
    hotComments: Array.isArray(post.hotComments) ? post.hotComments : []
  };
  normalized.topics = inferTopics({ ...post, ...normalized });
  normalized.primaryTopic = normalized.topics[0] || 'other';
  return normalized;
}

function scorePost(post) {
  const text = `${post.summaryEn || ''} ${post.analysis || ''}`;
  let score = Math.min(text.length, 800) / 80;
  if (post.analysis?.length > 100) score += 4;
  if (post.verified) score += 1;
  if (post.topics.some((topic) => ['agent', 'product', 'design', 'business', 'infrastructure'].includes(topic))) score += 2;
  if (/\b(launch|release|built|ship|workflow|product)\b|发布|推出|开源|工作流|产品|构建/i.test(text)) score += 2;
  if (/政治|遇害|财报后|咳醒|吃饭|旅游|politic|murder/i.test(text)) score -= 5;
  return score;
}

function selectHighlights(posts, count = 3) {
  const ranked = [...posts].sort((a, b) => scorePost(b) - scorePost(a));
  const selected = [];
  const usedHandles = new Set();
  const usedTopics = new Set();

  for (const post of ranked) {
    const handleKey = post.handle.toLowerCase();
    if (usedHandles.has(handleKey) && selected.length < count - 1) continue;
    const addsTopic = post.topics.some((topic) => !usedTopics.has(topic));
    if (!addsTopic && selected.length < count - 1 && ranked.length > count + 2) continue;
    selected.push(post);
    usedHandles.add(handleKey);
    post.topics.forEach((topic) => usedTopics.add(topic));
    if (selected.length === count) break;
  }

  for (const post of ranked) {
    if (selected.length === count) break;
    if (!selected.some((item) => item.id === post.id)) selected.push(post);
  }
  return selected;
}

function summarizeIssue(posts) {
  const topicCounts = countTopics(posts);
  const topTopics = Object.entries(topicCounts)
    .filter(([topic]) => topic !== 'other')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => TOPIC_DEFINITIONS[topic].label);
  if (!topTopics.length) return '今天的 Builder 动态已整理完毕。打开任意条目查看原始内容与判断。';
  return `今天的高频信号集中在${topTopics.join('、')}。与其逐条追逐更新，更值得关注这些方向是否在不同 Builder 的独立实践中反复出现。`;
}

function normalizeIssue(raw, fallbackDate = '') {
  if (Array.isArray(raw)) {
    const summaryItem = raw.find((item) => item?.isSummary);
    const posts = raw.filter((item) => item && !item.isSummary).map((item) => normalizePost(item, fallbackDate));
    return {
      date: fallbackDate,
      posts,
      summary: String(summaryItem?.summaryEn || summaryItem?.summary || summarizeIssue(posts)),
      highlights: selectHighlights(posts).map((post) => post.id),
      builderCount: new Set(posts.map((post) => post.handle.toLowerCase()).filter(Boolean)).size,
      postCount: posts.length
    };
  }

  const date = String(raw?.date || fallbackDate || '');
  const posts = Array.isArray(raw?.posts) ? raw.posts.map((post) => normalizePost(post, date)) : [];
  return {
    ...raw,
    date,
    posts,
    summary: String(raw?.summary || summarizeIssue(posts)),
    highlights: Array.isArray(raw?.highlights)
      ? raw.highlights.map((item) => typeof item === 'string' ? item : item.id).filter(Boolean)
      : selectHighlights(posts).map((post) => post.id),
    builderCount: Number(raw?.builderCount) || new Set(posts.map((post) => post.handle.toLowerCase()).filter(Boolean)).size,
    postCount: Number(raw?.postCount) || posts.length
  };
}

function countTopics(posts) {
  return posts.reduce((counts, post) => {
    post.topics.forEach((topic) => {
      counts[topic] = (counts[topic] || 0) + 1;
    });
    return counts;
  }, {});
}

function topicLabel(topic) {
  return TOPIC_DEFINITIONS[topic]?.label || TOPIC_DEFINITIONS.other.label;
}

function formatDate(date, style = 'long') {
  if (!date) return '最新一期';
  const parsed = new Date(`${date}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  if (style === 'compact') {
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(parsed);
  }
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(parsed)
    .replaceAll('/', '.');
}

function estimateReadingTime(posts) {
  const characters = posts.reduce((total, post) => total + post.summaryEn.length + post.analysis.length, 0);
  return Math.max(3, Math.min(15, Math.ceil(characters / 1200)));
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`无法加载 ${path} (${response.status})`);
  return response.json();
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

function track(eventName, properties = {}) {
  const payload = {
    event: eventName,
    properties: {
      ...properties,
      issueDate: state.issue?.date || '',
      path: window.location.pathname,
      view: document.body.dataset.view || 'latest'
    },
    timestamp: new Date().toISOString()
  };

  document.dispatchEvent(new CustomEvent('buildersdaily:track', { detail: payload }));
  if (typeof window.plausible === 'function') window.plausible(eventName, { props: payload.properties });
  if (window.posthog?.capture) window.posthog.capture(eventName, payload.properties);

  if (CONFIG.analyticsEndpoint && navigator.sendBeacon) {
    navigator.sendBeacon(CONFIG.analyticsEndpoint, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  }

  const localEvents = loadJsonStorage(STORAGE_KEYS.events, []);
  localEvents.push(payload);
  localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(localEvents.slice(-100)));
}

function cacheElements() {
  Object.assign(elements, {
    issueDate: $('#issueDate'),
    digestDate: $('#digestDate'),
    readingTime: $('#readingTime'),
    builderCount: $('#builderCount'),
    postCount: $('#postCount'),
    topicCount: $('#topicCount'),
    storyGrid: $('#storyGrid'),
    archiveGrid: $('#archiveGrid'),
    builderGrid: $('#builderGrid'),
    loadMoreArchive: $('#loadMoreArchive'),
    loadMoreBuilders: $('#loadMoreBuilders'),
    readingProgress: $('#readingProgress'),
    readerDialog: $('#readerDialog'),
    collectionDialog: $('#collectionDialog'),
    collectionDialogGrid: $('#collectionDialogGrid'),
    toast: $('#toast')
  });
}

async function loadCurrentView() {
  const requestedDate = document.body.dataset.issueDate;
  const view = document.body.dataset.view || 'latest';
  const filter = document.body.dataset.filter || '';

  document.body.classList.toggle('today-view', view === 'latest' && !requestedDate);
  document.body.classList.toggle('history-view', view === 'latest' && Boolean(requestedDate));
  document.body.classList.toggle('context-view', view === 'builder' || view === 'topic');
  document.body.classList.toggle('builder-view', view === 'builder');

  const [archive, profiles] = await Promise.all([
    fetchJson('/archive/index.json').catch(() => []),
    fetchJson('/profiles.json').catch(() => [])
  ]);
  state.archive = Array.isArray(archive) ? archive : [];
  state.profiles = Array.isArray(profiles) ? profiles : [];

  if (view === 'builder' && filter) {
    const builder = await fetchJson(`/builders/${slugify(filter)}/data.json`);
    if (!builder) throw new Error('找不到这位 Builder 的归档');
    applyContextHero('builder', builder);
    return normalizeIssue({
      date: state.archive[0]?.date || '',
      posts: builder.posts || [],
      summary: builder.summary || builder.role || '',
      highlights: (builder.posts || []).slice(0, 3).map((post) => post.id),
      builderCount: 1,
      postCount: (builder.posts || []).length,
      context: { type: 'builder', value: `${builder.name} (@${builder.handle})`, handle: builder.handle }
    });
  }

  if (view === 'topic' && filter) {
    const topic = await fetchJson(`/topics/${slugify(filter)}/data.json`);
    if (!topic) throw new Error('找不到这个主题的归档');
    applyContextHero('topic', topic);
    return normalizeIssue({
      date: state.archive[0]?.date || '',
      posts: topic.posts || [],
      summary: topic.summary || '',
      highlights: (topic.posts || []).slice(0, 3).map((post) => post.id),
      builderCount: new Set((topic.posts || []).map((post) => post.handle)).size,
      postCount: (topic.posts || []).length,
      context: { type: 'topic', value: `${topic.label} Builder 信号时间线`, key: topic.key }
    });
  }

  const latestDate = state.archive[0]?.date || requestedDate || '';
  if (requestedDate) {
    const issue = normalizeIssue(await fetchJson(`/archive/${requestedDate}.json`), requestedDate);
    applyHistoryHero(issue);
    return issue;
  }
  return normalizeIssue(await fetchJson('/data.json'), latestDate);
}

function applyHistoryHero(issue) {
  $('.hero-copy .eyebrow').textContent = 'ARCHIVE ISSUE';
  $('#heroTitle').innerHTML = `<span>${escapeHtml(formatDate(issue.date))}</span><em>历史日报。</em>`;
  $('.hero-deck').textContent = issue.summary || '回到这一天，查看当时最值得保留的 Builder 信号。';
  $('#startReading').textContent = '阅读本期';
}

function applyContextHero(type, context) {
  const eyebrow = $('.hero-copy .eyebrow');
  const title = $('#heroTitle');
  const deck = $('.hero-deck');
  const stamp = $('.issue-stamp');
  const archiveSection = $('#archive');
  if (type === 'builder') {
    [eyebrow, title, deck, $('.hero-actions')].forEach((element) => element?.remove());
    const hero = $('#today');
    hero.removeAttribute('aria-labelledby');
    hero.setAttribute('aria-label', `${context.name} Builder 动态概览`);
    stamp.querySelector('time').textContent = `@${context.handle}`;
  } else {
    eyebrow.textContent = 'TOPIC TIMELINE';
    title.innerHTML = `${escapeHtml(context.label)}，<br><em>正在如何变化。</em>`;
    deck.textContent = context.summary || `从不同 Builder 的连续动态中观察 ${context.label}。`;
    stamp.querySelector('time').textContent = '主题时间线';
  }
  archiveSection.hidden = true;
}

function renderPage() {
  const issue = state.issue;
  const topics = countTopics(issue.posts);
  const activeTopics = Object.keys(topics).filter((topic) => topic !== 'other');
  const contextual = Boolean(issue.context);

  if (!contextual) elements.issueDate.textContent = formatDate(issue.date);
  elements.readingTime.textContent = `约 ${estimateReadingTime(issue.posts)} 分钟`;
  elements.builderCount.textContent = issue.builderCount;
  elements.postCount.textContent = issue.postCount;
  elements.topicCount.textContent = activeTopics.length || 1;
  const isHistorical = document.body.classList.contains('history-view');
  const isContext = document.body.classList.contains('context-view');
  const digestSection = $('#digest');
  $('.digest-heading').hidden = isHistorical;
  elements.digestDate.hidden = isHistorical || isContext;
  if (!elements.digestDate.hidden) {
    elements.digestDate.dateTime = issue.date;
    elements.digestDate.textContent = formatDate(issue.date);
  }
  if (isHistorical) {
    digestSection.removeAttribute('aria-labelledby');
    digestSection.setAttribute('aria-label', `${formatDate(issue.date)} 历史信息存档`);
  }
  $('#digestTitle').textContent = isHistorical
    ? '本期目录'
    : isContext
      ? '时间线'
      : `今日（${issue.posts.length} 条）`;

  state.visiblePosts = [...issue.posts];
  renderStories();
  if (!isHistorical) renderArchive();
  updateMetadata();
  maybeOpenLinkedPost();
  track('page_view', { postCount: issue.postCount, builderCount: issue.builderCount });
}

function updateMetadata() {
  const context = state.issue.context;
  const title = context
    ? `${context.value} — Builders Daily`
    : `${formatDate(state.issue.date)} AI Builder 情报日报 — Builders Daily`;
  const description = state.issue.summary.slice(0, 150);
  document.title = title;
  $('meta[name="description"]')?.setAttribute('content', description);
  $('meta[property="og:title"]')?.setAttribute('content', title);
  $('meta[property="og:description"]')?.setAttribute('content', description);
}

function compactText(text, limit = 180) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}

function renderStories() {
  if (cardObserver) cardObserver.disconnect();
  elements.storyGrid.classList.add('compact');
  const isHistorical = document.body.classList.contains('history-view');
  const isToday = document.body.classList.contains('today-view');
  elements.storyGrid.innerHTML = state.visiblePosts.map((post, index) => {
    const isHighlighted = isToday && state.issue.highlights?.includes(post.id);
    const builderIdentity = isHistorical
      ? `<p class="history-byline">${escapeHtml(post.name)} · @${escapeHtml(post.handle)}</p>`
      : isToday
        ? `<div class="story-builder">
          <span class="builder-avatar" aria-hidden="true">${escapeHtml(post.avatar || avatarFor(post.name, post.handle))}</span>
          <span class="builder-identity">
            <strong>${escapeHtml(post.name)}${post.verified ? ' ✓' : ''}</strong>
            <span>@${escapeHtml(post.handle)}</span>
          </span>
        </div>`
        : `<a class="story-builder" href="/builders/${slugify(post.handle)}/" data-builder-link="${escapeHtml(post.handle)}">
        <span class="builder-avatar" aria-hidden="true">${escapeHtml(post.avatar || avatarFor(post.name, post.handle))}</span>
        <span class="builder-identity">
          <strong>${escapeHtml(post.name)}${post.verified ? ' ✓' : ''}</strong>
          <span>@${escapeHtml(post.handle)}</span>
        </span>
      </a>`;
    return `
    <article class="story-card" data-post-id="${escapeHtml(post.id)}" data-primary-topic="${escapeHtml(post.primaryTopic)}"${isToday ? ` data-reader-card="${escapeHtml(post.id)}" role="button" tabindex="0" aria-label="打开 ${escapeHtml(post.name)} 的深度阅读"` : ''}>
      <div class="story-card-top">
        <span class="story-number">${String(index + 1).padStart(2, '0')}</span>
        ${isHighlighted ? '<span class="story-highlight" role="img" aria-label="值得阅读" title="值得阅读">★</span>' : ''}
      </div>
      ${builderIdentity}
      <p class="story-copy">${escapeHtml(post.summaryEn || post.summary)}</p>
      ${isHistorical || isToday ? '' : `<div class="story-card-actions"><button class="read-action" type="button" data-open-post="${escapeHtml(post.id)}">深度阅读</button></div>`}
    </article>
  `;
  }).join('');
  observeCards();
}

function observeCards() {
  cardObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
      const id = entry.target.dataset.postId;
      if (!state.observedPosts.has(id)) {
        state.observedPosts.add(id);
        track('card_view', { postId: id, position: state.visiblePosts.findIndex((post) => post.id === id) + 1 });
      }
      if (!state.firstContentTracked) {
        state.firstContentTracked = true;
        track('first_content_view', { postId: id });
      }
      const progress = state.visiblePosts.length ? state.observedPosts.size / state.visiblePosts.length : 0;
      elements.readingProgress.style.width = `${Math.min(100, progress * 100)}%`;
    });
  }, { threshold: [0.5] });
  $$('.story-card', elements.storyGrid).forEach((card) => cardObserver.observe(card));
}

function archiveCardsMarkup(issues) {
  return issues.map((issue) => {
    const highlight = issue.highlights?.[0]?.text || issue.summary || '打开本期，查看完整 Builder 信号。';
    return `
      <a class="archive-card" href="/daily/${escapeHtml(issue.date)}/" data-archive-date="${escapeHtml(issue.date)}">
        <div class="archive-date">
          <time datetime="${escapeHtml(issue.date)}">${escapeHtml(formatDate(issue.date))}</time>
          <span>${Number(issue.builderCount) || 0} BUILDERS · ${Number(issue.postCount) || 0} POSTS</span>
        </div>
        <p class="archive-highlight">${escapeHtml(compactText(highlight, 150))}</p>
        <div class="archive-topics">${(issue.topTopics || []).slice(0, 3).map((topic) => `<span>${escapeHtml(topicLabel(topic))}</span>`).join('')}</div>
      </a>
    `;
  }).join('');
}

function renderArchive() {
  if (!state.archive.length) {
    elements.archiveGrid.innerHTML = '<div class="error-panel"><h3>归档正在生成</h3><p>运行 npm run build 后，这里会显示历史日报。</p></div>';
    elements.loadMoreArchive.hidden = true;
    return;
  }
  elements.archiveGrid.innerHTML = archiveCardsMarkup(state.archive.slice(0, state.archiveLimit));
  elements.loadMoreArchive.hidden = state.archiveLimit >= state.archive.length;
}

async function ensureBuilderDirectory() {
  if (state.builderDirectory.length) return;
  try {
    const directory = await fetchJson('/builders/index.json');
    state.builderDirectory = Array.isArray(directory) ? directory : [];
  } catch {
    state.builderDirectory = state.profiles.map((profile) => ({
      ...profile,
      handle: String(profile.handle || '').replace(/^@/, ''),
      slug: slugify(profile.handle),
      summary: profile.summary || profile.role || profile.bio || '',
      signalCount: state.issue.posts.filter((post) => post.handle.toLowerCase() === String(profile.handle || '').replace(/^@/, '').toLowerCase()).length,
      posts: []
    }));
  }
}

function builderCardsMarkup(builders) {
  return builders.map((builder) => {
    const handle = String(builder.handle || '').replace(/^@/, '');
    const followed = state.followed.has(handle.toLowerCase());
    return `
      <article class="builder-card">
        <div class="builder-card-head">
          <span class="builder-avatar" aria-hidden="true">${escapeHtml(builder.avatar || avatarFor(builder.name, handle))}</span>
          <button class="follow-button${followed ? ' is-followed' : ''}" type="button" data-follow-builder="${escapeHtml(handle)}" aria-pressed="${followed}">${followed ? '已关注' : '+ 关注'}</button>
        </div>
        <a href="/builders/${escapeHtml(builder.slug || slugify(handle))}/" data-builder-link="${escapeHtml(handle)}">
          <h3>${escapeHtml(builder.name || handle)}</h3>
          <p class="builder-handle">@${escapeHtml(handle)}</p>
          <p class="builder-role">${escapeHtml(builder.summary || builder.role || '持续追踪中的 AI Builder。')}</p>
          <p class="builder-signal-count">${Number(builder.signalCount || builder.posts?.length) || 0} 条归档信号 →</p>
        </a>
      </article>
    `;
  }).join('');
}

function renderBuilders() {
  const builders = state.builderDirectory;
  const visible = builders.slice(0, state.builderLimit);
  elements.builderGrid.innerHTML = builderCardsMarkup(visible)
    || '<div class="error-panel"><h3>没有匹配的 Builder</h3><p>换个名字、Handle 或方向试试。</p></div>';
  elements.loadMoreBuilders.hidden = state.builderDirectory.length <= state.builderLimit;
}

function renderCollectionDialog() {
  if (state.collectionMode === 'archive') {
    $('#collectionDialogEyebrow').textContent = 'ALL ISSUES';
    $('#collectionDialogTitle').textContent = '全部期刊';
    $('#collectionDialogDescription').textContent = `${state.archive.length} 期日报，按日期由近到远排列。`;
    elements.collectionDialogGrid.className = 'archive-grid collection-grid';
    elements.collectionDialogGrid.innerHTML = archiveCardsMarkup(state.archive);
    return;
  }

  $('#collectionDialogEyebrow').textContent = 'BUILDER DIRECTORY';
  $('#collectionDialogTitle').textContent = '完整 Builder 名单';
  $('#collectionDialogDescription').textContent = `${state.builderDirectory.length} 位持续追踪中的 Builder。`;
  elements.collectionDialogGrid.className = 'builder-grid collection-grid';
  elements.collectionDialogGrid.innerHTML = builderCardsMarkup(state.builderDirectory);
}

function openCollectionDialog(mode, trigger) {
  state.collectionMode = mode;
  state.collectionTrigger = trigger || null;
  renderCollectionDialog();
  elements.collectionDialog.showModal();
  requestAnimationFrame(() => {
    $('.collection-body', elements.collectionDialog).scrollTop = 0;
    $('.dialog-close', elements.collectionDialog)?.focus();
  });
  track(mode === 'archive' ? 'archive_directory_open' : 'builder_directory_open', {
    count: mode === 'archive' ? state.archive.length : state.builderDirectory.length
  });
}

function buildInsight(post) {
  const analysis = compactText(post.analysis, 560);
  const sentences = analysis.match(/[^。！？!?]+[。！？!?]?/g)?.map((item) => item.trim()).filter(Boolean) || [];
  const sourceText = compactText(post.summaryEn || post.summary, 220);
  const conclusion = sentences[0] || sourceText;
  const why = sentences.slice(1).join('') || `这条动态与「${topicLabel(post.primaryTopic)}」相关。它的价值不只在单次更新，而在于是否与其他 Builder 的独立实践形成重复信号。`;
  return {
    conclusion: compactText(conclusion, 180),
    why: compactText(why, 420)
  };
}

function openReader(post, options = {}) {
  if (!post) return;
  state.readerPost = post;
  const insight = buildInsight(post);
  $('#readerTopic').textContent = topicLabel(post.primaryTopic).toUpperCase();
  $('#readerTitle').textContent = post.name;
  $('#readerMeta').textContent = `@${post.handle} · ${formatDate(post.date || state.issue.date)}`;
  $('#readerOriginal').textContent = post.summaryEn || post.summary;
  $('#readerConclusion').textContent = insight.conclusion;
  $('#readerWhy').textContent = insight.why;
  $('#readerSource').href = post.url || '#';
  $('#readerSource').hidden = !post.url;
  elements.readerDialog.showModal();
  if (!options.preserveUrl) updatePostUrl(post);
  track('deep_read_open', { postId: post.id, topic: post.primaryTopic, handle: post.handle });
}

function updatePostUrl(post) {
  if (!post.date && !state.issue.date) return;
  const url = new URL(window.location.href);
  url.searchParams.set('post', post.id);
  history.replaceState({ postId: post.id }, '', url);
}

function clearPostUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('post')) return;
  url.searchParams.delete('post');
  history.replaceState({}, '', url);
}

function maybeOpenLinkedPost() {
  if (document.body.classList.contains('history-view')) return;
  const postIdFromUrl = new URLSearchParams(window.location.search).get('post');
  if (!postIdFromUrl) return;
  const post = state.issue.posts.find((item) => item.id === postIdFromUrl);
  if (post) requestAnimationFrame(() => openReader(post, { preserveUrl: true }));
}

function toggleFollow(handle) {
  const key = String(handle || '').toLowerCase();
  if (!key) return;
  if (state.followed.has(key)) {
    state.followed.delete(key);
    track('unfollow_builder', { handle: key });
    showToast(`已取消关注 @${handle}`);
  } else {
    state.followed.add(key);
    track('follow_builder', { handle: key });
    showToast(`已关注 @${handle}`);
  }
  persistFollowed();
  renderBuilders();
  if (state.collectionMode === 'builders' && elements.collectionDialog.open) renderCollectionDialog();
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const openPostButton = event.target.closest('[data-open-post]');
    if (openPostButton) {
      const post = state.issue.posts.find((item) => item.id === openPostButton.dataset.openPost);
      openReader(post);
      return;
    }

    const readerCard = event.target.closest('[data-reader-card]');
    const hasSelection = window.getSelection()?.toString().trim();
    if (readerCard && !event.target.closest('a, button, input, textarea, select') && !hasSelection) {
      const post = state.issue.posts.find((item) => item.id === readerCard.dataset.readerCard);
      openReader(post);
      return;
    }

    const followButton = event.target.closest('[data-follow-builder]');
    if (followButton) {
      toggleFollow(followButton.dataset.followBuilder);
      return;
    }

    const archiveLink = event.target.closest('[data-archive-date]');
    if (archiveLink) track('archive_open', { date: archiveLink.dataset.archiveDate });
    const builderLink = event.target.closest('[data-builder-link]');
    if (builderLink) track('builder_profile_open', { handle: builderLink.dataset.builderLink });
  });

  document.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key) || !event.target.matches('[data-reader-card]')) return;
    event.preventDefault();
    const post = state.issue.posts.find((item) => item.id === event.target.dataset.readerCard);
    openReader(post);
  });

  elements.loadMoreArchive.addEventListener('click', (event) => {
    openCollectionDialog('archive', event.currentTarget);
  });
  elements.loadMoreBuilders.addEventListener('click', (event) => {
    openCollectionDialog('builders', event.currentTarget);
  });
  $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  [elements.readerDialog, elements.collectionDialog].forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
  elements.readerDialog.addEventListener('close', () => {
    state.readerPost = null;
    clearPostUrl();
  });
  elements.collectionDialog.addEventListener('close', () => {
    const trigger = state.collectionTrigger;
    state.collectionMode = '';
    state.collectionTrigger = null;
    elements.collectionDialogGrid.innerHTML = '';
    trigger?.focus({ preventScroll: true });
  });

  $('#readerSource').addEventListener('click', () => {
    if (state.readerPost) track('source_open', { postId: state.readerPost.id, handle: state.readerPost.handle });
  });

  window.addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return;
    const pageProgress = Math.min(1, window.scrollY / max);
    if (!state.visiblePosts.length) elements.readingProgress.style.width = `${pageProgress * 100}%`;
  }, { passive: true });
}

function renderLoadingState() {
  elements.storyGrid.innerHTML = '<div class="loading-card"></div><div class="loading-card"></div><div class="loading-card"></div><div class="loading-card"></div>';
}

function renderFatalError(error) {
  console.error(error);
  elements.storyGrid.innerHTML = `
    <div class="error-panel">
      <h3>日报暂时没有加载出来</h3>
      <p>${escapeHtml(error?.message || '请刷新页面重试。')}</p>
      <button class="button button-primary" type="button" onclick="location.reload()">重新加载</button>
    </div>
  `;
}

async function init() {
  cacheElements();
  state.followed = new Set(loadJsonStorage(STORAGE_KEYS.followed, []).map((handle) => String(handle).toLowerCase()));
  renderLoadingState();

  try {
    bindEvents();
    state.issue = await loadCurrentView();
    if (!document.body.classList.contains('history-view')) await ensureBuilderDirectory();
    renderPage();
    if (!document.body.classList.contains('history-view')) renderBuilders();
  } catch (error) {
    renderFatalError(error);
  }
}

init();
