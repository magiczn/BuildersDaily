#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_X_LIST_MONITOR_DIR="$PROJECT_DIR"

# 每日更新脚本
export HOME="${HOME:-/Users/zhaonan}"
X_LIST_MONITOR_DIR="${X_LIST_MONITOR_DIR:-$DEFAULT_X_LIST_MONITOR_DIR}"
LOG_FILE="/tmp/nan-builders-$(date +%Y-%m-%d).log"
LOCK_DIR="/tmp/nan-builders-daily-update.lock"
PID_FILE="$LOCK_DIR/pid"
DAILY_FETCH_TIMEOUT_SECONDS="${DAILY_FETCH_TIMEOUT_SECONDS:-2400}"
DATA_JSON_TIMEOUT_SECONDS="${DATA_JSON_TIMEOUT_SECONDS:-1800}"
TIMEOUT_KILL_GRACE_SECONDS="${TIMEOUT_KILL_GRACE_SECONDS:-5}"
PUSH_RETRY_COUNT="${PUSH_RETRY_COUNT:-3}"
PUSH_RETRY_SLEEP_SECONDS="${PUSH_RETRY_SLEEP_SECONDS:-20}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
CURRENT_CHILD_PID=""

log_message() {
    echo "$1" >> "$LOG_FILE"
}

kill_process_tree() {
    local pid="$1"
    local signal="${2:-TERM}"
    local child

    if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
        return 0
    fi

    for child in $(pgrep -P "$pid" 2>/dev/null || true); do
        kill_process_tree "$child" "$signal"
    done

    kill "-$signal" "$pid" 2>/dev/null || kill -s "$signal" "$pid" 2>/dev/null || true
}

cleanup() {
    local exit_code="$1"

    trap - EXIT INT TERM HUP

    if [ -n "${CURRENT_CHILD_PID:-}" ] && kill -0 "$CURRENT_CHILD_PID" 2>/dev/null; then
        log_message "$(date): 清理遗留子进程 PID=$CURRENT_CHILD_PID"
        kill_process_tree "$CURRENT_CHILD_PID" TERM
        sleep "$TIMEOUT_KILL_GRACE_SECONDS"
        kill_process_tree "$CURRENT_CHILD_PID" KILL
    fi

    rm -rf "$LOCK_DIR" 2>/dev/null || true
    exit "$exit_code"
}

trap 'cleanup $?' EXIT
trap 'cleanup 130' INT TERM HUP

acquire_lock() {
    local existing_pid=""

    if mkdir "$LOCK_DIR" 2>/dev/null; then
        echo "$$" > "$PID_FILE"
        return 0
    fi

    if [ -f "$PID_FILE" ]; then
        existing_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    fi

    if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
        log_message "$(date): 检测到已有 daily-update 进程在运行 (PID=$existing_pid)，跳过本次触发。"
        return 1
    fi

    rm -rf "$LOCK_DIR" 2>/dev/null || true
    mkdir "$LOCK_DIR"
    echo "$$" > "$PID_FILE"
}

run_with_timeout() {
    local label="$1"
    local timeout_seconds="$2"
    shift 2

    local child_pid=""
    local watchdog_pid=""
    local timeout_flag=""
    local exit_code=0

    timeout_flag="$(mktemp /tmp/nan-builders-timeout.XXXXXX)"
    rm -f "$timeout_flag"

    "$@" >> "$LOG_FILE" 2>&1 &
    child_pid=$!
    CURRENT_CHILD_PID="$child_pid"

    (
        sleep "$timeout_seconds"
        if kill -0 "$child_pid" 2>/dev/null; then
            touch "$timeout_flag"
            log_message "$(date): ${label} 超时 (${timeout_seconds}s)，准备终止 PID=$child_pid"
            kill_process_tree "$child_pid" TERM
            sleep "$TIMEOUT_KILL_GRACE_SECONDS"
            kill_process_tree "$child_pid" KILL
        fi
    ) &
    watchdog_pid=$!

    wait "$child_pid" || exit_code=$?
    kill "$watchdog_pid" 2>/dev/null || true
    CURRENT_CHILD_PID=""

    if [ -f "$timeout_flag" ]; then
        rm -f "$timeout_flag"
        return 124
    fi

    rm -f "$timeout_flag"
    return "$exit_code"
}

