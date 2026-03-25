const fs = require('fs');
const path = require('path');

// 文本截断函数
function truncateText(text, maxLength = 280) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

// 生成深度中文分析
function generateAnalysis(name, text, role) {
  if (!text || text.length < 10 || text.startsWith('http')) {
    return '';
  }

  // 识别角色背景
  const roleContext = identifyRole(role, name);

  // 识别内容主题
  const themeContext = identifyTheme(text);

  // 生成深度分析
  let analysis = '';

  // 开头：角色背景引入
  analysis += roleContext.intro;

  // 中间：内容主题分析
  analysis += themeContext.analysis;

  // 结尾：行业影响展望
  analysis += themeContext.implication;

  return analysis;
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

function identifyTheme(text) {
  const textLower = text.toLowerCase();

  // AI Agent / Codex / Computer Use
  if (textLower.includes('agent') || textLower.includes('codex') || textLower.includes('computer use')) {
    return {
      analysis: '聚焦于 AI Agent 的实际落地应用，展示了从概念验证到生产环境的快速演进。这反映了行业正在从单纯的对话式 AI 向具备实际执行能力的智能体转型。',
      implication: '未来每个开发者都可能拥有专属的 AI 编程伙伴，软件开发范式将迎来根本性变革。'
    };
  }

  // 发布/上线
  if (textLower.includes('ship') || textLower.includes('launch') || textLower.includes('release') || textLower.includes('announce')) {
    return {
      analysis: '展示了 AI 公司惊人的迭代速度——从想法到上线以天计而非月计。这种高频发布节奏已成为 AI 原生公司的标配，体现了用 AI 构建 AI 的效率优势。',
      implication: '传统软件公司的开发周期将被彻底颠覆，快速试错和数据驱动成为核心竞争力。'
    };
  }

  // 科学研究
  if (textLower.includes('science') || textLower.includes('research') || textLower.includes('paper') || textLower.includes('study')) {
    return {
      analysis: '揭示了 AI 在科研领域的突破性应用。从数据分析到假设生成，AI 正在成为科学家的超级助手，加速发现的节奏。',
      implication: 'AI + Science 的结合将催生更多跨学科突破，科研门槛降低的同时也带来了新的伦理挑战。'
    };
  }

  // 收购/投资
  if (textLower.includes('acquire') || textLower.includes('invest') || textLower.includes('fund') || textLower.includes('raise')) {
    return {
      analysis: '反映了 AI 行业的资本热度与战略布局。巨头通过收购补齐能力短板，初创公司则获得资源加速商业化。',
      implication: '行业整合加速，人才和技术的争夺战将更加激烈，创业窗口期可能缩短。'
    };
  }

  // 编程/开发
  if (textLower.includes('code') || textLower.includes('developer') || textLower.includes('build') || textLower.includes('replit')) {
    return {
      analysis: '展示了 AI 时代的开发新范式。从代码补全到全栈生成，AI 正在重塑开发者的工作方式，降低技术门槛的同时提升创造力。',
      implication: '未来的开发者更像产品架构师，核心能力从写代码转向定义问题和设计解决方案。'
    };
  }

  // 产品/用户
  if (textLower.includes('user') || textLower.includes('product') || textLower.includes('customer') || textLower.includes('app')) {
    return {
      analysis: '强调了 AI 产品化的核心原则——以用户价值为导向。技术再先进，如果不能解决实际问题，就只是炫技。',
      implication: 'AI 创业将从技术驱动转向产品驱动，用户体验和场景理解成为关键差异化因素。'
    };
  }

  // 默认通用分析
  return {
    analysis: '反映了 AI 领域的最新动态和行业趋势。在技术快速迭代的当下，保持对前沿发展的关注至关重要。',
    implication: '这个方向值得持续追踪，可能孕育着下一个重要机会。'
  };
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

  let data = await fetchFromFollowBuilders();

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
