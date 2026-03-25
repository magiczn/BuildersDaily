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

  const roleContext = identifyRole(role, name);
  const signals = identifySignals(text);
  const parts = [
    roleContext.intro + buildLead(signals),
    buildCoreInsight(signals),
    buildWhyItMatters(signals, roleContext)
  ].filter(Boolean);

  return parts.join('');
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

function buildLead(signals) {
  if (signals.includes('infrastructure') && signals.includes('product')) {
    return '看似是在聊一个具体功能点，真正值得写进头条的是 AI 产品从“能跑”走向“可运营”的工程化门槛。';
  }

  if (signals.includes('distribution') && signals.includes('monetization')) {
    return '这不只是一次内容更新，更像是在验证 AI 时代“内容、社群、交易”能不能真正闭环。';
  }

  if (signals.includes('agent')) {
    return '如果把它放进今天的 AI 版图里看，核心不是一句观点本身，而是 Agent 能力正在从演示阶段跨进真实工作流。';
  }

  if (signals.includes('models')) {
    return '这类表态值得重点关注，因为它往往不只是某个功能更新，而是模型能力路线和资源投入方向的提前外露。';
  }

  if (signals.includes('devtools')) {
    return '这条动态真正有价值的地方，不是一个工具技巧，而是开发范式仍在向 AI 原生继续迁移。';
  }

  if (signals.includes('workflow')) {
    return '表面上看像是在聊一个产品点子，但更值得媒体视角追踪的是交互形态和工作流边界正在被重新定义。';
  }

  if (signals.includes('product')) {
    return '重点不在一句话的新鲜感，而在它暴露了真实用户需求和产品取舍的优先级。';
  }

  return '这不是一条简单的动态更新，背后折射的是 AI 生态正在发生的结构性变化。';
}

function buildCoreInsight(signals) {
  const sentences = [];

  if (signals.includes('agent')) {
    sentences.push('过去行业讨论 Agent，更多停留在“会不会做”；现在真正拉开差距的，已经变成“能不能稳定接进浏览器、支付、协作、数据系统这些脏活累活”。');
  }

  if (signals.includes('infrastructure')) {
    sentences.push('这类内容的新闻价值在于提醒我们，AI 产品竞争不只发生在模型层，真正决定留存和转化的，往往是 billing、webhook、权限、集成这些看起来不性感、但极度影响交付速度的基础设施细节。');
  }

  if (signals.includes('distribution')) {
    sentences.push('从编辑部的观察视角看，AI 创业越来越像“产品力 + 分发力”双轮驱动，谁能把内容、社群和用户触达串起来，谁就更容易把一次曝光变成长期关系。');
  }

  if (signals.includes('monetization')) {
    sentences.push('这里还透露出一个非常现实的行业趋势：不少 AI 产品不再先追求完美技术栈，而是优先压缩商业化链路的复杂度，让创作者或小团队尽快把收入闭环跑起来。');
  }

  if (signals.includes('launch')) {
    sentences.push('高频发布本身已经成为 AI 公司的能力展示：不是为了刷存在感，而是用更短反馈回路去占领用户心智和工作流入口。');
  }

  if (signals.includes('research')) {
    sentences.push('如果放到更大的 AI 版图里看，这类信息往往意味着“研究成果正在被包装成可消费的叙事”，而真正值得继续跟踪的是它有没有形成新的能力壁垒。');
  }

  if (signals.includes('devtools')) {
    sentences.push('对开发者来说，这说明门槛正在重新分配: 低价值的重复实现会继续被工具吞掉，而对系统设计、产品判断、工作流编排的要求反而更高。');
  }

  if (signals.includes('workflow')) {
    sentences.push('更深一层看，这类想法指向的是 AI 产品不再只是“回答问题”，而是开始接管界面生成、状态编排和业务数据映射，用户面对的会是更动态、也更不稳定但更高效的产品外壳。');
  }

  if (signals.includes('models')) {
    sentences.push('模型厂商每一次公开表态，其实都在给生态发信号：接下来会重点押注生成质量、交互形态，还是工具调用与代理能力，这会直接影响上层应用的产品路线。');
  }

  if (signals.includes('capital')) {
    sentences.push('资本和并购视角也不能忽略，因为很多产品方向之所以突然升温，背后往往是资源重配和平台级玩家的战略下注。');
  }

  if (sentences.length === 0) {
    sentences.push('真正值得媒体持续追踪的，不是表面的热闹，而是这条动态有没有暴露新的供给能力、用户行为变化，或者分发方式的切换。');
  }

  return sentences.slice(0, 2).join('');
}

function buildWhyItMatters(signals, roleContext) {
  if (signals.includes('agent') && signals.includes('infrastructure')) {
    return `站在${roleContext.perspective.replace('从', '').replace('视角', '')}看，下一阶段最值得下注的，可能不再是“再做一个聊天机器人”，而是把 Agent 无缝接入真实业务流程。`;
  }

  if (signals.includes('distribution')) {
    return '这也是为什么最近越来越多 builder 同时经营内容、社区和产品本身：在 AI 同质化越来越强的环境里，分发能力本身就是护城河。';
  }

  if (signals.includes('models')) {
    return '对媒体观察者来说，真正该追踪的不是一句“更强了”，而是这次投入最终会不会转化成开发者可调用的新能力与新工作流。';
  }

  if (signals.includes('infrastructure')) {
    return '所以这类动态虽然没有模型发布那么显眼，却往往更接近真实的产品护城河，因为它直接决定了交付效率和用户体验。';
  }

  if (signals.includes('devtools')) {
    return '长期看，这类变化会继续推高“一个人团队”的产能上限，也会把软件竞争进一步推向速度、判断力和分发效率。';
  }

  if (signals.includes('workflow')) {
    return '如果这条路继续走通，未来很多 SaaS 的差异化不再只是功能多少，而是谁能把生成能力更自然地嵌进真实工作流。';
  }

  return `放在${roleContext.perspective.replace('从', '').replace('视角', '')}里看，这条信息真正的价值在于它提示我们：AI 行业的竞争，已经从单点能力比拼转向更完整的产品系统竞争。`;
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
