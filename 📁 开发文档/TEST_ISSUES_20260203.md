# 测试问题收集 - 2026-02-03

## 📋 测试概况

| 项目 | 详情 |
|------|------|
| 测试日期 | 2026-02-03 20:30 - 22:40 |
| 测试范围 | 信号推送 → AI分析 → 模拟交易创建 → 自动追踪 |
| 信号阈值 | 60 → 80（已调整） |
| 模型配置 | Kimi K2.5 优先，Claude 备选 |

---

## 🔴 严重问题

### 1. Session Lock 超时（频繁发生）

**现象**：
```
Error: timeout acquiring session store lock: 
/Users/mitchellcb/.openclaw/agents/main/sessions/sessions.json.lock
```

**影响**：
- 信号被丢弃（至少 4 个信号丢失）
- Hook 处理失败

**临时解决**：
```bash
rm -f ~/.openclaw/agents/main/sessions/*.lock
```

**根本原因分析**：
- Gateway CPU 占用高（61%）
- 信号太密集，并发处理压力大
- 多个 cron job 同时运行

**建议修复**：
- [ ] 优化 session lock 机制（增加超时时间或改用无锁方案）
- [ ] 限制并发 hook 处理数量
- [ ] 考虑使用队列处理信号

---

### 2. HTTP 401 认证错误（Isolated Session）

**现象**：
```
FailoverError: HTTP 401: Invalid Authentication
No API key found for provider "anthropic"
```

**影响**：
- Cron job（交易追踪）无法正常执行
- 过期交易没有被自动标记为 timeout

**根本原因**：
- `auth-profiles.json` 只配置了 `kimi-coding`
- Isolated session 使用 `auth-profiles.json` 获取 API key
- 系统内部功能尝试使用 `anthropic` provider（未配置）

**已修复**：
```json
// ~/.openclaw/agents/main/agent/auth-profiles.json
{
  "profiles": {
    "kimi-coding:default": { ... },
    "moonshot:default": { ... },
    "kimi-code:default": { ... },
    "claude-proxy:default": { ... }
  }
}
```

---

### 3. Cron Job 创建时 Gateway Timeout

**现象**：
- 模拟交易笔记创建成功
- 但自动追踪 cron job 创建失败（Gateway timeout）

**影响**：
- 交易无法自动追踪
- 需要手动检查交易状态

**建议修复**：
- [ ] 增加 cron job 创建的超时时间
- [ ] 添加重试机制
- [ ] 考虑异步创建 cron job

---

## 🟡 中等问题

### 4. 部分交易笔记 entry_price = 0

**现象**：
- 9 个交易笔记的 `入场/entry_price: 0`
- 数据不完整，无法用于复盘

**影响**：
- 交易记录不完整
- 无法计算盈亏

**已处理**：
- 删除了 9 个无效笔记（移到废纸篓）

**根本原因**：
- 后端信号数据采集问题
- 可能是 API 请求失败或数据解析错误

**建议修复**：
- [ ] 检查后端 data-service 的价格采集逻辑
- [ ] 添加数据完整性校验
- [ ] 如果 entry_price = 0，不创建交易笔记

---

### 5. 信号过于密集

**现象**：
- 短时间内收到大量信号（5分钟内 10+ 个）
- 系统处理压力大

**已调整**：
- 阈值从 60 提高到 80
- 预期减少约 30-40% 的信号量

**建议优化**：
- [ ] 添加信号去重逻辑（同一品种短时间内不重复推送）
- [ ] 考虑信号合并（多个相似信号合并为一个）

---

## 🟢 已解决问题

| 问题 | 解决方案 | 状态 |
|------|----------|------|
| auth-profiles.json 不完整 | 添加所有 provider 认证 | ✅ |
| 无效交易笔记 | 删除 entry_price=0 的笔记 | ✅ |
| 过期 cron job 未清理 | 手动删除 | ✅ |
| 信号阈值过低 | 60 → 80 | ✅ |

---

## 📊 测试统计

| 指标 | 数量 |
|------|------|
| 总信号数 | ~30+ |
| 成功处理 | ~20 |
| 丢失（lock timeout） | 4+ |
| 创建模拟交易 | 12 |
| 有效交易笔记 | 9 |
| 无效交易笔记（已删除） | 9 |

---

## 🎯 下一步优化方向

1. **Session Lock 机制优化** - 最高优先级
2. **信号去重和合并** - 减少系统压力
3. **数据完整性校验** - 避免无效笔记
4. **Cron Job 创建重试机制** - 提高可靠性
5. **Gateway 性能优化** - 降低 CPU 占用

---

*文档创建时间: 2026-02-03 22:40*
*创建者: 涟依 (Claude Opus 4.5)*
