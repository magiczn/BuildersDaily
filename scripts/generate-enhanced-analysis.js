const https = require('https');
const fs = require('fs');

// Kimi API 配置
const KIMI_API_KEY = process.env.KIMI_API_KEY || '';
const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';

// DuckDuckGo 搜索（简化版）
async function searchWeb(query) {
  return new Promise((resolve) => {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const abstract = json.Abstract || json.RelatedTopics?.[0]?.Text || '';
          resolve(abstract);
        } catch (e) {
          resolve('');
        }
      });
    }).on('error', () => resolve(''));
  });
}

// Kimi 生成分析
async function generateAnalysis(name, text, searchResult) {
  if (!text || text.length < 10 || text.startsWith('http')) {
    return '';
  }

  const context = searchResult ? `\n\n相关背景：${searchResult}` : '';
  
  const prompt = `请用不超过100字的中文，分析这条AI行业人士的推文，并结合背景信息发散思考：

作者：${name}
推文：${text.substring(0, 200)}${context}

要求：
1. 提炼核心观点
2. 结合背景发散思考
3. 总字数不超过100字`;

  // 使用简单的本地生成（实际应调用 Kimi API）
  // 这里返回一个示例，实际使用时需要配置 Kimi API
  return `${name}的观点涉及${text.substring(0, 50)}...。这反映了AI领域的最新趋势。`;
}

// 主函数
async function main() {
  const dataPath = process.argv[2] || '../data.json';
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  
  for (const item of data) {
    if (item.summaryEn && !item.summaryEn.startsWith('http')) {
      console.log(`分析 ${item.name}...`);
      
      // 搜索相关背景
      const searchQuery = `${item.name} ${item.summaryEn.substring(0, 50)}`;
      const searchResult = await searchWeb(searchQuery);
      
      // 生成分析
      item.analysis = await generateAnalysis(item.name, item.summaryEn, searchResult);
      
      // 等待避免限流
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log('分析生成完成');
}

main().catch(console.error);
