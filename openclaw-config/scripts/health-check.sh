#!/bin/bash
# OpenClaw 健康检查 + Session 清理脚本
# 不修改 OpenClaw 本身，只做外部监控和维护

LOCK_FILE="/Users/mitchellcb/.openclaw/agents/trader/sessions/sessions.json.lock"
LOG_FILE="/Users/mitchellcb/.openclaw/logs/health-check.log"
SESSIONS_DIR="/Users/mitchellcb/.openclaw/agents/trader/sessions"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

# ========== 1. 健康检查 ==========
if ! curl -s --max-time 5 http://localhost:18789/ > /dev/null 2>&1; then
    log "OpenClaw 无响应，尝试重启..."

    # 清理可能的锁文件
    if [ -f "$LOCK_FILE" ]; then
        rm -f "$LOCK_FILE"
        log "已清理锁文件"
    fi

    # 重启服务
    launchctl stop ai.openclaw.gateway 2>/dev/null
    sleep 2
    launchctl start ai.openclaw.gateway
    log "OpenClaw 已重启"
else
    # 检查锁文件是否存在超过 5 分钟（可能是死锁）
    if [ -f "$LOCK_FILE" ]; then
        LOCK_AGE=$(($(date +%s) - $(stat -f %m "$LOCK_FILE")))
        if [ $LOCK_AGE -gt 300 ]; then
            log "锁文件存在超过 5 分钟，清理中..."
            rm -f "$LOCK_FILE"
            log "已清理过期锁文件"
        fi
    fi
fi

# ========== 2. Session 清理（每次运行都检查） ==========
if [ -d "$SESSIONS_DIR" ]; then
    # 清理超过 1 小时的 .jsonl 文件（trader agent 信号频繁，不需要保留太久）
    OLD_COUNT=$(find "$SESSIONS_DIR" -name "*.jsonl" -mmin +60 2>/dev/null | wc -l | tr -d ' ')
    if [ "$OLD_COUNT" -gt 0 ]; then
        find "$SESSIONS_DIR" -name "*.jsonl" -mmin +60 -delete 2>/dev/null
        log "已清理 $OLD_COUNT 个超过1小时的 session 文件"
    fi

    # 清理 .tmp 文件（超过 10 分钟）
    TMP_COUNT=$(find "$SESSIONS_DIR" -name "*.tmp" -mmin +10 2>/dev/null | wc -l | tr -d ' ')
    if [ "$TMP_COUNT" -gt 0 ]; then
        find "$SESSIONS_DIR" -name "*.tmp" -mmin +10 -delete 2>/dev/null
        log "已清理 $TMP_COUNT 个临时文件"
    fi

    # 清理 .deleted 文件
    DEL_COUNT=$(find "$SESSIONS_DIR" -name "*.deleted.*" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$DEL_COUNT" -gt 0 ]; then
        find "$SESSIONS_DIR" -name "*.deleted.*" -delete 2>/dev/null
        log "已清理 $DEL_COUNT 个已删除文件"
    fi

    # 清理备份文件
    BAK_COUNT=$(find "$SESSIONS_DIR" -name "sessions.json.backup.*" -o -name "sessions.json.bak.*" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$BAK_COUNT" -gt 0 ]; then
        find "$SESSIONS_DIR" -name "sessions.json.backup.*" -delete 2>/dev/null
        find "$SESSIONS_DIR" -name "sessions.json.bak.*" -delete 2>/dev/null
        log "已清理 $BAK_COUNT 个备份文件"
    fi

    # 检查 sessions.json 大小，超过 20MB 则重建（空索引）
    if [ -f "$SESSIONS_DIR/sessions.json" ]; then
        SIZE=$(stat -f %z "$SESSIONS_DIR/sessions.json" 2>/dev/null || echo 0)
        SIZE_MB=$((SIZE / 1024 / 1024))
        if [ $SIZE_MB -gt 20 ]; then
            log "sessions.json 已达 ${SIZE_MB}MB，重建索引..."
            echo '{"sessions":{}}' > "$SESSIONS_DIR/sessions.json"
            log "sessions.json 已重建"
        fi
    fi
fi
