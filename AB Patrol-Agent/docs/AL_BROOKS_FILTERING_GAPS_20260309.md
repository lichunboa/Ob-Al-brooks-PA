# Al Brooks 视角下的漏单分类

更新日期: 2026-03-09

## 目的

这份文档把 Patrol 最近 48 小时里“有结构但没成交”的情况，重新映射到 Al Brooks 的原始知识框架，避免后续继续按单笔截图修规则。

## 理论来源

本次分类参考的本地知识源:

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/AL brooks原课程大纲.md`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/《价格行为PPT中文笔记》/2.《价格行为学》（进阶篇37-52章）.pdf`

相关主题主要来自:

- `14B 趋势`: 强突破、80% 规则、大多数反转失败
- `21C 反转`: 40% 的赢家、TBTL、反转通常先以双顶/双底出现
- `22A 主趋势反转`: MTR 是关键反转结构
- `18A-18F / 47A-47D`: 交易区间、TR 是限价单市场、要优先在边缘处理
- `Video 49F`: swing 示例、部分止盈

## 当前五类高频“合理机会被挡掉”

### 1. 强突破环境下的逆势反转

含义:

- 结构里已经出现双底、双顶、楔形或 MTR
- 但更大背景仍是 `BO / AIS / AIB`
- 这类反转在 Al Brooks 语境下，很多时候只够做反向 scalp，不够直接当 swing 反转

系统提示:

- 这类机会不应被简单记成“反转没接受”
- 应进一步区分:
  - `只适合 scalp`
  - `还不足以 swing`

### 2. 交易区间中部没有优势

含义:

- 市场已经回到 `TR`
- 但位置不在 `tr_edge:top/bottom`
- Al Brooks 强调 TR 更像限价单市场，应该在边缘处理，而不是在中部随便接

系统提示:

- 这类轮次不是“没信号”
- 而是“位置不对，不该在中部入场”

### 3. 40% 反转, 仅够 scalp

含义:

- 双底、双顶、楔形、MTR 已经出现
- 但反转还处在 “first reversal often small” 的阶段
- 结合 `21C` 的 40% 概念，这类 setup 常常只支持小目标或试探，不支持直接当大波段反转

系统提示:

- `pre_signal` 若进入这类结构，应优先生成:
  - `countertrend scalp watch`
  - 而不是立刻变成 `swing executable`

### 4. TBTL / 两波反转还没完成

含义:

- Al Brooks 经常用 `TBTL` / `two legs` 看待 reversal completion
- 有些 setup 已经出现第一次测试，但还没完成足够的第二波或接受

系统提示:

- 这类轮次不应被笼统归成“反转未接受”
- 应明确标成:
  - `TBTL 未完成`
  - `第二腿/二次入场未到`

### 5. 限价单环境未到边缘

含义:

- 在 TR / 弱通道里，市场更接近 `LOM`
- 但限价单模式并不代表任何位置都能做
- 关键仍是边缘、失败测试、二次失败、弱势回抽

系统提示:

- 若系统识别到 `TR + LOM/BLSH`，但没有边缘证据
- 应输出:
  - `限价单环境存在，但位置未到边缘`

## 这份分类对 Patrol 的意义

后续 `pre_signal -> candidate -> executable` 调整，应该优先用这些标签来解释无单，而不是继续只靠:

- `P×R 不通过`
- `gate 格式问题`
- `浅 PB 失效`

后者只是工程表面，前者才是 Al Brooks 语义层。

## 下一步

1. 已经把这些类别接入状态机，用于限制 `pre_signal -> candidate -> executable`：
   - `交易区间中部无优势`
   - `强突破环境下逆势不做`
   - `40%反转仅够 scalp`
   - `TBTL 反转未完成`
   - `TR 边缘限价单环境`
2. 继续把这些类别回写到 `canonical` 和 `S4/S5/S6`
3. 回放旧 Claude 成交样本，确认这些类别不会把原本应成交的单再次压成 `LOG_ONLY`
