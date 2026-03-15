# Brooks 归零分析（2026-03-15）

> 目的：先不沿用之前“已经改了很多”的惯性结论，而是从最基础的问题重新开始  
> **如果一个系统真正符合 Al Brooks，它至少应该具备什么？**  
> **当前系统为什么还会表现成一个亏损机器？**

---

## 1. 先校验资料：`LLM可读版` 能不能作为主参考库

参考目录：

- [LLM可读版](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版)

### 1.1 结构完整性总体是合格的

抽查结果：

- `1.《价格行为学》（基础篇1-36章）`：`2818` 页 Markdown，`2818` 页图片
- `2.《价格行为学》（进阶篇37-52章）`：`1396` 页 Markdown，`1396` 页图片
- `阿布10种最佳价格行为交易模式`：`11` 页 Markdown，`11` 页图片
- 大多数百科分卷：`pages/` 与 `images/` 数量一一对应

结论：

- 这批资料的目录设计是可用的
- 后面很适合做“先检索 Markdown，再回看图片”的双层引用

### 1.2 有两个明确问题

#### 问题一：`百科幻灯片-8` 当前是空目录

路径：

- [百科幻灯片-8](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8)

现状：

- 原始 PDF 有 `855` 页
- `LLM可读版/百科幻灯片-8/pages` 和 `images` 目前都为空

结论：

- 这一卷当前不能用
- 如果后面需要覆盖完整百科，必须补转

#### 问题二：全库有大量水印/推广残留

抽样统计：

- 含 `联系微信6606696`、`人工精校字幕`、`加入VIP获得` 这类水印词的页面约 `7808` 个

结论：

- 这批资料**可以检索**
- 但如果直接做全文 RAG，不做清洗，会严重污染召回和摘要

### 1.3 抽样质量判断

#### 基础篇关键页质量好

样本：

- [基础篇第 12 页 Markdown](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/pages/page-0012.md)
- [基础篇第 337 页 Markdown](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/pages/page-0337.md)

结果：

- 页码与图片对应正确
- 主文字提取质量高
- 可以直接拿来做规则级引用

#### 进阶篇关键页质量也够用

样本：

- [进阶篇第 65 页 Markdown](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0065.md)
- [进阶篇第 290 页 Markdown](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0290.md)
- [进阶篇第 855 页 Markdown](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0855.md)

结果：

- 关键句都能检索到
- 图文能相互验证

#### 《10种模式》这类图文混排页有 OCR 噪声

样本：

- [10种模式第 4 页 Markdown](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0004.md)

结果：

- 核心关键词能出来，如 `High 2 bull flags and Low 2 bear flags`
- 但 OCR 补充里有明显乱码和杂质

#### 百科内部案例页“图片对，文字能搜，但不能盲信纯文本”

样本：

- [百科幻灯片-2 第 290 页 Markdown](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-2/pages/page-0290.md)

结果：

- 原 PDF 文本层几乎没法直接用
- `LLM可读版` 的 OCR 补充已经把核心要点提出来了
- 但这类页面仍然必须结合图片看

### 1.4 对后续使用这批资料的结论

可以用，而且值得用，但要遵守四条规则：

1. **图片是权威来源，Markdown 是检索索引**
2. **命中页面后，优先把该页 Markdown 和图片一起看**
3. **对《10种模式》和百科案例页，不要只信 OCR 文本**
4. **暂时排除 `百科幻灯片-8`，直到补转完成**

---

## 2. 归零：一个真正符合 Brooks 的系统，最低要满足什么

如果不谈实现细节，只谈 Brooks 交易逻辑，一个系统至少要满足五件事：

### 2.1 不是“看到形态名就交易”，而是先看上下文

Brooks 从来不是：

- 看到 `H2` 就买
- 看到 `双底` 就做反转
- 看到 `breakout` 就追

而是：

- 先看趋势、通道、交易区间、高潮、失败突破、受困交易者
- 再决定这个形态在当前上下文里到底是什么语义

### 2.2 first entry 和 second entry 的管理必须不同

这点是 Brooks 的核心：

- 第一次尝试经常只是试单
- 第二次才更成熟
- first entry 错了，经常该保本或快速认错
- second entry 才更值得拿利润

