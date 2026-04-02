const fs = require('fs');
const path = require('path');
const { syncProfilesFromX } = require('./sync-x-profiles');

const LOCAL_X_MONITOR_DIR = process.env.X_LIST_MONITOR_DIR ||
  '/Users/zhaonan/0-Projects/x-list-monitor';
const PROFILES_PATH = path.join(__dirname, '..', 'profiles.json');
const ENV_PATH = path.join(__dirname, '..', '.env');
const ZHIPU_CHAT_COMPLETIONS_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MIN_MODEL_ANALYSIS_LENGTH = 88;
const MAX_CARD_SUMMARY_LENGTH = 600;
const SHOULD_SKIP_PROFILE_SYNC = process.env.SKIP_PROFILE_SYNC === '1';
let envLoaded = false;

// 文本截断函数
function truncateText(text, maxLength = 280) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function containsAll(text, keywords) {
  return keywords.every((keyword) => text.includes(keyword));
}

function loadEnvFile() {
  if (envLoaded) {
    return;
  }

  envLoaded = true;

  if (!fs.existsSync(ENV_PATH)) {
    return;
  }

  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function getAiAnalysisConfig() {
  loadEnvFile();

  const provider = (process.env.AI_ANALYSIS_PROVIDER || (process.env.ZHIPU_API_KEY ? 'zhipu' : ''))
    .trim()
    .toLowerCase();

  if (provider !== 'zhipu' || !process.env.ZHIPU_API_KEY) {
    return null;
  }

  return {
    provider: 'zhipu',
    apiKey: process.env.ZHIPU_API_KEY,
    model: process.env.AI_ANALYSIS_MODEL || 'glm-4.7',
    endpoint: process.env.ZHIPU_API_ENDPOINT || ZHIPU_CHAT_COMPLETIONS_URL,
    batchSize: Math.min(2, Math.max(1, Number.parseInt(process.env.AI_ANALYSIS_BATCH_SIZE || '2', 10) || 2)),
    timeoutMs: Math.max(20000, Number.parseInt(process.env.AI_ANALYSIS_TIMEOUT_MS || '90000', 10) || 90000)
  };
}

function normalizeAnalysisText(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= 320) {
    return normalized;
  }

  return `${normalized.slice(0, 319)}…`;
}

function chunkItems(items, batchSize) {
  const chunks = [];

  for (let index = 0; index < items.length; index += batchSize) {
    chunks.push(items.slice(index, index + batchSize));
  }

  return chunks;
}

function parseJsonResponse(rawContent) {
  if (!rawContent) {
    return null;
  }

  const trimmed = String(rawContent)
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function buildDailySummaryMessages(builders) {
  const sourcePosts = builders
    .filter((item) => !item.isSummary && item.summaryEn)
    .slice(0, 18)
    .map((item, index) => ({
      index,
      name: item.name,
      handle: item.handle,
      role: item.role,
      text: truncateText(item.summaryEn || item.summary || '', 180)
    }));

  const uniqueBuilders = new Set(sourcePosts.map((item) => item.handle)).size;

  return [
    {
      role: 'system',
      content: [
        '你是 AI Builders Daily 的中文主笔。',
        '请基于今天追踪到的一组 builder 动态，写一段自然、好读的今日小结。',
        '要求：',
        '1. 输出 120 到 180 个中文字符，1 段完整中文，不要分点。',
        '2. 第一部分自然带出今天观察到的整体气氛或主线，不要机械报数。',
        '3. 中间要把 2 到 3 个最重要的共性主题串起来，例如模型路线、产品分发、Agent 落地、开发工具、商业化压力。',
        '4. 结尾给出一句克制的判断，像媒体摘要，不要空话，不要官腔。',
        '5. 不要写成“今天共追踪到……”，也不要重复类似“整体来看”“值得关注”“反映了趋势”这种模板话。',
        '6. 要整合成一段自然文字，像人写的日报收尾。',
        '7. 只返回 JSON：{"summary":"..."}'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        stats: {
          unique_builders: uniqueBuilders,
          posts: sourcePosts.length
        },
        items: sourcePosts
      }, null, 2)
    }
  ];
}

function loadProfilesMetadata() {
  try {
    if (!fs.existsSync(PROFILES_PATH)) {
      return new Map();
    }

    const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
    return new Map(
      profiles
        .filter(item => item && item.handle)
        .map(item => [item.handle.toLowerCase(), item])
    );
  } catch (error) {
    console.log('Could not load profiles metadata:', error.message);
    return new Map();
  }
}

function loadExistingMetadata() {
  try {
    const dataPath = path.join(__dirname, '..', 'data.json');
    if (!fs.existsSync(dataPath)) {
      return new Map();
    }

    const existing = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    return new Map(
      existing
        .filter(item => item && item.handle)
        .map(item => [item.handle.toLowerCase(), item])
    );
  } catch (error) {
    console.log('Could not load existing metadata cache:', error.message);
    return new Map();
  }
}

function buildAvatar(name, handle) {
  if (name && name.includes(' ')) {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }

  return (handle || '?').substring(0, 2).toUpperCase();
}

// 生成深度中文分析
function generateAnalysis(name, handle, text, role, options = {}) {
  if (!text || text.length < 10 || text.startsWith('http')) {
    return '';
  }

  const textLower = text.toLowerCase();
  const signals = identifySignals(text);
  const specificAnalysis = buildSpecificAnalysis({
    name,
    handle: (handle || '').toLowerCase(),
    role,
    text,
    textLower,
    signals,
    occurrenceIndex: options.occurrenceIndex || 0
  });

  if (specificAnalysis) {
    return specificAnalysis;
  }

  return buildShortComment(signals, options.occurrenceIndex || 0);
}

