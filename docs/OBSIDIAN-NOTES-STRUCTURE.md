# Obsidian 笔记结构规范 V2.6.1

## 📁 标准文件夹结构

```
AB Console-Obsidian/Daily/Trades/
└── YYYY-MM-DD/                      # 按日期组织
    ├── PA交易/                      # PA交易机器人的交易笔记
    │   ├── 260207_1718_模拟_SOLUSDT.md
    │   ├── 260207_1729_模拟_BTCUSDT.md
    │   └── ...
    ├── Quant/                       # 量化分析师的分析笔记
    │   ├── 260207_1741_量化_SOLUSDT.md
    │   └── ...
    └── Wyckoff/                     # 威科夫大师的分析笔记
        ├── 260207_1810_威科夫_ETHUSDT.md
        └── ...
```

## 🤖 三个机器人的笔记规范

### 1️⃣ PA交易 (al-brooks)

- **文件夹**: `Daily/Trades/YYYY-MM-DD/PA交易/`
- **模板**: `Templates/单笔交易模版 (Trade Note).md`
- **命名格式**: `YYMMDD_HHmm_模拟_品种.md`
- **必填字段**:
  ```yaml
  机器人/bot: PA交易
  分析类型/analysis_type: Al Brooks 价格行为
  账户类型/account_type: 模拟盘/实盘
  tags:
    - PA/Trade
    - PA/SimTrade
  ```

### 2️⃣ 量化分析师 (trader)

- **文件夹**: `Daily/Trades/YYYY-MM-DD/Quant/`
- **模板**: `Templates/量化分析模版 (Quant Analysis).md`
- **命名格式**: `YYMMDD_HHmm_量化_品种.md`
- **必填字段**:
  ```yaml
  机器人/bot: 量化分析师
  分析类型/analysis_type: 量化分析
  tags:
    - PA/Trade
    - Quant/Analysis
  ```

### 3️⃣ 威科夫大师 (wyckoff)

- **文件夹**: `Daily/Trades/YYYY-MM-DD/Wyckoff/`
- **模板**: `Templates/威科夫分析模版 (Wyckoff Analysis).md`
- **命名格式**: `YYMMDD_HHmm_威科夫_品种.md`
- **必填字段**:
  ```yaml
  机器人/bot: 威科夫大师
  分析类型/analysis_type: 威科夫量价分析
  tags:
    - PA/Trade
    - Wyckoff/Analysis
  ```

## ✅ Bash 创建笔记示例

### PA交易创建笔记

```bash
TODAY="2026-02-07"
TIME_STR="260207_1718"
SYMBOL="SOLUSDT"

# 创建文件夹
mkdir -p "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Daily/Trades/${TODAY}/PA交易"

# 笔记路径
NOTE_PATH="/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Daily/Trades/${TODAY}/PA交易/${TIME_STR}_模拟_${SYMBOL}.md"

# 复制模板
cp "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Templates/单笔交易模版 (Trade Note).md" "$NOTE_PATH"

# 填充属性（使用 sed 或 yq）
```

### 量化分析师创建笔记

```bash
TODAY="2026-02-07"
TIME_STR="260207_1741"
SYMBOL="SOLUSDT"

# 创建文件夹
mkdir -p "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Daily/Trades/${TODAY}/Quant"

# 笔记路径
NOTE_PATH="/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Daily/Trades/${TODAY}/Quant/${TIME_STR}_量化_${SYMBOL}.md"

# 复制模板
cp "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Templates/量化分析模版 (Quant Analysis).md" "$NOTE_PATH"
```

### 威科夫大师创建笔记

```bash
TODAY="2026-02-07"
TIME_STR="260207_1810"
SYMBOL="ETHUSDT"

# 创建文件夹
mkdir -p "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Daily/Trades/${TODAY}/Wyckoff"

# 笔记路径
NOTE_PATH="/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Daily/Trades/${TODAY}/Wyckoff/${TIME_STR}_威科夫_${SYMBOL}.md"

# 复制模板
cp "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Templates/威科夫分析模版 (Wyckoff Analysis).md" "$NOTE_PATH"
```

## 🚫 禁止创建的文件夹

**不要**创建以下文件夹（v6.0 Token 优化规范）：
- ❌ `Daily/Trades/YYYY-MM-DD/Rejected/` - 70-79 分不创建笔记
- ❌ `Daily/Trades/YYYY-MM-DD/Watch/` - 已废弃
- ❌ `Daily/Trades/YYYY-MM-DD/assets/` - 图片应放在 Daily/.space/assets/
- ❌ 直接在 `Daily/Trades/YYYY-MM-DD/` 根目录创建笔记 - 必须放在机器人子文件夹

## 📌 插件识别规则

al-brooks-console 插件通过以下方式识别交易笔记：

1. **标签识别**: 包含 `PA/Trade` tag
2. **机器人字段**: `机器人/bot` 或 `bot` 属性
3. **分析类型**: `分析类型/analysis_type` 或 `analysisType` 属性

**筛选器逻辑**:
- 默认显示全部机器人的笔记
- 未设置 `机器人/bot` 字段的旧笔记默认归类为"PA交易"
- 可以通过 🤖 筛选器切换显示特定机器人的笔记

## 🔧 迁移旧笔记

如果有笔记直接创建在 `Daily/Trades/YYYY-MM-DD/` 根目录下，需要手动迁移：

```bash
# 示例：将 260207_1718_模拟_SOLUSDT.md 迁移到 PA交易/ 文件夹
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Daily/Trades/2026-02-07"

# 创建子文件夹
mkdir -p "PA交易"

# 移动文件
mv 260207_1718_模拟_*.md "PA交易/"
mv 260207_1729_模拟_*.md "PA交易/"
# ...
```

或者使用批量脚本：

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Daily/Trades/2026-02-07"

# 移动所有模拟交易笔记到 PA交易/
mkdir -p "PA交易"
for file in *_模拟_*.md; do
  if [ -f "$file" ]; then
    # 检查 frontmatter 中的机器人字段
    if grep -q "机器人/bot: PA交易" "$file" 2>/dev/null || ! grep -q "机器人/bot:" "$file" 2>/dev/null; then
      mv "$file" "PA交易/"
    fi
  fi
done

# 移动量化分析笔记到 Quant/
mkdir -p "Quant"
for file in *_量化_*.md; do
  [ -f "$file" ] && mv "$file" "Quant/"
done

# 移动威科夫笔记到 Wyckoff/
mkdir -p "Wyckoff"
for file in *_威科夫_*.md; do
  [ -f "$file" ] && mv "$file" "Wyckoff/"
done
```

## 🎯 验证规范

验证笔记结构是否符合规范：

```bash
# 检查是否有笔记直接放在日期根目录
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Daily/Trades"
for dir in */; do
  cd "$dir"
  # 查找根目录的 md 文件（排除 .space/）
  md_files=$(find . -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)
  if [ "$md_files" -gt 0 ]; then
    echo "⚠️  $dir 包含 $md_files 个根目录笔记，需要迁移"
  fi
  cd ..
done
```

## 📝 更新记录

- **V2.6.1 (2026-02-07)**: 规范化文件夹结构，修复笔记创建位置问题
- **V2.6.0 (2026-02-07)**: 三机器人架构，添加 Quant/ 和 Wyckoff/ 子文件夹
- **V2.4.0 (2026-02-06)**: 废弃 Rejected/ 和 Watch/ 文件夹
