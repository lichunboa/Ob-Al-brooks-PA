# AB Patrol-Agent 隔离 / Provider / 上游参考

## 1. 当前边界

`AB Patrol-Agent` 现在已经有自己的运行目录：

- 代码：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/`
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/`
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/indicators/`
- 知识：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/`
- 数据：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/pa_trader/`
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/charts/`
- 控制入口：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/scripts/start.sh`
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/pa_crypto_control.py`

这意味着：

- patrol 自己的脚本、图表、AB 指标、状态和日志不再写回 `AB Console-Backend/`
- `AB Console-Backend` 现在更适合作为：
  - 外部基础设施来源
  - 参考项目
  - 上游功能借鉴对象

当前仍保留的外部依赖只有两类：

1. `execution-service`
   - 通过 HTTP 提供 K 线、持仓、下单、改止损
2. `OpenClaw`
   - 负责 TG 话题
   - 负责 operator agent
   - 可选地继续承担 decision provider

## 1.1 已经落地的上游借鉴

已经按最小可用方式落地了 4 个点：

1. Query Service
   - 新增 `AB Patrol-Agent/services/consumption/query-service/src/__main__.py`
   - `PA交易 Crypto` 优先通过 Query Service 读状态
2. 保守启动链
   - `AB Patrol-Agent/scripts/start.sh start` 只拉起 `query-service + patrol`
3. 独立配置根
   - 新增 `AB Patrol-Agent/config/.env.example`
4. host / provider 解耦
   - `OpenClaw` 负责 TG / operator
   - decision provider 走 `runtime/providers.py`

## 2. Provider 是什么

`provider` = 真正给 `ab-patrol-loop` 返回决策 JSON 的模型后端。

现在这条链已经拆成两层：

- `OpenClaw`
  - TG / operator host
  - agent 身份
  - 话题入口
- `Decision Provider`
  - 真正做单轮推理
  - 返回 patrol decision JSON

### 现在支持的 provider

- `openclaw`
  - 仍走 `openclaw gateway call agent`
- `openai_compat`
  - 直连兼容 OpenAI Chat Completions 的接口
  - 可以是官方 API、中转兼容层、或本地兼容服务

实现位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/providers.py`

### 为什么要这么拆

原因很直接：

- OpenClaw 适合做 TG / host，不一定适合做分钟级交易巡逻的唯一推理后端
- 一旦 OAuth 模型慢、超时或挂住，不应该拖死 patrol loop
- 后面换模型时，不应该再碰 TG 话题和 operator agent

### 当前配置方式

默认规则：

- 请求路径默认是 `openai_compat`
- 如果没有配置直连 provider，且 `AB_PATROL_DECISION_STRICT=0`，会自动回退到 `openclaw`
- 如果显式设置 `AB_PATROL_DECISION_STRICT=1`，缺直连配置时直接报错，不再静默回退

相关环境变量：

```bash
AB_PATROL_DECISION_PROVIDER=openai_compat
AB_PATROL_DECISION_FALLBACK=openclaw
AB_PATROL_DECISION_STRICT=0
AB_PATROL_LLM_API_BASE=http://127.0.0.1:11434/v1
AB_PATROL_LLM_API_KEY=
AB_PATROL_LLM_MODEL=qwen2.5:14b
AB_PATROL_LLM_TIMEOUT=180
```

### 现阶段建议

- `PA交易 Crypto` 继续挂在 OpenClaw 话题里
- 真正的 decision 建议优先改成独立 provider
- 如果 `openai-codex/gpt-5.4` 的 OpenClaw OAuth 继续慢，就不要再让它做唯一决策通道

## 3. 上游 tradecat 可借鉴点

上游仓库：

- [tukuaiai/tradecat](https://github.com/tukuaiai/tradecat)

本次检查到的几个重要变化：

### 3.1 服务分层更清晰

上游现在把服务拆成：

- `services/ingestion/`
- `services/compute/`
- `services/consumption/`

这比我们当前把很多东西混在 `services/` 和 `services-preview/` 里更清楚。

对 `AB Patrol-Agent` 的直接启发：

- patrol 自己应该只做“策略与状态机”
- 数据采集、执行、对外呈现分别当成外部层

### 3.2 Query Service 思路值得借

上游 README 明确写了：

- consumption 层不再直连数据库
- 统一通过 `api-service` / Query Service 读数据

这个思路很适合你现在的 Patrol-Agent：

- TG 状态卡、未来 Web 面板、外部观察工具
- 都不应该再直接碰状态文件或底层库
- 更好的方式是：
  - patrol 写状态
  - query 层负责读状态并给 UI / TG / Web

### 3.3 资产根目录统一

上游现在把共享资产放到：

- `assets/config`
- `assets/database`
- `assets/docs`

这个方向也适合我们。

对 `AB Patrol-Agent` 来说，后面可以继续做两步：

1. 把独立配置模板放到 `AB Patrol-Agent/config/`
2. 把回测 / 图表 / 状态说明统一归到 `AB Patrol-Agent/docs/` 和 `AB Patrol-Agent/data/`

### 3.4 默认启动链路更保守

上游顶层 `scripts/start.sh` 默认只起核心链，不把采集层全部混进去。

这个思路对我们也有价值：

- `PA交易 Crypto` 的“启动交易”最好只保证 patrol + 必需执行链
- 其他参考项目服务不要再全部混进同一条启动命令

### 3.5 暂时不建议直接照搬的部分

这些东西先作为参考，不建议现在直接搬进 Al Brooks 主线：

- Wyckoff / quant / signal-service 全套规则体系
- `assets/database` / 双库 LF/HF 复杂结构
- markets / predict / fate 等外围服务

原因：

- 这些能提升基础设施，但会明显污染当前 Al Brooks 主线
- 你当前最优先目标还是让 `patrol-l1` 先稳定地产生真实订单和持仓管理数据

## 4. 对 AB Patrol-Agent 最有价值的借鉴顺序

建议顺序：

1. 保持 `skill + S 文件 + AB 指标 + patrol loop` 主线不动
2. 优先把 decision provider 做稳定
3. 再考虑把 query/status 层从文件读取升级成统一 query 接口
4. 最后才考虑借上游更复杂的分层和数据资产结构

换句话说：

- **先稳交易主脑**
- **再优化基础设施**
- **最后再吸收上游工程化升级**
