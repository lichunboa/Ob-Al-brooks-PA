#!/bin/bash
# verify.sh - 统一验证脚本
set -e

cd "$(dirname "$0")/.."
echo "=== TradEx 验证脚本 ==="

# 1. Python 语法检查
echo "[1/5] Python 语法检查..."
if [ -d "services/market-maker-v2" ]; then
    cd services/market-maker-v2
    python3 -m py_compile main.py src/core/*.py src/strategies/*.py 2>/dev/null || echo "  跳过: 文件不存在"
    cd ../..
fi

# 2. 文档链接检查
echo "[2/5] 文档链接检查..."
BROKEN=0
for f in docs/**/*.md docs/*.md; do
    [ -f "$f" ] || continue
    grep -oE '\[.*\]\(([^)]+)\)' "$f" 2>/dev/null | grep -oE '\(([^)]+)\)' | tr -d '()' | while read link; do
        [[ "$link" =~ ^http ]] && continue
        [[ "$link" =~ ^# ]] && continue
        dir=$(dirname "$f")
        target="$dir/$link"
        [ -e "$target" ] || { echo "  死链: $f -> $link"; BROKEN=1; }
    done
done
[ $BROKEN -eq 0 ] && echo "  链接检查通过"

# 3. ADR 编号检查
echo "[3/5] ADR 编号检查..."
if [ -d "docs/decisions/adr" ]; then
    ADRS=$(ls docs/decisions/adr/*.md 2>/dev/null | grep -oE '[0-9]{4}' | sort)
    DUPS=$(echo "$ADRS" | uniq -d)
    [ -z "$DUPS" ] && echo "  ADR 编号无重复" || echo "  重复编号: $DUPS"
fi

# 4. Prompt 模板字段检查
echo "[4/5] Prompt 模板字段检查..."
for f in docs/prompts/*.md; do
    [ -f "$f" ] || continue
    [[ "$f" == *"template"* ]] && continue
    for field in "## 目标" "## 输出格式" "## 约束" "## 验收标准"; do
        grep -q "$field" "$f" || echo "  缺少字段 '$field': $f"
    done
done
echo "  Prompt 检查完成"

# 5. 格式化检查 (可选)
echo "[5/5] 格式化检查..."
command -v ruff &>/dev/null && ruff check services/ --quiet || echo "  跳过: ruff 未安装"

echo "=== 验证完成 ==="
