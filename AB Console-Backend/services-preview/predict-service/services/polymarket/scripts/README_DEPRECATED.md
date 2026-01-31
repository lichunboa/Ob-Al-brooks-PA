# 已废弃的统计脚本

## 说明

以下脚本已被 `csv-report.js` 替代，功能重复且维护成本高。

## 已备份的脚本

| 文件 | 原用途 | 废弃原因 | 备份文件 |
|------|--------|---------|---------|
| `detailed-report.js` | 生成详细 TXT 报告 | 功能被 csv-report.js 覆盖 | `detailed-report.js.bak` |
| `signal-stats.js` | 按小时统计信号 | 统计维度不如 csv-report.js | `signal-stats.js.bak` |
| `dashboard-simple.js` | 实时监控（简化版） | 仅用于调试，非生产功能 | `dashboard-simple.js.bak` |
| `dashboard-full.js` | 实时监控（完整版） | 仅用于调试，非生产功能 | `dashboard-full.js.bak` |

## 保留的脚本

| 文件 | 用途 | 触发方式 |
|------|------|---------|
| **csv-report.js** | 生成完整 CSV 报告（滚动 24h） | Telegram `/csv` 命令 |

## 恢复方法

如需恢复某个脚本：

```bash
cd scripts
mv <filename>.bak <filename>
```

## 清理建议

如确认不再需要，可删除备份文件：

```bash
cd scripts
rm -f *.bak
```

---

**废弃日期**: 2026-01-27  
**决策依据**: [CSV_STATISTICS_LOGIC_SUMMARY.md](../docs/CSV_STATISTICS_LOGIC_SUMMARY.md)
