# 贡献指南

感谢您对 TradeCat 的兴趣！我们欢迎任何形式的贡献。

## 如何贡献

### 报告 Bug

如果您在使用中发现任何错误，请通过 [Issues](https://github.com/tukuaiai/tradecat/issues) 页面提交。

请尽可能详细地描述：
- 问题现象
- 复现步骤
- 期望行为
- 环境信息（操作系统、Python 版本等）

### 功能建议

如果您有任何关于新功能或改进的建议，也请通过 [Issues](https://github.com/tukuaiai/tradecat/issues) 页面告诉我们。

### 提交代码 (Pull Request)

1. Fork 本仓库
2. 创建功能分支
   ```bash
   git checkout -b feature/your-amazing-feature
   ```
3. 进行修改并提交
   ```bash
   git commit -m 'feat: add some amazing feature'
   ```
4. 推送到您的 Fork
   ```bash
   git push origin feature/your-amazing-feature
   ```
5. 创建 Pull Request

## 开发环境

```bash
# 克隆仓库
git clone https://github.com/tukuaiai/tradecat.git
cd tradecat

# 初始化开发环境
./scripts/init.sh

# 运行验证
./scripts/verify.sh
```

## Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>
```

**Type**:
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `refactor`: 重构
- `test`: 测试
- `chore`: 杂项

**示例**:
```
feat(trading): 添加 K线形态检测指标
fix(telegram): 修复排行榜数据加载错误
docs: 更新 README 快速开始指南
```

## 代码风格

- 遵循 PEP 8
- 使用 ruff 进行格式检查
- 关键函数添加类型注解和文档字符串

## 联系方式

- Telegram 交流群: [glue_coding](https://t.me/glue_coding)
- Twitter: [123olp](https://x.com/123olp)
