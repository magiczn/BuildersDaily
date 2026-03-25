#!/bin/bash

# 每日更新脚本
PROJECT_DIR="/Users/zhaonan/0-Projects/NDN-NanDailyNews"
LOG_FILE="/tmp/nan-builders-$(date +%Y-%m-%d).log"

cd $PROJECT_DIR

echo "=== $(date) ===" >> $LOG_FILE

# 获取最新数据
echo "获取最新数据..." >> $LOG_FILE
node scripts/fetch-data.js >> $LOG_FILE 2>&1

# 检查是否有变化并提交
git add data.json
if ! git diff --cached --quiet; then
    git commit -m "chore: 更新每日数据 - $(date +'%Y-%m-%d')" >> $LOG_FILE 2>&1
    git push origin main >> $LOG_FILE 2>&1
    echo "$(date): 数据已更新并推送到 GitHub" >> $LOG_FILE
else
    echo "$(date): 没有新数据需要更新" >> $LOG_FILE
fi
