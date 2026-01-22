import * as React from "react";
import type {
  ContextAnalysisRow,
  ErrorAnalysisRow,
} from "../../core/analytics";

interface ContextWidgetProps {
  data: ContextAnalysisRow[];
}

export const ContextWidget: React.FC<ContextWidgetProps> = ({ data }) => {
  const cycleToCn = React.useCallback((raw: string) => {
    const s = raw.trim();
    if (!s) return s;
    const map: Record<string, string> = {
      "Strong Trend": "强趋势",
      "Weak Trend": "弱趋势",
      "Trading Range": "交易区间",
      "Breakout Mode": "突破模式",
      Breakout: "突破",
      Channel: "通道",
      "Broad Channel": "宽通道",
      "Tight Channel": "窄通道",
    };
    return map[s] ?? s;
  }, []);

  return (
    <div className="pa-card">
      <h4 className="pa-card-subtitle" style={{ margin: "0 0 10px 0" }}>
        环境周期分析 (Top 8)
      </h4>
      <div style={{ display: "grid", gap: "0" }}>
        {data.map((row) => (
          <div key={row.context} className="pa-analytics-row">
            <span style={{ fontWeight: 600 }}>{cycleToCn(row.context)}</span>
            <span className="pa-text-faint">
              {row.count}笔, WR: {row.winRate.toFixed(0)}%,
              <span
                className={`pa-stat-value ${row.netR > 0 ? "pos" : "neg"}`}
                style={{ marginLeft: "6px" }}
              >
                {row.netR > 0 ? "+" : ""}
                {row.netR.toFixed(1)}R
              </span>
            </span>
          </div>
        ))}
        {data.length === 0 && (
          <div className="pa-text-muted" style={{ fontSize: "0.8em" }}>
            暂无数据
          </div>
        )}
      </div>
    </div>
  );
};

interface ErrorWidgetProps {
  data: ErrorAnalysisRow[];
}

export const ErrorWidget: React.FC<ErrorWidgetProps> = ({ data }) => {
  return (
    <div className="pa-card">
      <h4 className="pa-card-subtitle" style={{ margin: "0 0 10px 0" }}>
        错误分布 (Top 5)
      </h4>
      <div style={{ display: "grid", gap: "0" }}>
        {data.map((row) => (
          <div key={row.errorTag} className="pa-analytics-row">
            <span style={{ color: "var(--text-error)" }}>{row.errorTag}</span>
            <span className="pa-text-faint">
              {row.count}笔,
              <span className="pa-stat-value neg" style={{ marginLeft: "6px" }}>
                {row.netR.toFixed(1)}R
              </span>
            </span>
          </div>
        ))}
        {data.length === 0 && (
          <div className="pa-text-muted" style={{ fontSize: "0.8em" }}>
            暂无错误记录
          </div>
        )}
      </div>
    </div>
  );
};