push_with_auth() {
    local creds username password token auth_header

    creds="$(printf 'protocol=https\nhost=github.com\n\n' | git credential-osxkeychain get 2>/dev/null || true)"
    username="$(printf '%s\n' "$creds" | sed -n 's/^username=//p' | head -n 1)"
    password="$(printf '%s\n' "$creds" | sed -n 's/^password=//p' | head -n 1)"

    if [ -n "$username" ] && [ -n "$password" ]; then
        auth_header="$(printf '%s:%s' "$username" "$password" | base64 | tr -d '\n')"
        git -c credential.helper= \
            -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $auth_header" \
            push origin main
        return
    fi

    token=""
    if command -v gh >/dev/null 2>&1; then
        token="$(gh auth token 2>/dev/null || true)"
    fi

    if [ -n "$token" ]; then
        local auth_header
        auth_header="$(printf 'x-access-token:%s' "$token" | base64 | tr -d '\n')"
        git -c credential.helper= \
            -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $auth_header" \
            push origin main
    else
        git push origin main
    fi
}

count_ahead_commits() {
    git rev-list --count origin/main..HEAD 2>/dev/null || echo "0"
}

count_behind_commits() {
    git rev-list --count HEAD..origin/main 2>/dev/null || echo "0"
}

push_pending_commits() {
    local ahead behind attempt

    ahead="$(count_ahead_commits)"
    behind="$(count_behind_commits)"

    if [ "$ahead" -eq 0 ]; then
        log_message "$(date): 本地没有待推送提交。"
        return 0
    fi

    if [ "$behind" -gt 0 ]; then
        log_message "$(date): 检测到本地分支落后 origin/main ${behind} 个提交，跳过自动推送，避免非快进失败。"
        return 1
    fi

    for attempt in $(seq 1 "$PUSH_RETRY_COUNT"); do
        log_message "$(date): 尝试推送待同步提交（第 ${attempt}/${PUSH_RETRY_COUNT} 次），ahead=${ahead}"
        if push_with_auth >> "$LOG_FILE" 2>&1; then
            log_message "$(date): 数据已推送到 GitHub。"
            return 0
        fi

        if [ "$attempt" -lt "$PUSH_RETRY_COUNT" ]; then
            log_message "$(date): 推送失败，将在 ${PUSH_RETRY_SLEEP_SECONDS}s 后重试。"
            sleep "$PUSH_RETRY_SLEEP_SECONDS"
        fi
    done

    log_message "$(date): 自动推送失败，待下次任务继续补推。"
    return 1
}

cd "$PROJECT_DIR"

if ! acquire_lock; then
    exit 0
fi

log_message "=== $(date) ==="

# 先更新本地采集数据池
log_message "更新本地采集数据..."
if [ -f "$X_LIST_MONITOR_DIR/package.json" ]; then
    cd "$X_LIST_MONITOR_DIR"
    if ! run_with_timeout "本地采集更新" "$DAILY_FETCH_TIMEOUT_SECONDS" npm run daily; then
        log_message "$(date): 本地采集更新失败或超时，继续使用已有数据或后备数据源。"
    fi
else
    log_message "未找到采集项目目录: $X_LIST_MONITOR_DIR"
fi

# 再生成 NDN data.json
cd "$PROJECT_DIR"
log_message "生成 NDN data.json..."
if ! run_with_timeout "生成 NDN data.json" "$DATA_JSON_TIMEOUT_SECONDS" node scripts/fetch-data.js; then
    log_message "$(date): 生成 NDN data.json 失败或超时。"
    exit 1
fi

# 基于历史报告生成归档、专题、人物页与站点地图
log_message "生成站点归档..."
if ! run_with_timeout "生成站点归档" "$DATA_JSON_TIMEOUT_SECONDS" node scripts/build-site.mjs; then
    log_message "$(date): 生成站点归档失败或超时。"
    exit 1
fi

# 检查是否有变化并提交
git add -- data.json profiles.json archive daily builders topics sitemap.xml
if ! git diff --cached --quiet; then
    git commit -m "chore: 更新每日数据 - $(date +'%Y-%m-%d')" >> "$LOG_FILE" 2>&1
    if ! push_pending_commits; then
        exit 1
    fi
else
    log_message "$(date): 没有新数据需要更新"
    if ! push_pending_commits; then
        exit 1
    fi
fi