function identifyRole(role, name) {
  const roleLower = (role || '').toLowerCase();
  const nameLower = name.toLowerCase();

  // OpenAI 相关
  if (roleLower.includes('openai') || nameLower.includes('altman')) {
    return {
      intro: `${name} 作为 OpenAI 核心人物，`,
      perspective: '从 AGI 发展视角'
    };
  }

  // Anthropic 相关
  if (roleLower.includes('anthropic') || roleLower.includes('claude')) {
    return {
      intro: `${name} 来自 Anthropic，`,
      perspective: '从 AI 安全与实用性视角'
    };
  }

  // YC 相关
  if (roleLower.includes('yc') || roleLower.includes('y combinator')) {
    return {
      intro: `${name} 作为 YC 核心成员，`,
      perspective: '从创业生态视角'
    };
  }

  // Google 相关
  if (roleLower.includes('google')) {
    return {
      intro: `${name} 来自 Google，`,
      perspective: '从科技巨头视角'
    };
  }

  // Replit 相关
  if (roleLower.includes('replit')) {
    return {
      intro: `${name} 作为 Replit 领导者，`,
      perspective: '从开发者工具演进视角'
    };
  }

  // 产品相关
  if (roleLower.includes('product') || roleLower.includes('pm')) {
    return {
      intro: `${name} 从产品视角出发，`,
      perspective: '从产品设计视角'
    };
  }

  // VC/投资相关
  if (roleLower.includes('vc') || roleLower.includes('invest') || roleLower.includes('partner')) {
    return {
      intro: `${name} 从投资视角分析，`,
      perspective: '从投资趋势视角'
    };
  }

  // 默认
  return {
    intro: `${name} 分享的最新动态，`,
    perspective: '从行业实践视角'
  };
}

function identifySignals(text) {
  const textLower = text.toLowerCase();
  const signals = [];

  if (textLower.includes('agent') || textLower.includes('codex') || textLower.includes('computer use')) {
    signals.push('agent');
  }

  if (
    textLower.includes('ship') ||
    textLower.includes('launch') ||
    textLower.includes('release') ||
    textLower.includes('announce') ||
    textLower.includes('发布') ||
    textLower.includes('上线')
  ) {
    signals.push('launch');
  }

  if (
    textLower.includes('science') ||
    textLower.includes('research') ||
    textLower.includes('paper') ||
    textLower.includes('study') ||
    textLower.includes('benchmark') ||
    textLower.includes('eval')
  ) {
    signals.push('research');
  }

  if (textLower.includes('acquire') || textLower.includes('invest') || textLower.includes('fund') || textLower.includes('raise')) {
    signals.push('capital');
  }

  if (
    textLower.includes('code') ||
    textLower.includes('developer') ||
    textLower.includes('build') ||
    textLower.includes('replit') ||
    textLower.includes('github') ||
    textLower.includes('编程')
  ) {
    signals.push('devtools');
  }

  if (
    textLower.includes('ui') ||
    textLower.includes('design') ||
    textLower.includes('variant') ||
    textLower.includes('workflow') ||
    textLower.includes('生成式') ||
    textLower.includes('工作流') ||
    textLower.includes('重构')
  ) {
    signals.push('workflow');
  }

  if (
    textLower.includes('user') ||
    textLower.includes('product') ||
    textLower.includes('customer') ||
    textLower.includes('app') ||
    textLower.includes('体验') ||
    textLower.includes('增长')
  ) {
    signals.push('product');
  }

  if (
    textLower.includes('billing') ||
    textLower.includes('webhook') ||
    textLower.includes('stripe') ||
    textLower.includes('api') ||
    textLower.includes('infra') ||
    textLower.includes('sdk') ||
    textLower.includes('部署')
  ) {
    signals.push('infrastructure');
  }

  if (
    textLower.includes('live') ||
    textLower.includes('course') ||
    textLower.includes('community') ||
    textLower.includes('newsletter') ||
    textLower.includes('podcast') ||
    textLower.includes('直播') ||
    textLower.includes('课程') ||
    textLower.includes('社群')
  ) {
    signals.push('distribution');
  }

  if (
    textLower.includes('price') ||
    textLower.includes('billing') ||
    textLower.includes('subscription') ||
    textLower.includes('coupon') ||
    textLower.includes('付费') ||
    textLower.includes('订阅') ||
    textLower.includes('优惠')
  ) {
    signals.push('monetization');
  }

  if (
    textLower.includes('grok') ||
    textLower.includes('claude') ||
    textLower.includes('gpt') ||
    textLower.includes('gemini') ||
    textLower.includes('model') ||
    textLower.includes('模型')
  ) {
    signals.push('models');
  }

  if (signals.length === 0) {
    signals.push('general');
  }

  return signals;
}

function getCommentSignature(signals) {
  if (signals.includes('agent') && signals.includes('infrastructure')) {
    return 'agent_infrastructure';
  }

  if (signals.includes('distribution') && signals.includes('monetization')) {
    return 'distribution_monetization';
  }

  if (signals.includes('models')) {
    return 'models';
  }

  if (signals.includes('workflow')) {
    return 'workflow';
  }

  if (signals.includes('infrastructure')) {
    return 'infrastructure';
  }

  if (signals.includes('agent')) {
    return 'agent';
  }

  if (signals.includes('devtools')) {
    return 'devtools';
  }

  if (signals.includes('distribution')) {
    return 'distribution';
  }

  if (signals.includes('product')) {
    return 'product';
  }

  if (signals.includes('research')) {
    return 'research';
  }

  return 'general';
}

function pickVariant(options, occurrenceIndex = 0) {
  return options[occurrenceIndex % options.length];
}

