# AB Patrol-Web

`AB Patrol-Web` 是独立于 `AB Console-Backend/web` 的 Patrol 展示层。

当前 Patrol 主 Web 入口已经迁到这里，不再以 `AB Console-Backend/web` 作为主看板。

## 当前定位

- 展示 `AB Patrol-Agent` 的运行态、最近巡逻和最新决策
- 通过 Query Service 聚合数据
- 给 `PA交易 Crypto` 提供可读的桌面看板

它不负责：

- 交易决策
- 执行下单
- 替代 `execution-service`

## 数据来源

- Query Service:
  - `http://127.0.0.1:8086/api/v1/runtime/full`
- Patrol Web API:
  - `http://127.0.0.1:3001/api/runtime/full`

## 当前入口

- 首页：
  - [http://localhost:3001](http://localhost:3001)
- Patrol 看板：
  - [http://localhost:3001/pa-bot](http://localhost:3001/pa-bot)

## 启动

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Web"
bash scripts/start.sh
```

或使用一键入口：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/📁 启动工具/🌐 AB Patrol Web.command](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/%F0%9F%93%81%20%E5%90%AF%E5%8A%A8%E5%B7%A5%E5%85%B7/%F0%9F%8C%90%20AB%20Patrol%20Web.command)

## 当前已知限制

- Web 能展示当前状态，但不代表系统已经完全恢复到原 Claude parity
- 当前主缺口仍然在：
  - `codex_cli` timeout 噪音
  - 首笔自然新单还未稳定出现
  - `S7-management` 还缺 live 验证

## 相关文档

- 总览：
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/CURRENT_SYSTEM_OVERVIEW_20260308.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/CURRENT_SYSTEM_OVERVIEW_20260308.md)
- Patrol 文档入口：
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/README.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/README.md)
