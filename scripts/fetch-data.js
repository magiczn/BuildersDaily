const fs = require('fs');
const path = require('path');

const LOCAL_X_MONITOR_DIR = process.env.X_LIST_MONITOR_DIR ||
  '/Users/zhaonan/0-Projects/x-list-monitor';
const PROFILES_PATH = path.join(__dirname, '..', 'profiles.json');

// 文本截断函数
function truncateText(text, maxLength = 280) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
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
function generateAnalysis(name, text, role) {
  if (!text || text.length < 10 || text.startsWith('http')) {
    return '';
  }

  const signals = identifySignals(text);
  return buildShortComment(signals);
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

function buildShortComment(signals) {
  if (signals.includes('agent') && signals.includes('infrastructure')) {
    return 'Agent 竞争开始比拼真实接入能力。';
  }

  if (signals.includes('distribution') && signals.includes('monetization')) {
    return '内容、社群、交易正在长成同一条链。';
  }

  if (signals.includes('models')) {
    return '这更像模型路线信号，不只是功能预告。';
  }

  if (signals.includes('workflow')) {
    return '生成式 UI 正在重写产品交互边界。';
  }

  if (signals.includes('infrastructure')) {
    return '真正拉开差距的，常是支付和集成这些脏活。';
  }

  if (signals.includes('agent')) {
    return 'Agent 正从演示走向真实工作流。';
  }

  if (signals.includes('devtools')) {
    return '开发门槛在降，产品判断门槛在升。';
  }

  if (signals.includes('distribution')) {
    return '分发能力，正在变成产品本身。';
  }

  if (signals.includes('product')) {
    return '这更像需求变化，不只是功能炫技。';
  }

  if (signals.includes('research')) {
    return '重点不在论文，而在它能否变成新能力。';
  }

  return '值得继续看它会不会长成真实需求。';
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

function pickRole(postText) {
  const text = (postText || '').toLowerCase();

  if (text.includes('openai')) return 'AI Builder';
  if (text.includes('anthropic') || text.includes('claude')) return 'AI Builder';
  if (text.includes('agent') || text.includes('codex')) return 'AI Builder';
  if (text.includes('product')) return 'Product Builder';

  return 'AI Builder';
}

function buildBuilderEntry(post, metadataCache) {
  const handle = post.author;
  const cached = metadataCache.get(handle.toLowerCase());
  const name = cached?.name || handle;
  const role = cached?.role || pickRole(post.text);

  return {
    name,
    handle,
    role,
    avatar: cached?.avatar || buildAvatar(name, handle),
    summary: truncateText(post.text, 280),
    summaryEn: truncateText(post.text, 280),
    analysis: generateAnalysis(name, post.text, role),
    url: post.statusUrl || `https://x.com/${handle}`,
    verified: cached?.verified || false
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
    const metadataCache = new Map([
      ...loadExistingMetadata(),
      ...loadProfilesMetadata()
    ]);
    const thresholdMs = Date.now() - 24 * 60 * 60 * 1000;

    const filteredPosts = posts
      .filter(post => post && post.author && post.text && post.statusUrl)
      .filter(post => !post.isReply && !post.isRepost)
      .filter(post => post.text.length >= 20 && !post.text.startsWith('http'))
      .filter(post => Date.parse(post.timestamp) >= thresholdMs)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    const byHandle = new Map();
    for (const post of filteredPosts) {
      const bucket = byHandle.get(post.author) || [];
      if (bucket.length < 2) {
        bucket.push(post);
        byHandle.set(post.author, bucket);
      }
    }

    const builders = [];
    for (const handlePosts of byHandle.values()) {
      for (const post of handlePosts) {
        builders.push(buildBuilderEntry(post, metadataCache));
      }
    }

    builders.push({
      name: '今日总结',
      handle: 'daily_brief',
      role: 'Builder Daily',
      avatar: 'BD',
      summary: generateDailySummary(builders),
      summaryEn: generateDailySummary(builders),
      analysis: '',
      url: '',
      verified: false,
      isSummary: true
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
              const analysis = generateAnalysis(builder.name, tweet.text, builder.bio);

              builders.push({
                name: builder.name,
                handle: builder.handle,
                role: builder.bio || 'AI Builder',
                avatar: builder.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
                summary: truncateText(tweet.text, 280),
                summaryEn: truncateText(tweet.text, 280),
                analysis: analysis,
                url: tweet.url || `https://x.com/${builder.handle}`,
                verified: builder.verified || false
              });
            }
          }
        }
      }

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