### 2.3 进入通道或交易区间后，管理必须切语义

不是所有趋势恢复最后都会发展成顺畅趋势。

Brooks 的真实处理是：

- 趋势里按趋势处理
- 一旦进入 channel / TR，就按 channel / TR 处理

### 2.4 好系统不只是找到 setup，更要把坏单处理成 scratch / small win / small loss

Brooks 自己反复强调：

- 管理比完美 setup 更重要

一个 Brooks 系统不要求所有单都很漂亮，但要求：

- 退化时别轻易从小错变大错
- 成熟时别把该拿到的利润吐回去

### 2.5 不能只在精选样本里好看

如果一个 setup：

- 在某一年好
- 在另一个年份立刻塌
- 在某个品种好
- 换一个品种就失真

那它更像“调参结果”，不是 Brooks 体系。

---

## 3. 从头看当前系统，为什么它还是一个亏损机器

这里不沿用“已经改了很多”的叙事，只按系统是否满足上面五条最低要求来判断。

### 3.1 第一步：信号数量不是主问题

当前回测样本已经说明：

- `5m`、`15m` 都有足够多的信号生成
- 通过率也不低
- 系统并不缺 setup

这意味着：

- 亏损不是因为“机会太少”
- 也不是因为“过滤太严导致根本进不了场”

真正的问题是：

- **进来的交易并没有形成足够厚的净优势**

### 3.2 第二步：系统已经有方向性 edge，但厚度不够

同一套 `v6` 规则下：

- 有手续费：整体 PF `0.680`
- 零手续费：整体 PF `1.076`

按家族：

- `趋势恢复族`：`0.714 -> 1.144`
- `MTR反转族`：`0.684 -> 1.073`
- `突破追随族`：`0.763 -> 1.423`

这说明：

- 逻辑不是完全错的
- 系统也不是完全瞎做

但它仍然是亏损机器，因为：

- **优势太薄**
- **坏单处理不够细**
- **成本一叠加，正优势立刻被吃掉**

### 3.3 第三步：系统最亏的不是“没抓到大行情”，而是坏单退化后没有被优雅处理

当前表现最差的几个桶非常清楚：

- `protective_stop_exit`
- `premise_failure_exit`
- 一部分 `plain_stop_loss_exit`

而表现最好的几个桶也很清楚：

- `breakeven_stop_exit`
- `tp_after_scaleout_exit`
- `runner_trailing_exit`

这说明当前系统不是不会赚钱，而是：

- **会赚钱的后段逻辑已经存在**
- **但大量交易在成熟前就退化了**
- **退化后没被足够早地送进更健康的处理分支**

### 3.4 第四步：`protective_scalp` 目前更像“状态标签”，不是一整套稳定的降级流程

这是当前最关键的实现层问题。

统计上：

- `protective_scalp_involved` 数量很大
- 但真正 `protective_scalp_exit` 的数量极少

含义是：

- 交易被标记成“保护性管理”了
- 但真正被当作保护性 scalp 处理掉的很少

代码上也能解释这一点：

- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)

当前 `_manage_protective_scalp()` 对很多没有 `detail` 的交易直接不继续做细化管理，这会导致：

1. 名义上进入 `protective_scalp`
2. 实际上没有形成明确的 Brooks 式降级节奏
3. 最后仍然更多被 `protective_stop` 或 `PREMISE` 吞掉

这就是一个典型的“实现语义和统计标签不一致”的亏损源。

### 3.5 第五步：系统还没有彻底把 `first entry` 和 `second entry` 分开

虽然现在已经比之前更接近 Brooks，但还没完全到位。

问题在于：

- `高1/低1` 还没有真正被当成“先活下来”的交易
- `高2/低2` 还没有完全被当成“更成熟的 second entry”
- 当趋势恢复退化成 channel / TR 时，切换还不够果断

结果就是：

- 本来应该 scratch 的单，还在拖
- 本来应该按通道利润处理的单，还在按趋势续抱

这会系统性拉低：

- 胜率
- PF
- 成本后的净期望

### 3.6 第六步：系统里还保留着跨样本不稳定的 execution mix

