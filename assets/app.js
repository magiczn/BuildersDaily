const CONFIG = window.BUILDERS_DAILY_CONFIG || {};

const TOPIC_DEFINITIONS = {
  agent: { label: 'Agents', keywords: ['agent', 'agents', 'agentic', '智能体', '代理', 'harness', 'skill', 'mcp', 'memory'] },
  product: { label: '产品', keywords: ['product', '产品', '用户', '体验', '交互', 'workflow', '工作流', 'app', 'feature'] },
  model: { label: '模型', keywords: ['model', '模型', 'gpt', 'claude', 'gemini', 'qwen', 'kimi', 'deepseek', 'token'] },
  design: { label: '设计', keywords: ['design', '设计', 'ui', 'ux', 'frontend', 'interface', 'canvas', 'prototype', '3d'] },
  business: { label: '商业', keywords: ['business', '商业', 'startup', '创业', 'revenue', 'pricing', 'market', '投资', '融资'] },
  infrastructure: { label: '基础设施', keywords: ['api', 'cloud', 'infra', 'deployment', '数据库', '算力', 'gpu', 'security', '安全'] },
  media: { label: '内容与媒体', keywords: ['video', 'image', 'content', 'creator', '视频', '图像', '内容', '创作者', '分发'] },
  enterprise: { label: '企业 AI', keywords: ['enterprise', '企业', 'organization', '组织', 'company', 'team', 'governance'] },
  other: { label: '其他', keywords: [] }
};

const STORAGE_KEYS = {
  events: 'builders-daily:events:v2',
  celebrated: 'builders-daily:celebrated:v1'
};

const state = {
  issue: null,
  archive: [],
  builders: [],
  mode: 'today',
  items: [],
  positions: [],
  cards: [],
  activeIndex: 0,
  renderedActiveIndex: -1,
  focusFromIndex: -1,
  focusToIndex: -1,
  focusProgress: 1,
  camera: { x: 0, y: 0, zoom: 0.82 },
  cameraAnimation: 0,
  focusBackdropTimer: 0,
  observedPosts: new Set(),
  completionCelebrated: false,
  readTimer: 0,
  dragging: null,
  isHome: false,
  contextType: '',
  resizeFrame: 0,
  sceneFrame: 0,
  stageRect: null
};

const elements = {};
let toastTimer = 0;

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loadJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
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
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function postId(post) {
  return String(post.url || '').match(/status\/(\d+)/)?.[1]
    || `${slugify(post.handle)}-${hashText(post.summaryEn || post.summary || '')}`;
}

function avatarFor(name, handle) {
  const cleanName = String(name || '').trim();
  if (/^[\u4e00-\u9fff]/.test(cleanName)) return cleanName.slice(0, 2);
  const initials = cleanName.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return initials || String(handle || 'BD').slice(0, 2).toUpperCase();
}

function inferTopics(post) {
  if (Array.isArray(post.topics) && post.topics.length) {
    return [...new Set(post.topics.filter((topic) => TOPIC_DEFINITIONS[topic]))];
  }
  const haystack = [post.summary, post.summaryEn, post.analysis, post.role].filter(Boolean).join(' ').toLowerCase();
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
    verified: Boolean(post.verified)
  };
  normalized.topics = inferTopics({ ...post, ...normalized });
  normalized.primaryTopic = normalized.topics[0] || 'other';
  return normalized;
}

