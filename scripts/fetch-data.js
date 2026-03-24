const fs = require('fs');
const path = require('path');

// 文本截断函数
function truncateText(text, maxLength = 280) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

// 生成发散性中文分析（不依赖外部 API）
function generateAnalysis(name, text, role) {
  if (!text || text.length < 10 || text.startsWith('http')) {
    return '';
  }

  // 基于角色和内容生成发散性分析
  const roleKeywords = {
    'OpenAI': 'OpenAI 在 AI 领域持续领先，',
    'Anthropic': 'Anthropic 的 AI 安全理念，',
    'Google': 'Google 的 AI 产品化能力，',
    'YC': '作为 YC 领导者，',
    'Replit': 'Replit 展示了云端开发的未来，',
    'VC': '从投资视角看，',
    'CEO': '从企业领导者视角，',
    'Product': '从产品角度分析，'
  };

  // 检测关键词并生成发散性分析
  let analysis = '';
  
  if (text.includes('AI') || text.includes('agent') || text.includes('Agent')) {
    analysis = `${name} 的观点反映了 AI 领域的最新趋势。`;
  } else if (text.includes('ship') || text.includes('launch')) {
    analysis = `这展示了 AI 公司的快速迭代能力。`;
  } else if (text.includes('science') || text.includes('research')) {
    analysis = `AI 正在推动科学研究的范式转变。`;
  } else if (text.includes('computer use') || text.includes('code')) {
    analysis = `这预示着 AI Agent 在未来工作流中的核心地位。`;
  } else {
    analysis = `${name} 分享的观点值得关注，反映了行业动态。`;
  }

  // 添加发散性观点
  const extensions = [
    '未来可能重塑行业标准。',
    '这预示着技术发展的新方向。',
    '值得关注后续发展。',
    '可能对创业生态产生深远影响。',
    '体现了 AI 原生开发的趋势。'
  ];

  analysis += extensions[Math.floor(Math.random() * extensions.length)];

  // 控制在100字以内
  if (analysis.length > 100) {
    analysis = analysis.substring(0, 97) + '...';
  }

  return analysis;
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
            const latestTweet = builder.tweets[0];

            console.log(`Generating analysis for ${builder.name}...`);

            // 生成发散性分析
            const analysis = generateAnalysis(builder.name, latestTweet.text, builder.bio);

            builders.push({
              name: builder.name,
              handle: builder.handle,
              role: builder.bio || 'AI Builder',
              avatar: builder.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
              summary: truncateText(latestTweet.text, 280),
              summaryEn: truncateText(latestTweet.text, 280),
              analysis: analysis,
              url: latestTweet.url || `https://x.com/${builder.handle}`,
              verified: builder.verified || false
            });
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