function buildSpecificAnalysis(context) {
  const {
    handle,
    role,
    text,
    textLower,
    occurrenceIndex
  } = context;

  const roleLower = (role || '').toLowerCase();

  if (handle === 'yihui_indie' && containsAny(text, ['兑换码', '奖品', '权益兑换'])) {
    return pickVariant([
      '这条不是单纯送福利，而是在把直播流量、订阅产品和兑换码转成一条完整转化链。对 AI SaaS 来说，谁先把内容场和激活入口接顺，谁就更容易拿到低成本新增。',
      '直播抽奖这件事看似轻，但背后其实是一次很典型的 AI 产品分发实验。内容主理人负责拿流量，工具方提供可兑现权益，中间几乎没有多余链路损耗。'
    ], occurrenceIndex);
  }

  if (handle === 'yihui_indie' && containsAny(text, ['群里', '课程', '直播通知', 'AI 编程'])) {
    return pickVariant([
      '这更像把社群做成留存层，而不是简单拉群。对 AI 编程内容来说，真正值钱的不是一次直播，而是后续技巧更新、通知和讨论能不能持续把用户留在同一个池子里。',
      '很多 AI builder 现在做的不是单次内容变现，而是把课程、群和持续更新绑成一个复购结构。社群如果能承接学习节奏，本身就会变成产品的一部分。'
    ], occurrenceIndex);
  }

  if (handle === 'hwwaanng' && containsAny(text, ['先做', '有人用', 'agent'])) {
    return pickVariant([
      '这句话点中了现在很多 AI 产品的真实节奏: 第一版变便宜了，真正慢的反而是等用户反馈和迭代方向。Agent 把试错成本压低后，速度优势会更多来自上线后的调整能力。',
      '“先做再改”在 Agent 时代更成立，因为首版实现已经不再稀缺。真正的门槛变成谁能更快看到真实使用，再把 agent 能力修进具体流程里，而不是停留在 demo。'
    ], occurrenceIndex);
  }

  if (handle === 'elonmusk' && containsAny(textLower, ['grok', 'imagine'])) {
    return pickVariant([
      '按 xAI 文档，`grok-imagine-image` 不只是出图，还支持编辑和多轮 refinement。现在说“doubling down”，更像是在押注图像创作会成为 Grok 的核心入口，而不只是附带功能。',
      '这条最值得看的不是“epic”这种表态，而是 xAI 已经把 Imagine 做成了可编辑、可多轮迭代的创作能力。继续加码，说明它想抢的不只是聊天入口，还包括生成式创作场景。'
    ], occurrenceIndex);
  }

  if (handle === 'elonmusk' && containsAny(textLower, ['starship', 'lift cost', 'mars', 'orbital'])) {
    return pickVariant([
      '虽然这条不是 AI，但逻辑和 AI 基础设施很像: 谁先把最核心的成本瓶颈打下来，谁就能重写下游行业的可能性。Musk 一直在讲的，其实是“先控住关键约束，再谈上层应用”。',
      '这条背后的 builder 思路很典型: 真正重要的不是先做多少场景，而是先把最硬的底层成本打穿。放到 AI 里看，也就是算力、数据和分发入口这些关键瓶颈。'
    ], occurrenceIndex);
  }

  if (handle === 'oran_ge' && containsAny(text, ['Web Access', '浏览器', '1000 stars', '微信公众号', '小红书'])) {
    return pickVariant([
      '这条有意思的地方，在于它点破了 browser agent 迟迟不好用的几个硬伤: 登录态、会话隔离、并发和真实页面访问。发布后很快拿到 stars，也说明大家缺的不是模型，而是可靠的 agent runtime。',
      '很多人以为 agent 上网只是“加个搜索”就够了，但真正进生产环境后，卡的都是登录、并发和浏览器资源抢占。这个方向一旦跑通，浏览器层会成为 agent 基础设施的重要一环。'
    ], occurrenceIndex);
  }

  if (handle === 'oran_ge' && containsAny(textLower, ['sora'])) {
    return pickVariant([
      '这句看着像调侃，实则是在提醒一件老问题: 只套单一上游模型的产品，生命周期往往跟着模型热度走。真要活下来，护城河还是得落在工作流、数据或分发，而不是模型名气本身。',
      '“Sora 死了怎么办”本质上是在问壳层产品有没有独立价值。上游模型一旦换代或失速，只有那些把能力嵌进具体场景、具体流程里的产品，才更扛波动。'
    ], occurrenceIndex);
  }

  if (handle === 'nikunj' && containsAny(textLower, ['subprocessor'])) {
    return pickVariant([
      '这条很有投资人视角: 他盯的不是 demo，而是 subprocessor list 这类公开披露。某家 infra 一旦频繁出现在这些名单里，往往说明它已经进入真实生产环境，离行业标准更近一步。',
      '拿 subprocessor list 做信号源很聪明，因为这些文档天然带着“谁真的被企业用起来了”的信息。对 AI infra 来说，被写进披露名单，通常比在发布会上喊得响更有含金量。'
    ], occurrenceIndex);
  }

  if (handle === 'nikunj' && containsAny(textLower, ['conductor_build', 'railway', 'claude'])) {
    return pickVariant([
      '这条说明一个趋势已经很清楚了: niche data product 的制作门槛正在快速下降。只要有公开数据源、有托管平台，再加上 AI 编码工具，小团队也能很快拼出一个有洞察价值的产品。',
      '以前这种站点更像分析师或工程团队的活，现在用 Claude Code、Railway 这类组合，小产品可以非常快地上线验证。真正拉开差距的，会是选题眼光和数据解释力。'
    ], occurrenceIndex);
  }

  if (handle === 'zarazhangrui' && containsAny(textLower, ['github', 'substack', 'self-expression'])) {
    return pickVariant([
      '这句话抓住了一个很新的变化: 代码仓库正在变成内容分发面。过去写作者靠文章建立风格，现在 builder 直接用 repo、demo 和 commit 记录表达判断，代码本身就在说话。',
      '把 GitHub 说成新 Substack，并不只是比喻好玩。它反映的是“写代码”和“公开表达”正在合流，repo 既是作品，也是观点载体，甚至还能直接带来合作和流量。'
    ], occurrenceIndex);
  }

  if (handle === 'garrytan' && containsAny(textLower, ['demo day', '90x', 'solo founders', '90%'])) {
    return pickVariant([
      'YC W26 Demo Day 本身就是一个高密度资本场，官方页面提到会有约 1500 位投资人和媒体在场。Garry 这里真正抬高的不是情绪，而是市场对单人团队产能和 AI 创业密度的预期。',
      '这条最值得琢磨的是“90x output”背后的新基准线。单人 founder 借 agent 接近过去小团队产能之后，竞争就会更快转向分发、客户理解和执行速度，而不是单纯拼人头。'
    ], occurrenceIndex);
  }

  if (handle === 'garrytan' && containsAny(textLower, ['karpathy', 'coding agents', 'anxious'])) {
    return pickVariant([
      '这条很真实，因为它说的是当下开发者共同的焦虑: 不是没有 agent，而是不确定自己有没有把 agent 用到位。下一阶段的差距，未必来自谁先接入，而是谁先形成稳定工作流。',
      'Karpathy 这种级别的人也会担心自己没把 coding agent 用透，说明这波工具革命还在 very early。真正成熟的标志，不是大家都能调用，而是团队开始形成一套可复制的协作习惯。'
    ], occurrenceIndex);
  }

  if (handle === 'petergyang' && containsAny(textLower, ['talk to each other', 'can’t talk to each other', "can't talk to each other"])) {
    return pickVariant([
      '这条吐槽指向的是 agent 协作层还很原始。单个 bot 能工作已经不稀奇了，下一步真正有价值的是让不同 agent 在同一消息流里自然接力，而不是各自单打独斗。',
      '如果 bot 之间还不能顺畅协作，聊天应用就只能算 agent 的容器，还算不上 agent 的操作系统。真正的机会在于把多 agent 协作做成用户几乎无感的默认体验。'
    ], occurrenceIndex);
  }

  if (handle === 'petergyang' && containsAny(textLower, ['openclaw', 'claude bots', 'haven\'t talked to a single human'])) {
    return pickVariant([
      'Telegram 官方这些年一直把 bot、Mini App、支付都做成平台能力，所以这条吐槽其实挺有启发: 一旦 bot 之间能更自然协作，聊天应用就不只是聊天入口，而会逐步变成 agent 的轻量操作系统。',
      '这不是一句玩笑话。Telegram Bot 平台本来就支持丰富交互和服务接入，如果 bot 开始在同一界面里并行协作，消息流本身就可能演化成新的 agent 工作台。'
    ], occurrenceIndex);
  }

  if (handle === 'turingou' && containsAny(textLower, ['variant', '生成式 ui', '业务数据', 'm0rphic'])) {
    return pickVariant([
      '这条真正有意思的地方，是把生成式 UI 从“炫技界面”往“接业务数据的产品壳”推进了一步。界面如果能围绕任务和实时数据即时生成，很多 SaaS 的交互边界都会被重写。',
      '当生成式 UI 不再只是占位 demo，而能直接挂真实业务数据时，产品形态就开始变了。未来用户买的可能不只是功能集合，而是一个会随任务重组的界面层。'
    ], occurrenceIndex);
  }

  if (handle === 'turingou' && containsAny(textLower, ['clerk', 'billing', 'stripe', 'webhook'])) {
    return pickVariant([
      'Clerk 官方文档把 Billing 的卖点直接写成少写集成代码、少折腾 webhook，虽然现在还在 Beta。对早期团队来说，多付一点手续费换更快上线支付，往往比自己从头接 Stripe 更划算。',
      '这条说透了很多早期产品的真实选择: 不是哪套支付最便宜，而是哪套最少打断主线。像 Clerk 这种把登录和 billing 一起包掉的方案，本质上是在出售团队注意力。'
    ], occurrenceIndex);
  }

  if (handle === 'thenanyu' && containsAny(textLower, ['incentives', 'annoying work', 'agent'])) {
    return pickVariant([
      '这条把 agent 产品最靠谱的起点说得很直白: 创始人自己先被低价值重复劳动折磨过，自动化才容易做成真需求。很多好 agent 不是从宏大叙事开始，而是从“我真的不想再手动做了”开始。',
      '真正强的自动化产品，往往都带着明确的个人激励。只有创作者自己也急着把烦人的活干掉，agent 才更可能被打磨成可长期使用的工具，而不是一次性 demo。'
    ], occurrenceIndex);
  }

  if (handle === 'thenanyu' && containsAny(textLower, ['gemini', 'app store', 'chatgpt', 'claude'])) {
    return pickVariant([
      '这条背后其实是在看 consumer AI 的分发格局。AI 助手开始长期占据 App Store 头部后，竞争就不只是模型分数，而是谁能拿住默认入口、品牌心智和高频使用场景。',
      '当 ChatGPT、Claude、Gemini 这种模型品牌长期挤进应用榜前列，说明消费级 AI 已经从新奇功能变成了顶级流量位。接下来拼的会更像产品包装和留存，而不只是能力跑分。'
    ], occurrenceIndex);
  }

  if (containsAny(roleLower, ['ycombinator', 'yc']) && containsAny(textLower, ['demo day', 'founder'])) {
    return pickVariant([
      '放在 YC 这个语境里看，这条不只是情绪表达，更像是在给下一代 founder 定基准线。AI 把人均产能抬上去之后，创业竞争会越来越像“更快验证，更快分发”。',
      '这类话从 YC 语境里说出来，影响不只是当天氛围，而是市场预期。人们会开始默认: 更小的团队也应该更快做出更完整的东西。'
    ], occurrenceIndex);
  }

  return '';
}

