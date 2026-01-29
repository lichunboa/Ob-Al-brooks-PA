#!/bin/bash
# verify-build.sh - 验证 main.js 包含关键代码
# 用于防止新代码未被编译的问题

set -e

MAIN_JS="main.js"

if [ ! -f "$MAIN_JS" ]; then
    echo "❌ 错误: $MAIN_JS 不存在"
    exit 1
fi

# 关键代码标识符（新版 UI 必须包含）
KEYWORDS=(
    "ConsoleContent"
    "TradingHubTab"
    "groupedByTicker"
    "ConsoleProvider"
)

echo "🔍 验证编译产物..."

FAILED=0
for kw in "${KEYWORDS[@]}"; do
    if grep -q "$kw" "$MAIN_JS"; then
        echo "  ✅ $kw"
    else
        echo "  ❌ $kw 未找到"
        FAILED=1
    fi
done

if [ $FAILED -eq 1 ]; then
    echo ""
    echo "❌ 编译验证失败！新版代码可能未被包含。"
    echo "   请检查 Dashboard.tsx 是否使用 ConsoleProvider + ConsoleContent"
    exit 1
fi

echo ""
echo "✅ 编译验证通过！"
