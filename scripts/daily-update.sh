#!/bin/bash

set -euo pipefail

# 每日更新脚本
PROJECT_DIR="/Users/zhaonan/0-Projects/NDN-NanDailyNews"
X_LIST_MONITOR_DIR="${X_LIST_MONITOR_DIR:-/Users/zhaonan/0-Projects/x-list-monitor}"
LOG_FILE="/tmp/nan-builders-$(date +%Y-%m-%d).log"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$PROJECT_DIR"

echo "=== $(date) ===" >> "$LOG_FILE"

# 先更新本地 x-list-monitor 数据池
echo "更新 x-list-monitor 数据..." >> "$LOG_FILE"
if [ -d "$X_LIST_MONITOR_DIR" ]; then
    cd "$X_LIST_MONITOR_DIR"
    if ! npm run daily >> "$LOG_FILE" 2>&1; then
        echo "x-list-monitor 更新失败，继续使用已有数据或后备数据源。" >> "$LOG_FILE"
    fi
else
    echo "未找到 x-list-monitor 目录: $X_LIST_MONITOR_DIR" >> "$LOG_FILE"
fi

# 再生成 NDN data.json
cd "$PROJECT_DIR"
echo "生成 NDN data.json..." >> "$LOG_FILE"
node scripts/fetch-data.js >> "$LOG_FILE" 2>&1

# 检查是否有变化并提交
git add data.json
if ! git diff --cached --quiet; then
    git commit -m "chore: 更新每日数据 - $(date +'%Y-%m-%d')" >> "$LOG_FILE" 2>&1
    git push origin main >> "$LOG_FILE" 2>&1
    echo "$(date): 数据已更新并推送到 GitHub" >> "$LOG_FILE"
else
    echo "$(date): 没有新数据需要更新" >> "$LOG_FILE"
fi
