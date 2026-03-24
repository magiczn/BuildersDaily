#!/usr/bin/env node
/**
 * AI Builders Digest - 服务器端自动更新脚本
 *
 * 这个脚本在你的服务器上运行，每天定时从 follow-builders skill 获取最新数据
 * 并推送到 GitHub 仓库，GitHub Pages 会自动重新部署
 *
 * 使用方法:
 * 1. 设置环境变量 GITHUB_TOKEN (GitHub Personal Access Token)
 * 2. 设置环境变量 REPO (可选，默认: magiczn/nan-builders-digest)
 * 3. 运行: node scripts/deploy-server.js
 *
 * 定时任务 (crontab -e):
 * 0 8 * * * cd /path/to/project && node scripts/deploy-server.js >> logs/deploy.log 2>&1
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = process.env.REPO || 'magiczn/nan-builders-digest';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SKILL_PATH = process.env.FOLLOW_BUILDERS_PATH ||
                   `${process.env.HOME}/.agents/skills/follow-builders`;

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function runCommand(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', ...options });
  } catch (error) {
    throw new Error(`Command failed: ${cmd}\n${error.message}`);
  }
}

async function fetchFromFollowBuilders() {
  const prepareScript = path.join(SKILL_PATH, 'scripts/prepare-digest.js');

  if (!fs.existsSync(prepareScript)) {
    throw new Error(`follow-builders skill not found at: ${SKILL_PATH}`);
  }

  log('Fetching data from follow-builders skill...');

  const result = runCommand(`cd ${path.dirname(prepareScript)} && node prepare-digest.js 2>/dev/null`);
  const data = JSON.parse(result);

  const builders = [];

  // 处理 X/Twitter 数据
  if (data.x && Array.isArray(data.x)) {
    for (const builder of data.x) {
      if (builder.tweets && builder.tweets.length > 0) {
        // 取最近的一条推文
        const latestTweet = builder.tweets[0];

        // 生成头像缩写
        const avatar = builder.name
          .split(' ')
          .map(n => n[0])
          .join('')
          .substring(0, 2)
          .toUpperCase();

        // 生成中文摘要（如果有翻译）
        const summaryZh = latestTweet.textZh ||
          latestTweet.text.substring(0, 150) +
          (latestTweet.text.length > 150 ? '...' : '');

        builders.push({
          name: builder.name,
          handle: builder.handle,
          role: builder.bio || 'AI Builder',
          avatar: avatar,
          summary: summaryZh,
          summaryEn: latestTweet.text,
          url: latestTweet.url || `https://x.com/${builder.handle}/status/${latestTweet.id}`,
          verified: builder.verified || false,
          _updated: new Date().toISOString()
        });
      }
    }
  }

  // 处理 Podcast 数据（如果有）
  if (data.podcasts && Array.isArray(data.podcasts) && data.podcasts.length > 0) {
    const podcast = data.podcasts[0];
    builders.push({
      name: podcast.name || 'AI Podcast',
      handle: 'podcast',
      role: 'Podcast Episode',
      avatar: 'POD',
      summary: `最新一期: ${podcast.title}`,
      summaryEn: podcast.title,
      url: podcast.url,
      verified: true,
      _updated: new Date().toISOString()
    });
  }

  log(`Fetched ${builders.length} items from follow-builders`);
  return builders;
}

async function updateGitHub(data) {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }

  const tempDir = `/tmp/nan-builders-digest-${Date.now()}`;

  try {
    // 克隆仓库
    log('Cloning repository...');
    runCommand(`git clone https://${GITHUB_TOKEN}@github.com/${REPO}.git ${tempDir}`);

    // 写入数据
    const dataPath = path.join(tempDir, 'data.json');
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

    // 提交并推送
    log('Committing changes...');
    runCommand(`cd ${tempDir} && git config user.email "deploy@server.local" && git config user.name "Deploy Bot"`);
    runCommand(`cd ${tempDir} && git add data.json`);

    // 检查是否有变更
    const status = runCommand(`cd ${tempDir} && git status --porcelain`);
    if (!status.trim()) {
      log('No changes to commit');
      return;
    }

    const date = new Date().toISOString().split('T')[0];
    runCommand(`cd ${tempDir} && git commit -m "Update daily digest: ${date} - ${data.length} items"`);

    log('Pushing to GitHub...');
    runCommand(`cd ${tempDir} && git push origin main`);

    log('Update completed successfully!');
  } finally {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      runCommand(`rm -rf ${tempDir}`);
    }
  }
}

async function main() {
  log('Starting daily digest update...');

  try {
    // 获取数据
    const data = await fetchFromFollowBuilders();

    if (data.length === 0) {
      log('No new data found, skipping update');
      return;
    }

    // 更新 GitHub
    await updateGitHub(data);

    log('All done!');
  } catch (error) {
    log(`Error: ${error.message}`);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { fetchFromFollowBuilders, updateGitHub };