function normalizeIssue(raw, fallbackDate = '') {
  if (Array.isArray(raw)) {
    const summaryItem = raw.find((item) => item?.isSummary);
    const posts = raw.filter((item) => item && !item.isSummary).map((item) => normalizePost(item, fallbackDate));
    return {
      date: fallbackDate,
      posts,
      summary: String(summaryItem?.summaryEn || summaryItem?.summary || ''),
      highlights: posts.slice(0, 3).map((post) => post.id),
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
    summary: String(raw?.summary || ''),
    highlights: Array.isArray(raw?.highlights)
      ? raw.highlights.map((item) => typeof item === 'string' ? item : item.id).filter(Boolean)
      : posts.slice(0, 3).map((post) => post.id),
    builderCount: Number(raw?.builderCount) || new Set(posts.map((post) => post.handle.toLowerCase()).filter(Boolean)).size,
    postCount: Number(raw?.postCount) || posts.length
  };
}

function topicLabel(topic) {
  return TOPIC_DEFINITIONS[topic]?.label || TOPIC_DEFINITIONS.other.label;
}

function formatDate(date) {
  if (!date) return '最新一期';
  const parsed = new Date(`${date}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(parsed)
    .replaceAll('/', '.');
}

function compactText(text, limit = 190) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`无法加载 ${path} (${response.status})`);
  return response.json();
}

function track(eventName, properties = {}) {
  const payload = {
    event: eventName,
    properties: {
      ...properties,
      issueDate: state.issue?.date || '',
      path: window.location.pathname,
      mode: state.mode
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
    stage: $('#spatialStage'),
    world: $('#spatialWorld'),
    title: $('#spaceTitle'),
    kicker: $('#spaceKicker'),
    meta: $('#spaceMeta'),
    status: $('#spatialStatus'),
    activeLabel: $('#activeLabel'),
    activePosition: $('#activePosition'),
    headerMode: $('#headerMode'),
    headerPosition: $('#headerPosition'),
    progress: $('#readingProgress'),
    orbit: $('.spatial-orbit'),
    celebration: $('#completionCelebration'),
    fireworks: $('#completionFireworks'),
    toast: $('#toast')
  });
}

async function loadSiteData() {
  const requestedDate = document.body.dataset.issueDate;
  const view = document.body.dataset.view || 'latest';
  const filter = document.body.dataset.filter || '';
  state.isHome = view === 'latest' && !requestedDate;

  const [archive, builders] = await Promise.all([
    fetchJson('/archive/index.json').catch(() => []),
    fetchJson('/builders/index.json').catch(() => [])
  ]);
  state.archive = Array.isArray(archive) ? archive : [];
  state.builders = Array.isArray(builders) ? builders : [];

  if (view === 'builder' && filter) {
    const builder = await fetchJson(`/builders/${slugify(filter)}/data.json`);
    state.contextType = 'profile';
    state.issue = normalizeIssue({
      date: state.archive[0]?.date || '',
      posts: builder.posts || [],
      summary: builder.summary || builder.role || '',
      highlights: (builder.posts || []).slice(0, 3).map((post) => post.id),
      builderCount: 1,
      postCount: (builder.posts || []).length,
      context: { type: 'profile', name: builder.name, handle: builder.handle }
    });
    return;
  }

  if (view === 'topic' && filter) {
    const topic = await fetchJson(`/topics/${slugify(filter)}/data.json`);
    state.contextType = 'topic';
    state.issue = normalizeIssue({
      date: state.archive[0]?.date || '',
      posts: topic.posts || [],
      summary: topic.summary || '',
      highlights: (topic.posts || []).slice(0, 3).map((post) => post.id),
      builderCount: new Set((topic.posts || []).map((post) => post.handle)).size,
      postCount: (topic.posts || []).length,
      context: { type: 'topic', name: topic.label, key: topic.key }
    });
    return;
  }

  if (requestedDate) {
    state.contextType = 'issue';
    state.issue = normalizeIssue(await fetchJson(`/archive/${requestedDate}.json`), requestedDate);
    return;
  }

  state.issue = normalizeIssue(await fetchJson('/data.json'), state.archive[0]?.date || '');
}

function modeCopy(mode) {
  if (mode === 'archive') {
    return { kicker: 'COMPOUNDING ARCHIVE', title: '归档', meta: `${state.archive.length} 期日报 · 由近到远` };
  }
  if (mode === 'builders') {
    return { kicker: 'BUILDER CONSTELLATION', title: 'Builders', meta: `${state.builders.length} 位持续追踪中的 Builder` };
  }
  if (mode === 'issue') {
    return { kicker: 'ARCHIVE ISSUE', title: formatDate(state.issue.date), meta: `${state.issue.posts.length} 条历史信号 · ${state.issue.builderCount} Builders` };
  }
  if (mode === 'profile') {
    return {
      kicker: 'BUILDER SIGNAL TRAIL',
      title: state.issue.context?.name || 'Builder',
      meta: `@${state.issue.context?.handle || ''} · ${state.issue.posts.length} 条归档信号`
    };
  }
  if (mode === 'topic') {
    return { kicker: 'TOPIC SIGNAL FIELD', title: state.issue.context?.name || '主题', meta: `${state.issue.posts.length} 条相关信号` };
  }
  return {
    kicker: `DAILY SIGNAL SPACE · ${formatDate(state.issue.date)}`,
    title: '今日',
    meta: `${state.issue.posts.length} 条动态 · ${state.issue.builderCount} Builders`
  };
}

function postsAsItems(posts, mode) {
  const highlights = new Set(state.issue.highlights || []);
  return posts.map((post, index) => ({
    id: post.id,
    type: 'signal',
    title: post.name,
    subtitle: `@${post.handle}`,
    body: post.summaryEn || post.summary,
    meta: topicLabel(post.primaryTopic),
    avatar: post.avatar || avatarFor(post.name, post.handle),
    url: post.url,
    action: '查看原文 ↗',
    external: true,
    featured: mode === 'today' && highlights.has(post.id),
    index
  }));
}

function itemsForMode(mode) {
  if (mode === 'archive') {
    return state.archive.map((issue, index) => ({
      id: issue.date,
      type: 'archive',
      title: formatDate(issue.date),
      subtitle: `${Number(issue.builderCount) || 0} BUILDERS · ${Number(issue.postCount) || 0} POSTS`,
      body: issue.summary || issue.highlights?.[0]?.text || '查看这一天的 Builder 信号。',
      meta: 'DAILY ISSUE',
      url: `/daily/${issue.date}/`,
      action: '打开本期 →',
      index
    }));
  }
  if (mode === 'builders') {
    return state.builders.map((builder, index) => {
      const handle = String(builder.handle || '').replace(/^@/, '');
      return {
        id: handle,
        type: 'builder',
        title: builder.name || handle,
        subtitle: `@${handle}`,
        body: builder.summary || builder.role || '持续追踪中的 AI Builder。',
        meta: `${Number(builder.signalCount || builder.posts?.length) || 0} SIGNALS`,
        avatar: builder.avatar || avatarFor(builder.name, handle),
        url: `/builders/${builder.slug || slugify(handle)}/`,
        action: '查看 Builder →',
        index
      };
    });
  }
  return postsAsItems(state.issue.posts, mode);
}

function buildPositions(items, mode) {
  if (!items.length) return [];
  const positions = [{ x: 0, y: 0, z: 0, tilt: 0 }];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const density = mode === 'archive' ? 410 : mode === 'builders' ? 460 : 520;
  const vertical = mode === 'archive' ? 0.72 : 0.78;
  for (let index = 1; index < items.length; index += 1) {
    const angle = index * goldenAngle - Math.PI / 2;
    const radius = Math.sqrt(index) * density;
    positions.push({
      x: Math.cos(angle) * radius * 1.16,
      y: Math.sin(angle) * radius * vertical,
      z: 55 + (index % 7) * 38 + Math.abs(Math.sin(angle)) * 90,
      tilt: Math.sin(angle * 1.7) * 2.4
    });
  }
  return positions;
}

function cardMarkup(item, index) {
  const number = String(index + 1).padStart(2, '0');
  const avatar = item.avatar
    ? `<span class="space-avatar" aria-hidden="true">${escapeHtml(item.avatar)}</span>`
    : '';
  const featured = item.featured
    ? '<span class="space-featured" role="img" aria-label="值得阅读" title="值得阅读">★</span>'
    : '';
  const target = item.external ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `
    <article class="space-card space-card--${escapeHtml(item.type)}" data-space-index="${index}" role="listitem">
      <button class="space-card-focus" type="button" data-focus-index="${index}" aria-label="聚焦 ${escapeHtml(item.title)}"></button>
      <div class="space-card-chrome">
        <span>${number}</span>
        <span>${escapeHtml(item.meta)}</span>
        ${featured}
      </div>
      <div class="space-card-identity">
        ${avatar}
        <div><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.subtitle)}</p></div>
      </div>
      <p class="space-card-copy">${escapeHtml(item.body)}</p>
      ${item.url ? `<a class="space-card-action" href="${escapeHtml(item.url)}"${target} data-item-action="${escapeHtml(item.id)}">${escapeHtml(item.action)}</a>` : ''}
    </article>`;
}

function renderMode(mode, { updateUrl = true } = {}) {
  cancelAnimationFrame(state.cameraAnimation);
  cancelAnimationFrame(state.sceneFrame);
  state.sceneFrame = 0;
  clearTimeout(state.readTimer);
  state.mode = mode;
  state.items = itemsForMode(mode);
  state.positions = buildPositions(state.items, mode);
  state.activeIndex = 0;
  state.renderedActiveIndex = -1;
  state.focusFromIndex = -1;
  state.focusToIndex = -1;
  state.focusProgress = 1;
  setFocusBackdrop(false);
  state.camera = { x: state.positions[0]?.x || 0, y: state.positions[0]?.y || 0, zoom: defaultZoom() };
  elements.world.innerHTML = state.items.map(cardMarkup).join('');
  state.cards = $$('.space-card', elements.world);
  elements.world.classList.add('is-entering');
  requestAnimationFrame(() => elements.world.classList.remove('is-entering'));

  const copy = modeCopy(mode);
  elements.kicker.textContent = copy.kicker;
  elements.title.textContent = copy.title;
  elements.meta.textContent = copy.meta;
  elements.headerMode.textContent = mode === 'builders' || mode === 'profile'
    ? 'BUILDERS'
    : mode === 'archive' || mode === 'issue'
      ? 'ARCHIVE'
      : mode === 'topic'
        ? 'TOPIC'
        : 'TODAY';
  elements.orbit.classList.toggle('is-hidden', mode === 'builders');
  updateNavigation();
  updateActiveUI();
  updateScene();
  restoreFocusBackdrop(180);
  scheduleReadMark();

  if (state.isHome && updateUrl) {
    const url = mode === 'today' ? '/' : `/?space=${mode}`;
    history.replaceState({ space: mode }, '', url);
  }
  track('space_open', { space: mode, count: state.items.length });
}

function defaultZoom() {
  if (window.innerWidth < 640) return 0.66;
  if (window.innerWidth < 980) return 0.72;
  return 0.82;
}

function updateNavigation() {
  $$('[data-space-link]').forEach((link) => {
    const target = link.dataset.spaceLink;
    const active = target === state.mode
      || (target === 'archive' && state.mode === 'issue')
      || (target === 'builders' && state.mode === 'profile')
      || (target === 'today' && state.mode === 'topic');
    link.toggleAttribute('aria-current', active);
  });
}

function updateActiveUI() {
  const item = state.items[state.activeIndex];
  const position = `${String(state.activeIndex + 1).padStart(2, '0')} / ${String(state.items.length).padStart(2, '0')}`;
  elements.activeLabel.textContent = item?.title || '暂无内容';
  elements.activePosition.textContent = position;
  elements.headerPosition.textContent = position;
  elements.progress.style.width = state.items.length ? `${((state.activeIndex + 1) / state.items.length) * 100}%` : '0';
  const previousCard = state.cards[state.renderedActiveIndex];
  const activeCard = state.cards[state.activeIndex];
  if (previousCard && previousCard !== activeCard) {
    previousCard.classList.remove('is-active');
    previousCard.setAttribute('aria-current', 'false');
  }
  if (activeCard) {
    activeCard.classList.add('is-active');
    activeCard.setAttribute('aria-current', 'true');
  }
  state.renderedActiveIndex = state.activeIndex;
}

function stageCenter(rect) {
  return {
    x: rect.width < 760 ? rect.width * 0.5 : rect.width * 0.57,
    y: rect.height < 680 ? rect.height * 0.54 : rect.height * 0.53
  };
}

function measureStage() {
  state.stageRect = elements.stage.getBoundingClientRect();
  return state.stageRect;
}

function scheduleSceneUpdate() {
  if (state.sceneFrame) return;
  state.sceneFrame = requestAnimationFrame(() => {
    state.sceneFrame = 0;
    updateScene();
  });
}

function updateScene() {
  if (!state.cards.length) return;
  const rect = state.stageRect || measureStage();
  const center = stageCenter(rect);
  const viewRadius = Math.hypot(rect.width, rect.height) * 0.7;

  state.cards.forEach((card, index) => {
    const position = state.positions[index];
    const depth = 930 / (930 + position.z);
    const dx = (position.x - state.camera.x) * state.camera.zoom * depth;
    const dy = (position.y - state.camera.y) * state.camera.zoom * depth;
    const distance = Math.hypot(dx, dy);
    const fisheye = 1 / (1 + distance / 960);
    const active = index === state.activeIndex;
    let focusWeight = active ? 1 : 0;
    if (state.focusToIndex >= 0) {
      if (index === state.focusToIndex) focusWeight = state.focusProgress;
      else if (index === state.focusFromIndex) focusWeight = 1 - state.focusProgress;
      else focusWeight = 0;
    }
    const focusBounce = index === state.focusToIndex
      ? Math.sin(state.focusProgress * Math.PI) * 0.045
      : 0;
    const focusScale = 1 + focusWeight * 0.28 + focusBounce;
    const scale = clamp(state.camera.zoom * depth * (0.52 + fisheye * 0.48) * focusScale, 0.22, 1.16);
    const baseOpacity = clamp(1.08 - distance / (viewRadius * 1.4), 0.12, 0.82);
    const opacity = focusWeight > 0 ? Math.max(baseOpacity, 0.78 + focusWeight * 0.22) : baseOpacity;
    const rotateY = clamp(-dx / Math.max(rect.width, 1) * 18, -9, 9);
    const rotateX = clamp(dy / Math.max(rect.height, 1) * 12, -6, 6);
    const offscreen = Math.abs(dx) > rect.width * 0.95 || Math.abs(dy) > rect.height * 1.05;

    if (offscreen && !active) {
      if (card.dataset.sceneVisible !== 'false') {
        card.style.visibility = 'hidden';
        card.dataset.sceneVisible = 'false';
      }
      return;
    }

    if (card.dataset.sceneVisible !== 'true') {
      card.dataset.sceneVisible = 'true';
      card.style.visibility = 'visible';
    }
    card.style.transform = `translate3d(${center.x + dx}px, ${center.y + dy}px, 0) translate(-50%, -50%) scale(${scale}) rotateX(${rotateX}deg) rotateY(${rotateY + position.tilt}deg)`;
    card.style.opacity = String(opacity);
    card.style.zIndex = String(focusWeight > 0 ? Math.round(900 + focusWeight * 100) : Math.round(100 + scale * 100));
  });
}

function settleFocusTransition() {
  state.focusFromIndex = -1;
  state.focusToIndex = -1;
  state.focusProgress = 1;
  elements.stage.classList.remove('is-focusing');
}

function setFocusBackdrop(active) {
  clearTimeout(state.focusBackdropTimer);
  state.focusBackdropTimer = 0;
  elements.stage.classList.toggle('has-focus-backdrop', active);
}

function syncFocusBackdropHole() {
  const card = state.cards[state.activeIndex];
  if (!card) return;
  const stageRect = state.stageRect || measureStage();
  const cardRect = card.getBoundingClientRect();
  const gutter = stageRect.width < 640 ? 10 : 18;
  const left = clamp(cardRect.left - stageRect.left - gutter, 0, stageRect.width);
  const top = clamp(cardRect.top - stageRect.top - gutter, 0, stageRect.height);
  const right = clamp(cardRect.right - stageRect.left + gutter, 0, stageRect.width);
  const bottom = clamp(cardRect.bottom - stageRect.top + gutter, 0, stageRect.height);
  elements.stage.style.setProperty('--focus-left', `${left}px`);
  elements.stage.style.setProperty('--focus-top', `${top}px`);
  elements.stage.style.setProperty('--focus-right', `${right}px`);
  elements.stage.style.setProperty('--focus-bottom', `${bottom}px`);
}

function restoreFocusBackdrop(delay = 0) {
  clearTimeout(state.focusBackdropTimer);
  state.focusBackdropTimer = window.setTimeout(() => {
    state.focusBackdropTimer = 0;
    syncFocusBackdropHole();
    elements.stage.classList.add('has-focus-backdrop');
  }, delay);
}

function animateCamera(targetX, targetY, targetZoom = state.camera.zoom, focusTransition = null) {
  cancelAnimationFrame(state.cameraAnimation);
  setFocusBackdrop(false);
  const start = { ...state.camera };
  const startedAt = performance.now();
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 560;
  if (focusTransition) {
    state.focusFromIndex = focusTransition.from;
    state.focusToIndex = focusTransition.to;
    state.focusProgress = 0;
    elements.stage.classList.add('is-focusing');
  } else settleFocusTransition();
  const draw = (now) => {
    const progress = clamp((now - startedAt) / duration, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    if (focusTransition) state.focusProgress = eased;
    state.camera.x = start.x + (targetX - start.x) * eased;
    state.camera.y = start.y + (targetY - start.y) * eased;
    state.camera.zoom = start.zoom + (targetZoom - start.zoom) * eased;
    updateScene();
    if (progress < 1) state.cameraAnimation = requestAnimationFrame(draw);
    else {
      if (focusTransition) {
        settleFocusTransition();
        updateScene();
      }
      restoreFocusBackdrop();
    }
  };
  state.cameraAnimation = requestAnimationFrame(draw);
}

function focusItem(index, { smooth = true, trackFocus = true } = {}) {
  if (!state.items.length) return;
  const nextIndex = (index + state.items.length) % state.items.length;
  const previousIndex = state.activeIndex;
  const changed = nextIndex !== state.activeIndex;
  state.activeIndex = nextIndex;
  const position = state.positions[nextIndex];
  updateActiveUI();
  if (smooth) animateCamera(position.x, position.y, state.camera.zoom, {
    from: previousIndex,
    to: nextIndex
  });
  else {
    state.camera.x = position.x;
    state.camera.y = position.y;
    updateScene();
  }
  scheduleReadMark();
  if (trackFocus && changed) track('space_item_focus', { itemId: state.items[nextIndex].id, position: nextIndex + 1 });
}

function nearestItemToCenter() {
  let nearest = state.activeIndex;
  let nearestDistance = Number.POSITIVE_INFINITY;
  state.positions.forEach((position, index) => {
    const distance = Math.hypot(position.x - state.camera.x, position.y - state.camera.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = index;
    }
  });
  return nearest;
}

function zoomCanvas(delta, clientX, clientY) {
  setFocusBackdrop(false);
  const rect = state.stageRect || measureStage();
  const center = stageCenter(rect);
  const oldZoom = state.camera.zoom;
  const nextZoom = clamp(oldZoom * delta, 0.34, 1.32);
  const pointerX = (clientX ?? center.x) - rect.left;
  const pointerY = (clientY ?? center.y) - rect.top;
  const worldX = state.camera.x + (pointerX - center.x) / oldZoom;
  const worldY = state.camera.y + (pointerY - center.y) / oldZoom;
  state.camera.x = worldX - (pointerX - center.x) / nextZoom;
  state.camera.y = worldY - (pointerY - center.y) / nextZoom;
  state.camera.zoom = nextZoom;
  scheduleSceneUpdate();
  restoreFocusBackdrop(160);
  elements.status.textContent = `缩放 ${Math.round(nextZoom * 100)}%`;
}

function resetView() {
  const position = state.positions[state.activeIndex] || { x: 0, y: 0 };
  animateCamera(position.x, position.y, defaultZoom());
  elements.status.textContent = '视角已重置';
}

function scheduleReadMark() {
  clearTimeout(state.readTimer);
  if (state.mode !== 'today') return;
  const item = state.items[state.activeIndex];
  if (!item) return;
  state.readTimer = setTimeout(() => {
    if (state.observedPosts.has(item.id)) return;
    state.observedPosts.add(item.id);
    track('card_view', { postId: item.id, position: state.activeIndex + 1 });
    maybeCelebrateCompletion();
  }, 900);
}

function persistCelebratedIssue(date) {
  const dates = loadJsonStorage(STORAGE_KEYS.celebrated, []).filter(Boolean);
  if (!dates.includes(date)) dates.push(date);
  localStorage.setItem(STORAGE_KEYS.celebrated, JSON.stringify(dates.slice(-30)));
}

function finishCompletionCelebration() {
  elements.celebration.classList.remove('is-active');
  setTimeout(() => {
    elements.celebration.hidden = true;
    const context = elements.fireworks.getContext('2d');
    context?.clearRect(0, 0, elements.fireworks.width, elements.fireworks.height);
  }, 220);
}

function playCompletionCelebration() {
  const overlay = elements.celebration;
  const canvas = elements.fireworks;
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('is-active'));
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTimeout(finishCompletionCelebration, 1600);
    return;
  }
  const context = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  context.scale(dpr, dpr);
  const bursts = [
    { x: width * 0.2, y: height * 0.32, delay: 0, count: 22 },
    { x: width * 0.5, y: height * 0.2, delay: 220, count: 28 },
    { x: width * 0.78, y: height * 0.38, delay: 450, count: 24 },
    { x: width * 0.38, y: height * 0.64, delay: 680, count: 20 },
    { x: width * 0.68, y: height * 0.68, delay: 850, count: 22 }
  ];
  const particles = [];
  const startedAt = performance.now();
  function launch(burst) {
    burst.launched = true;
    for (let index = 0; index < burst.count; index += 1) {
      const angle = (Math.PI * 2 * index) / burst.count + Math.random() * 0.12;
      const speed = 1.8 + Math.random() * 3.2;
      particles.push({ x: burst.x, y: burst.y, px: burst.x, py: burst.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, life: 54 + Math.random() * 30 });
    }
  }
  function draw(now) {
    const elapsed = now - startedAt;
    context.clearRect(0, 0, width, height);
    bursts.forEach((burst) => { if (!burst.launched && elapsed >= burst.delay) launch(burst); });
    particles.forEach((particle) => {
      particle.px = particle.x;
      particle.py = particle.y;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= 0.985;
      particle.vy = particle.vy * 0.985 + 0.035;
      particle.age += 1;
      context.beginPath();
      context.moveTo(particle.px, particle.py);
      context.lineTo(particle.x, particle.y);
      context.strokeStyle = `rgba(17,17,17,${Math.max(0, 1 - particle.age / particle.life) * 0.86})`;
      context.lineWidth = 1;
      context.stroke();
    });
    if (elapsed < 2200) requestAnimationFrame(draw);
    else finishCompletionCelebration();
  }
  requestAnimationFrame(draw);
}

function maybeCelebrateCompletion() {
  const complete = state.items.length > 0 && state.observedPosts.size >= state.items.length;
  if (state.mode !== 'today' || !complete || state.completionCelebrated) return;
  state.completionCelebrated = true;
  persistCelebratedIssue(state.issue.date);
  playCompletionCelebration();
  track('daily_complete', { date: state.issue.date, postCount: state.items.length });
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2400);
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const navLink = event.target.closest('[data-space-link]');
    if (navLink && state.isHome) {
      event.preventDefault();
      renderMode(navLink.dataset.spaceLink);
      return;
    }
    const focusButton = event.target.closest('[data-focus-index]');
    if (focusButton) {
      focusItem(Number(focusButton.dataset.focusIndex));
      return;
    }
    const action = event.target.closest('[data-item-action]');
    if (action) track('space_item_open', { itemId: action.dataset.itemAction });
    const canvasAction = event.target.closest('[data-canvas-action]')?.dataset.canvasAction;
    if (!canvasAction) return;
    if (canvasAction === 'previous') focusItem(state.activeIndex - 1);
    if (canvasAction === 'next') focusItem(state.activeIndex + 1);
    if (canvasAction === 'zoom-in') zoomCanvas(1.16);
    if (canvasAction === 'zoom-out') zoomCanvas(0.86);
    if (canvasAction === 'reset') resetView();
  });

  elements.stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomCanvas(event.deltaY > 0 ? 0.9 : 1.1, event.clientX, event.clientY);
  }, { passive: false });

  elements.stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.space-card-action')) return;
    cancelAnimationFrame(state.cameraAnimation);
    setFocusBackdrop(false);
    settleFocusTransition();
    scheduleSceneUpdate();
    state.dragging = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      cameraX: state.camera.x,
      cameraY: state.camera.y,
      moved: false
    };
    elements.stage.setPointerCapture(event.pointerId);
    elements.stage.classList.add('is-dragging');
  });

  elements.stage.addEventListener('pointermove', (event) => {
    const drag = state.dragging;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    state.camera.x = drag.cameraX - dx / state.camera.zoom;
    state.camera.y = drag.cameraY - dy / state.camera.zoom;
    scheduleSceneUpdate();
  });

  const finishDrag = (event) => {
    const drag = state.dragging;
    if (!drag || drag.id !== event.pointerId) return;
    state.dragging = null;
    elements.stage.classList.remove('is-dragging');
    if (elements.stage.hasPointerCapture(event.pointerId)) elements.stage.releasePointerCapture(event.pointerId);
    if (drag.moved) focusItem(nearestItemToCenter());
    else restoreFocusBackdrop(80);
  };
  elements.stage.addEventListener('pointerup', finishDrag);
  elements.stage.addEventListener('pointercancel', finishDrag);

  elements.stage.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(state.activeIndex - 1);
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem(state.activeIndex + 1);
    }
    if (event.key === '+' || event.key === '=') zoomCanvas(1.12);
    if (event.key === '-' || event.key === '_') zoomCanvas(0.88);
    if (event.key === 'Home' || event.key === '0') resetView();
  });

  window.addEventListener('resize', () => {
    cancelAnimationFrame(state.resizeFrame);
    state.resizeFrame = requestAnimationFrame(() => {
      state.stageRect = null;
      measureStage();
      updateScene();
    });
  });

  window.addEventListener('popstate', () => {
    if (!state.isHome) return;
    const requested = new URLSearchParams(location.search).get('space');
    renderMode(['archive', 'builders'].includes(requested) ? requested : 'today', { updateUrl: false });
  });
}

function renderLoadingState() {
  elements.world.innerHTML = '<div class="space-loading"><span></span><p>正在建立信息空间</p></div>';
}

function renderFatalError(error) {
  console.error(error);
  elements.world.innerHTML = `
    <div class="space-error">
      <p>SPACE OFFLINE</p>
      <h2>信息空间暂时没有载入</h2>
      <button type="button" onclick="location.reload()">重新加载</button>
    </div>`;
  showToast(error?.message || '请刷新页面重试');
}

function updateMetadata() {
  const context = state.issue.context;
  const title = context
    ? `${context.name} — Builders Daily`
    : `${formatDate(state.issue.date)} AI Builder 情报日报 — Builders Daily`;
  const description = String(state.issue.summary || state.issue.posts[0]?.summaryEn || '').slice(0, 150);
  document.title = title;
  $('meta[name="description"]')?.setAttribute('content', description);
  $('meta[property="og:title"]')?.setAttribute('content', title);
  $('meta[property="og:description"]')?.setAttribute('content', description);
}

async function init() {
  cacheElements();
  renderLoadingState();
  bindEvents();
  try {
    await loadSiteData();
    state.completionCelebrated = loadJsonStorage(STORAGE_KEYS.celebrated, []).includes(state.issue.date);
    const requestedSpace = new URLSearchParams(location.search).get('space');
    const initialMode = state.contextType || (state.isHome && ['archive', 'builders'].includes(requestedSpace) ? requestedSpace : 'today');
    renderMode(initialMode, { updateUrl: false });
    updateMetadata();
    track('page_view', { postCount: state.issue.postCount, builderCount: state.issue.builderCount });
  } catch (error) {
    renderFatalError(error);
  }
}

init();
