#!/bin/bash

# 每日更新脚本
PROJECT_DIR="/Users/zhaonan/0-Projects/NDN-NanDailyNews"
LOG_FILE="$PROJECT_DIR/logs/deploy-$(date +%Y-%m-%d).log"

cd $PROJECT_DIR

# 加载环境变量
export $(cat .env | xargs)

# 运行部署脚本
echo "=== $(date) ===" >> $LOG_FILE
node scripts/deploy-server.js >> $LOG_FILE 2>&1

echo "更新完成"
