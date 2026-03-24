#!/usr/bin/env node
/**
 * AI Builders Digest - 服务器端自动更新脚本
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 从环境变量读取配置
const REPO = process.env.REPO || 'magiczn/nan-builders-digest';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SKILL_PATH = process.env.FOLLOW_BUILDERS_PATH ||
               `${process.env.HOME}/.agents/skills/follow-builders`;

if (!GITHUB_TOKEN) {
  console.error('错误: GITHUB_TOKEN 环境变量未设置');
  process.exit(1);
}

// ... 其余代码保持不变 ...
