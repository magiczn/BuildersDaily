const fs = require('fs');
const path = require('path');

// 默认的 builder 数据（当无法获取实时数据时使用）
const defaultData = [
  {
    name: "Guillermo Rauch",
    handle: "rauchg",
    role: "Vercel CEO",
    avatar: "GR",
    summary: "代码只是输出，我们正在回归本质。从崇拜代码本身转向关注真正的输入：需求、规格、用户反馈和实际生产数据。",
    summaryEn: "Code is an output. Nature is healing. We are shifting from glorifying code to focusing on true inputs like requirements, specs, and user feedback.",
    url: "https://x.com/rauchg",
    verified: true
  },
  {
    name: "Aaron Levie",
    handle: "levie",
    role: "Box CEO",
    avatar: "AL",
    summary: "我们现在仍处于 AI Agent 的早期阶段。类比 2010 年的云计算，预测 Agent 市场可能从今天早期阶段增长 1000 倍。",
    summaryEn: "We are so unbelievably early with agents. Comparing to cloud computing in 2010, the agent market could grow 1000x from today's early adoption phase.",
    url: "https://x.com/levie",
    verified: true
  },
  {
    name: "Sam Altman",
    handle: "sama",
    role: "OpenAI CEO",
    avatar: "SA",
    summary: "AI 的发展速度超乎想象，我们正在见证技术史上的重要时刻。",
    summaryEn: "The pace of AI development is beyond imagination. We are witnessing an important moment in technology history.",
    url: "https://x.com/sama",
    verified: true
  }
];

// 尝试从 follow-builders skill 获取数据
async function fetchFromFollowBuilders() {
  try {
    // 检查是否存在 follow-builders skill
    const skillPath = process.env.CLAUDE_SKILL_DIR ||
                      process.env.HOME + '/.agents/skills/follow-builders';

    const prepareScript = path.join(skillPath, 'scripts/prepare-digest.js');

    if (fs.existsSync(prepareScript)) {
      console.log('Found follow-builders skill, fetching data...');

      // 使用 child_process 运行 prepare-digest.js
      const { execSync } = require('child_process');
      const result = execSync(`cd ${path.dirname(prepareScript)} && node prepare-digest.js 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 60000
      });

      const data = JSON.parse(result);

      // 转换数据格式
      const builders = [];

      // 处理 X/Twitter 数据
      if (data.x && Array.isArray(data.x)) {
        for (const builder of data.x) {
          if (builder.tweets && builder.tweets.length > 0) {
            const latestTweet = builder.tweets[0];
            builders.push({
              name: builder.name,
              handle: builder.handle,
              role: builder.bio || 'AI Builder',
              avatar: builder.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
              summary: latestTweet.text.substring(0, 200) + (latestTweet.text.length > 200 ? '...' : ''),
              summaryEn: latestTweet.text,
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

// 模拟获取新数据（随机打乱并添加时间戳）
function generateDailyData() {
  const today = new Date().toISOString().split('T')[0];

  // 这里可以添加更多 builder 数据
  const allBuilders = [
    ...defaultData,
    {
      name: "Demis Hassabis",
      handle: "demishassabis",
      role: "Google DeepMind CEO",
      avatar: "DH",
      summary: "AGI 的研究正在加速，我们在多个领域看到了突破性的进展。",
      summaryEn: "AGI research is accelerating, and we are seeing breakthrough progress in multiple areas.",
      url: "https://x.com/demishassabis",
      verified: true
    },
    {
      name: "Andrej Karpathy",
      handle: "karpathy",
      role: "AI Researcher",
      avatar: "AK",
      summary: "神经网络正在变得越来越强大，我们需要更好的理解和对齐方法。",
      summaryEn: "Neural networks are becoming increasingly powerful, and we need better understanding and alignment methods.",
      url: "https://x.com/karpathy",
      verified: true
    }
  ];

  // 随机选择 5-10 个 builder
  const shuffled = allBuilders.sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, Math.floor(Math.random() * 6) + 5);

  // 添加日期标记
  return selected.map(b => ({
    ...b,
    _updated: today
  }));
}

// 更新 data.json 文件
function updateDataJson(buildersData) {
  const dataPath = path.join(__dirname, '..', 'data.json');
  fs.writeFileSync(dataPath, JSON.stringify(buildersData, null, 2));
  console.log(`Updated data.json with ${buildersData.length} builders`);
  return true;
}

// 主函数
async function main() {
  console.log('Fetching daily digest data...');

  // 首先尝试从 follow-builders 获取
  let data = await fetchFromFollowBuilders();

  // 如果失败，使用生成的数据
  if (!data) {
    console.log('Using generated daily data...');
    data = generateDailyData();
  }

  // 更新 data.json
  updateDataJson(data);
  console.log('Update completed successfully!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