目前最典型的几个不稳定对象：

- `高1`
- `低1`
- `ii突破`
- `ioi突破`

它们的问题不是“完全无效”，而是：

- 在精选窗口里能改善
- 在扩展窗口里稳定性很差

这意味着：

- 它们还没有资格承担“提高频率”的任务
- 继续依赖它们增频，本质上是在扩大不稳定暴露

### 3.7 第七步：`premise` 和 `strength` 仍然偏通用，不够 Brooks 家族化

关键文件：

- [premise.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/premise.py)
- [strength.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/strength.py)

当前问题不是这两个模块完全没用，而是：

- 它们太像“通用持仓打分器”
- 还不够像“不同 Brooks 家族对应不同退化语义”

结果是：

- 有些单该更早认错
- 有些单该更早保本
- 有些单该把余仓留住

但现在仍然容易用一套通用逻辑去处理不同家族。

---

## 4. 为什么说它现在是“亏损机器”，而不是“只是还没优化完”

因为从系统行为上看，它已经形成了一个稳定的负向结构：

### 4.1 它会稳定地产生足够多的交易

这保证了亏损不是偶然噪声，而是机制性结果。

### 4.2 它能抓到一部分正向优势

这让系统看起来“方向是对的”。

### 4.3 但它对坏单的处理仍然不够 Brooks

这让很多本该小错结束的交易，最后变成：

- `protective_stop`
- `premise_failure`
- 成本后的小亏累积

### 4.4 它保留了太多不稳定 setup

这让系统无法在扩展样本里保持一致性。

### 4.5 成本刚好足以把薄优势全部打回负值

这就形成了一个典型的“亏损机器”：

- 不是完全不会赚钱
- 但赚钱单不够厚
- 坏单又没有被足够快地切断
- 最终长期统计仍然稳定亏损

---

## 5. 用 Brooks 的标准重新定义当前优化目标

下一步不该再问：

- “还能不能再多做一点单？”
- “还能不能再放宽一点 setup？”

而该问：

### 5.1 哪些交易，按 Brooks 本意，本来就该更早保本？

重点：

- `高1/低1`
- first reversal
- 弱 follow-through 后的趋势恢复

### 5.2 哪些交易，一旦进入 channel / TR，就不该再按趋势续抱？

重点：

- `trend recovery -> channel`
- `channel -> TR`
- weak follow-through + overlap 增加

### 5.3 哪些 setup 目前还没有跨样本稳定性，不配继续增频？

重点：

- `ii突破`
- `高1/低1`
- 一部分 breakout follow-through

### 5.4 哪些退化逻辑，需要真正落成“可执行的保护性流程”而不是标签？

重点：

- `protective_scalp`
- `premise -> reduce`
- `failed follow-through -> degrade`

---

## 6. 这轮归零分析后的工作顺序

### 6.1 第一优先级：先修退化管理，不先加频

因为当前最稳定的负向来源不是“信号太少”，而是：

- 坏单退化处理不够细

### 6.2 第二优先级：正式拆开 `first entry / second entry / channel -> TR`

这是最符合 Brooks 的下一步，不是工程化调阈值。

### 6.3 第三优先级：把不稳定 setup 从主执行 mix 里降权

尤其是：

- `高1`
- `低1`
- `ii突破`

### 6.4 第四优先级：把 `LLM可读版` 做成真正干净的知识底座

至少先做三件事：

1. 补转 [百科幻灯片-8](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8)
2. 去掉全库水印/推广残留
3. 对百科案例页保留“图片 + OCR 文本”的双层结构，不只留纯文本

---

## 7. 最终结论

如果完全归零，只用一句话概括当前系统：

**它已经学会了一部分 Brooks 的 setup 识别，但还没有学会 Brooks 最关键的那部分交易管理，因此在真实成本面前，它会稳定地把薄优势重新做回亏损。**

这也是为什么它现在看起来像一个亏损机器：

- setup 不算少
- 方向也不算全错
- 甚至零手续费下已经能看到局部正优势

但只要：

- 退化单没被更早、更细地处理
- unstable setup 还在主执行池里
- 成本继续压制薄边际

它就仍然会表现成一台**持续稳定亏钱**的机器。