function buildShortComment(signals, occurrenceIndex = 0) {
  if (signals.includes('agent') && signals.includes('infrastructure')) {
    return pickVariant([
      'Agent 的分水岭已经不是会不会写，而是能不能稳定接进支付、浏览器和真实业务流程。真正值钱的是那层把模型能力接进旧系统的工程能力。',
      '真正把 Agent 拉开差距的，不再是演示效果，而是能否接入真实系统并持续稳定运行。浏览器、账号体系和支付这些脏活，往往才是壁垒所在。',
      '现在看 Agent，关键已经不是能不能做事，而是能不能接进复杂流程后依然可靠。只要一进生产就掉链子，再强的能力展示也很难变成长期价值。'
    ], occurrenceIndex);
  }

  if (signals.includes('distribution') && signals.includes('monetization')) {
    return pickVariant([
      '内容、社群和交易正在连成一条链，谁能把分发做深，谁就更容易把注意力变成成交。AI 产品越来越像媒体产品，转化链路越短越重要。',
      '这类动作说明内容、社群和成交不再分家，分发能力开始直接影响商业化效率。对小团队来说，谁先打通这条链，谁就更有机会活得轻。',
      '今天很多 AI builder 拼的已经不是单点产品，而是谁能把内容流量顺手接成交易闭环。流量不再只是曝光，而是产品结构的一部分。'
    ], occurrenceIndex);
  }

  if (signals.includes('models')) {
    return pickVariant([
      '这更像模型路线信号，重点不在这次功能本身，而在后续资源和能力会往哪里倾斜。模型团队每次公开表态，其实都在提前给生态做预告。',
      '与其把它当作一次产品更新，不如把它看成模型团队在提前释放路线方向。真正该盯的是哪些能力会先被产品化、先被推到用户面前。',
      '这类表态最值得看的不是表面功能，而是它在暗示接下来能力演进的主轴。上层应用做路线选择时，往往就靠这些信号调整优先级。',
      '真正值得盯住的不是这一条发布，而是它背后暴露出的模型资源配置和路线选择。谁被连续加码，谁就更可能成为下一个主要战场。',
      '表面上像一次常规更新，实质上更像模型团队在给生态提前打路线灯。越早看懂方向，越有机会抢到上层产品的时间差。'
    ], occurrenceIndex);
  }

  if (signals.includes('workflow')) {
    return pickVariant([
      '生成式 UI 不只是新花样，它开始改写产品交互和工作流边界，背后是软件形态在变。用户未来面对的，可能不再是固定页面，而是按任务实时长出来的界面。',
      '这类想法最有意思的地方，是它在推动界面从固定页面走向按任务即时生成。界面如果会跟着目标变化，软件就更像一个可编排的流程层。',
      '一旦生成式 UI 跑通，很多产品竞争会从“功能多少”转向“工作流是否更自然”。看起来像设计问题，本质上其实是产品架构问题。',
      '这类动态背后真正的新意，是界面开始围着任务生成，而不是让用户去适应固定页面。谁先把生成式 UI 接进真实数据，谁就更可能重写体验上限。',
      '如果生成式 UI 成为常态，未来不少产品的优势都会来自更顺滑的任务组织方式。届时 UI 本身会成为智能系统的一部分，而不是最后一层壳。'
    ], occurrenceIndex);
  }

  if (signals.includes('infrastructure')) {
    return pickVariant([
      '真正拉开差距的，往往不是模型本身，而是支付、集成、部署这些最影响交付效率的脏活。越靠近生产环境，越能看出基础设施的重要性。',
      '模型之外，真正决定产品能不能跑顺的，常常是 billing、集成和部署这些基础设施细节。用户看到的是功能，团队付出的却是系统摩擦成本。',
      '很多 AI 产品最后赢不赢，不在模型参数，而在这些最琐碎却最关键的工程环节。基础设施做顺了，功能优势才能真正被用户感知。'
    ], occurrenceIndex);
  }

  if (signals.includes('agent')) {
    return pickVariant([
      'Agent 正从演示阶段走向真实工作流，接下来真正拼的是稳定性、接入深度和容错能力。能持续跑一个月的 agent，往往比惊艳十分钟的 demo 更值钱。',
      'Agent 现在最值得关注的，不是它能不能惊艳演示，而是能不能长期接管真实任务。只要还需要人频繁接管，它就很难变成真正的生产力。',
      '当 Agent 开始进入真实工作流，竞争重点就会从能力展示转向可靠性和接入深度。模型在变强，但产品壁垒会越来越落在流程和系统接入上。',
      '大家已经不太缺 Agent demo 了，下一阶段真正稀缺的是能稳定跑进业务里的 Agent。越靠近真实场景，越考验细节而不是幻觉式惊艳。',
      'Agent 这条线正在从“看起来很聪明”转向“能不能持续交付结果”，门槛明显抬高了。很多团队会在这一阶段被工程现实重新筛一遍。',
      '现在判断 Agent 值不值得追，不是看它会多少技能，而是看它能否稳定嵌进现有流程。能接住原有系统的 agent，才更接近真正的产品。'
    ], occurrenceIndex);
  }

  if (signals.includes('devtools')) {
    return pickVariant([
      '开发门槛还在降，但产品判断、系统设计和工作流编排的门槛其实正在变高。写得出来越来越不稀缺，知道该写什么反而更关键。',
      '写代码的成本在继续下降，真正稀缺的反而是产品判断和系统抽象能力。AI 工具越普及，越会放大人与人之间对问题定义能力的差异。',
      '工具越强，越说明开发者的价值会往判断力、架构力和工作流设计上迁移。以后真正贵的，不会是代码量，而是正确的技术和产品决策。',
      '代码生成越来越便宜之后，真正拉开差距的反而是怎么拆问题、怎么设计系统。谁更会组织任务，谁就更能把 AI 工具用成杠杆。',
      'AI 正在压低写代码的门槛，但也在抬高对产品 sense 和系统能力的要求。开发者的角色并没有变轻，反而更接近导演和架构师。'
    ], occurrenceIndex);
  }

  if (signals.includes('distribution')) {
    return pickVariant([
      '分发能力正在变成产品本身，能持续触达并留住用户的团队，会越来越占优势。对 AI 产品来说，能不能形成重复触达，常常比一次爆发更重要。',
      '在 AI 同质化加剧之后，能不能稳定触达用户，已经越来越像产品竞争的一部分。流量入口和产品体验正在被更紧地绑在一起。',
      '现在很多增长优势并不来自功能领先，而来自谁更懂得把分发做成持续关系。尤其在 AI 领域，用户记住谁，往往先于用户理解谁更强。'
    ], occurrenceIndex);
  }

  if (signals.includes('product')) {
    return pickVariant([
      '这更像需求结构在变，不只是做了个新功能，而是产品优先级和用户预期都在重排。很多时候，用户真正要的并不是更多功能，而是更少阻力。',
      '比起单点功能更新，这更像用户需求顺序在变化，产品判断也得跟着改。谁能更快识别“需求排序”变化，谁就更容易领先半步。',
      '这类动态通常说明产品优先级在移动，团队开始重新理解什么才是用户真正买单的点。产品路线的胜负，往往就藏在这种微小调整里。'
    ], occurrenceIndex);
  }

  if (signals.includes('research')) {
    return pickVariant([
      '重点不在论文标题，而在它最后能不能沉淀成开发者真正能调用、用户真正能感知的新能力。研究只有进入工具链，才会变成产业变量。',
      '研究信息真正值得跟的，不是论文名字，而是它能不能落成下一代产品能力。能被做进接口和工作流的研究，才更值得持续追踪。',
      '论文热度本身不重要，重要的是它最后有没有机会变成开发者手里的实际能力。论文到产品之间的距离，往往才决定商业价值。'
    ], occurrenceIndex);
  }

  return pickVariant([
    '这条还不算定论，但值得继续跟，看它会不会从一个观点长成真实、稳定、可复用的需求。很多好机会，最早都长得像一句半成型的判断。',
    '现在还不能下结论，但它已经露出一点苗头，值得继续观察后续有没有真实需求接住。能不能被反复使用，决定了它是灵感还是产品。',
    '眼下更像一个信号而非结论，关键看它后面会不会演化成可持续的用户需求。真正值得下注的，通常不是热度，而是复用频率。'
  ], occurrenceIndex);
}

function nextCommentIndex(text, commentState) {
  const signals = identifySignals(text || '');
  const signature = getCommentSignature(signals);
  const occurrenceIndex = commentState.get(signature) || 0;
  commentState.set(signature, occurrenceIndex + 1);
  return occurrenceIndex;
}

function attachAnalysisContext(builders) {
  const postsByHandle = new Map();

  for (const item of builders) {
    if (!item || item.isSummary || !item.handle) {
      continue;
    }

    const handle = item.handle.toLowerCase();
    const bucket = postsByHandle.get(handle) || [];
    bucket.push(item);
    postsByHandle.set(handle, bucket);
  }

  for (const item of builders) {
    if (!item || item.isSummary || !item.handle) {
      continue;
    }

    const context = [];
    const sameAuthorPosts = (postsByHandle.get(item.handle.toLowerCase()) || [])
      .filter((entry) => entry !== item)
      .slice(0, 2)
      .map((entry) => truncateText(entry.summaryEn || entry.summary || '', 120));

    if (item.role && item.role !== 'AI Builder') {
      context.push(`作者身份：${item.role}`);
    }

    if (sameAuthorPosts.length) {
      context.push(`同作者近 24 小时其他动态：${sameAuthorPosts.join(' / ')}`);
    }

    if (context.length) {
      item.analysisContext = context.join('\n');
    }
  }

  return builders;
}

function buildAnalysisMessages(batch) {
  const items = batch.map((entry, index) => ({
    index,
    name: entry.name,
    handle: entry.handle,
    role: entry.role,
    url: entry.url,
    text: entry.summaryEn || entry.summary || '',
    context: entry.analysisContext || ''
  }));

  return [
    {
      role: 'system',
      content: [
        '你是 AI Builders Daily 的中文主笔。',
        '请基于推文内容，为每条推文写 1 段有洞见的中文解读。',
        '要求：',
        '1. 每条 140 到 260 个中文字符，写成 2 到 4 句完整中文。',
        '2. 第一句必须直接解释这条推文具体在说什么，不能空泛开场。',
        '3. 后面再补一层更深的判断：它反映的是产品动作、模型路线、组织变化、分发策略、商业化压力，还是用户需求变化；判断必须贴着原文细节展开。',
        '4. 如果提供了作者身份或同作者近期动态，要把这些上下文用进去，让分析更具体，而不是只就单条文本泛泛发挥。',
        '5. 可以推断，但必须克制。如果信息不够，就用“从这条本身看，更像是……”这类表述守住事实边界。',
        '6. 禁止模板化空话，例如“值得关注”“说明行业发展很快”“反映了趋势”“这预示着未来”“可以持续观察”。',
        '7. 不要复述原文，不要用大而空的结论，不要写成官腔或投资腔。',
        '8. 同一批输出的措辞要明显错开，不要像同一个句型换词。',
        '9. 不用 markdown，不要分点，不要加标题，不要引用引号。',
        '10. 只返回 JSON：{"items":[{"index":0,"analysis":"..."}, ...]}'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({ items }, null, 2)
    }
  ];
}

async function requestZhipuAnalyses(batch, config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;

  try {
    response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.62,
        response_format: {
          type: 'json_object'
        },
        messages: buildAnalysisMessages(batch)
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Zhipu API timeout after ${config.timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error?.message || payload.msg || `HTTP ${response.status}`;
    throw new Error(`Zhipu API error: ${message}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  const parsed = parseJsonResponse(content);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];

  if (!items.length) {
    throw new Error('Zhipu API returned no analysis items.');
  }

  return items;
}

async function requestZhipuDailySummary(builders, config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;

  try {
    response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.5,
        response_format: {
          type: 'json_object'
        },
        messages: buildDailySummaryMessages(builders)
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Zhipu daily summary timeout after ${config.timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error?.message || payload.msg || `HTTP ${response.status}`;
    throw new Error(`Zhipu API error: ${message}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  const parsed = parseJsonResponse(content);
  const summary = normalizeAnalysisText(parsed?.summary || '');

  if (!summary) {
    throw new Error('Zhipu API returned no daily summary.');
  }

  return summary;
}

async function enrichAnalysesWithModel(builders) {
  const config = getAiAnalysisConfig();
  if (!config) {
    for (const item of builders) {
      delete item.analysisContext;
    }
    return builders;
  }

  const posts = builders.filter((item) => !item.isSummary && item.summaryEn);
  if (!posts.length) {
    return builders;
  }

  console.log(`Generating AI analyses with ${config.provider}:${config.model}...`);

  const batches = chunkItems(posts, config.batchSize);
  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`AI analysis batch ${batchIndex + 1}/${batches.length}`);
    const resolvedIndexes = new Set();
    let results = [];

    try {
      results = await requestZhipuAnalyses(batch, config);
    } catch (error) {
      console.log(`Batch AI analysis failed, retrying individually: ${error.message}`);
    }

    for (const item of results) {
      const entry = batch[item.index];
      const analysis = normalizeAnalysisText(item.analysis);

      if (entry && analysis.length >= MIN_MODEL_ANALYSIS_LENGTH) {
        entry.analysis = analysis;
        resolvedIndexes.add(item.index);
      }
    }

    const unresolved = batch.filter((_, index) => !resolvedIndexes.has(index));
    for (const entry of unresolved) {
      try {
        const [single] = await requestZhipuAnalyses([entry], config);
        const analysis = normalizeAnalysisText(single?.analysis);
        if (analysis.length >= MIN_MODEL_ANALYSIS_LENGTH) {
          entry.analysis = analysis;
        }
      } catch (error) {
        console.log(`Single-item AI analysis fallback failed for ${entry.handle}: ${error.message}`);
      }
    }
  }

  for (const item of builders) {
    delete item.analysisContext;
  }

  return builders;
}

function generateDailySummary(builders) {
  const sourcePosts = builders.filter(item => !item.isSummary);
  const uniqueBuilders = new Set(sourcePosts.map(item => item.handle)).size;
  const combinedText = sourcePosts.map(item => item.summaryEn || item.summary || '').join('\n').toLowerCase();
  const signals = identifySignals(combinedText);
  const themes = [];

  if (signals.includes('agent')) themes.push('Agent 正从 demo 走向真实工作流');
  if (signals.includes('models')) themes.push('模型厂商持续向外释放路线信号');
  if (signals.includes('distribution')) themes.push('内容、社群和分发继续绑定');
  if (signals.includes('infrastructure')) themes.push('支付、集成、部署这些基础设施更受重视');
  if (signals.includes('workflow')) themes.push('生成式 UI 和新工作流开始冒头');
  if (signals.includes('devtools')) themes.push('开发范式继续向 AI 原生迁移');

  const lead = `今天共追踪到 ${uniqueBuilders} 位 builder 的 ${sourcePosts.length} 条动态。`;
  const body = themes.slice(0, 3).join('；');
  const close = '整体看，竞争重点正从单点模型能力，转向工作流整合、分发效率和更快的商业化闭环。';

  return `${lead}${body ? body + '；' : ''}${close}`.slice(0, 200);
}

async function generateDailySummaryWithModel(builders) {
  const sourcePosts = builders.filter((item) => !item.isSummary);
  if (!sourcePosts.length) {
    return '';
  }

  const config = getAiAnalysisConfig();
  if (!config) {
    return generateDailySummary(builders);
  }

  try {
    return await requestZhipuDailySummary(sourcePosts, config);
  } catch (error) {
    console.log(`Falling back to rule-based daily summary: ${error.message}`);
    return generateDailySummary(builders);
  }
}

// 默认数据
const defaultData = [
  {
    name: "Swyx",
    handle: "swyx",
    role: "AI Engineer & Latent Space Podcast",
    avatar: "S",
    summary: "分享了 AI 开发相关内容",
    summaryEn: "Exploring AI development trends",
    analysis: "Swyx 是 AI 开发领域的知名布道者，常分享前沿工具和趋势。他的 Latent Space 播客是了解 AI 工程最新动态的重要渠道。",
    url: "https://x.com/swyx",
    verified: false
  }
];

function pickRole(postText, handle = '', name = '') {
  const text = (postText || '').toLowerCase();
  const handleLower = String(handle || '').toLowerCase();
  const nameLower = String(name || '').toLowerCase();

  const roleMap = {
    thenanyu: 'Product & Growth',
    amasad: 'CEO @Replit',
    alchainhust: 'AI Workflow Builder',
    yihui_indie: 'AI Coding Creator',
    hwwaanng: 'AI Coding Observer',
    oran_ge: 'Orange AI',
    danshipper: 'CEO @Every',
    openai: 'AI Research Lab',
    claudeai: "Anthropic's Claude",
    levie: 'CEO @Box',
    turingou: 'AI Product Builder',
    zarazhangrui: 'AI Product Builder'
  };

  if (roleMap[handleLower]) {
    return roleMap[handleLower];
  }

  if (nameLower === 'openai' || text.includes('openai')) return 'AI Research Lab';
  if (nameLower === 'claude' || handleLower.includes('claude') || text.includes('anthropic')) return "Anthropic's Claude";
  if (text.includes('replit')) return 'Developer Tools';
  if (text.includes('product')) return 'Product Builder';
  if (text.includes('agent') || text.includes('codex')) return 'AI Tools Builder';
  if (text.includes('founder')) return 'Founder';

  return 'Independent Builder';
}

function buildBuilderEntry(post, metadataCache, commentState) {
  const handle = post.author;
  const cached = metadataCache.get(handle.toLowerCase());
  const name = cached?.name || handle;
  const role = cached?.bio || cached?.role || pickRole(post.text, handle, name);
  const occurrenceIndex = nextCommentIndex(post.text, commentState);

  return {
    name,
    handle,
    role,
    avatar: cached?.avatar || buildAvatar(name, handle),
    summary: truncateText(post.text, MAX_CARD_SUMMARY_LENGTH),
    summaryEn: truncateText(post.text, MAX_CARD_SUMMARY_LENGTH),
    analysis: generateAnalysis(name, handle, post.text, role, { occurrenceIndex }),
    url: post.statusUrl || `https://x.com/${handle}`,
    verified: cached?.verified || false,
    hotComments: Array.isArray(post.hotComments)
      ? post.hotComments
          .filter((comment) => comment && comment.text && (comment.likes || 0) >= 5)
          .slice(0, 3)
          .map((comment) => ({
            author: comment.author || '',
            text: truncateText(comment.text, 220),
            likes: Number(comment.likes) || 0,
            url: comment.statusUrl || ''
          }))
      : []
  };
}

// 从本地 x-list-monitor 获取数据
async function fetchFromLocalXList() {
  try {
    const postsPath = path.join(LOCAL_X_MONITOR_DIR, 'data', 'posts.json');

    if (!fs.existsSync(postsPath)) {
      console.log(`Local x-list-monitor posts not found at ${postsPath}`);
      return null;
    }

    console.log(`Found local x-list-monitor data, loading from ${postsPath}...`);

    const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
    const thresholdMs = Date.now() - 24 * 60 * 60 * 1000;

    const filteredPosts = posts
      .filter(post => post && post.author && post.text && post.statusUrl)
      .filter(post => !post.isReply && !post.isRepost)
      .filter(post => post.text.length >= 20 && !post.text.startsWith('http'))
      .filter(post => Date.parse(post.timestamp) >= thresholdMs)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    const activeHandles = Array.from(new Set(
      filteredPosts
        .map((post) => post.author)
        .filter(Boolean)
    ));

    if (!SHOULD_SKIP_PROFILE_SYNC) {
      await syncProfilesFromX(activeHandles);
    }

    const metadataCache = new Map([
      ...loadExistingMetadata(),
      ...loadProfilesMetadata()
    ]);

    const byHandle = new Map();
    for (const post of filteredPosts) {
      const bucket = byHandle.get(post.author) || [];
      if (bucket.length < 2) {
        bucket.push(post);
        byHandle.set(post.author, bucket);
      }
    }

    const builders = [];
    const commentState = new Map();
    for (const handlePosts of byHandle.values()) {
      for (const post of handlePosts) {
        builders.push(buildBuilderEntry(post, metadataCache, commentState));
      }
    }

    attachAnalysisContext(builders);
    await enrichAnalysesWithModel(builders);

    const dailySummary = await generateDailySummaryWithModel(builders);

    builders.push({
      name: '今日总结',
      handle: 'daily_brief',
      role: 'Builder Daily',
      avatar: 'BD',
      summary: dailySummary,
      summaryEn: dailySummary,
      analysis: '',
      url: '',
      verified: false,
      isSummary: true,
      hotComments: []
    });

    console.log(`Built ${builders.length} cards from local x-list-monitor data`);

    if (builders.length > 0) {
      return builders;
    }
  } catch (error) {
    console.log('Could not fetch from local x-list-monitor:', error.message);
  }

  return null;
}

// 从 follow-builders skill 获取数据
async function fetchFromFollowBuilders() {
  try {
    const skillPath = process.env.CLAUDE_SKILL_DIR ||
                      process.env.HOME + '/.agents/skills/follow-builders';
    const prepareScript = path.join(skillPath, 'scripts/prepare-digest.js');

    if (fs.existsSync(prepareScript)) {
      console.log('Found follow-builders skill, fetching data...');

      const { execSync } = require('child_process');
      const result = execSync(`cd ${path.dirname(prepareScript)} && node prepare-digest.js 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 120000
      });

      const data = JSON.parse(result);
      const builders = [];
      const commentState = new Map();

      // 处理 X/Twitter 数据
      if (data.x && Array.isArray(data.x)) {
        for (const builder of data.x) {
          if (builder.tweets && builder.tweets.length > 0) {
            // 取每个 builder 的前 2 条推文
            const tweetsToAdd = builder.tweets.slice(0, 2);

            for (const tweet of tweetsToAdd) {
              // 跳过纯链接推文
              if (!tweet.text || tweet.text.startsWith('http') || tweet.text.length < 20) {
                continue;
              }

              console.log(`Generating analysis for ${builder.name}...`);

              // 生成发散性分析
              const occurrenceIndex = nextCommentIndex(tweet.text, commentState);
              const analysis = generateAnalysis(
                builder.name,
                builder.handle,
                tweet.text,
                builder.bio,
                { occurrenceIndex }
              );

              builders.push({
                name: builder.name,
                handle: builder.handle,
                role: builder.bio || 'AI Builder',
                avatar: builder.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
                summary: truncateText(tweet.text, MAX_CARD_SUMMARY_LENGTH),
                summaryEn: truncateText(tweet.text, MAX_CARD_SUMMARY_LENGTH),
                analysis: analysis,
                url: tweet.url || `https://x.com/${builder.handle}`,
                verified: builder.verified || false,
                hotComments: []
              });
            }
          }
        }
      }

      attachAnalysisContext(builders);
      await enrichAnalysesWithModel(builders);

      if (builders.length > 0) {
        return builders;
      }
    }
  } catch (error) {
    console.log('Could not fetch from follow-builders:', error.message);
  }

  return null;
}

// 更新 data.json
function updateDataJson(buildersData) {
  const dataPath = path.join(__dirname, '..', 'data.json');
  fs.writeFileSync(dataPath, JSON.stringify(buildersData, null, 2));
  console.log(`Updated data.json with ${buildersData.length} builders`);
  return true;
}

// 主函数
async function main() {
  console.log('Fetching daily digest data...');

  let data = await fetchFromLocalXList();

  if (!data) {
    data = await fetchFromFollowBuilders();
  }

  if (!data) {
    console.log('Using default data...');
    data = defaultData;
  }

  updateDataJson(data);
  console.log('Update completed successfully!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
