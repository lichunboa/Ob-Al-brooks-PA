import * as React from "react";

export const GlobalStyles: React.FC = () => (
  <style>{`
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--background-secondary);
}

.pa-kpi-label {
  color: var(--text-muted);
  font-size: 0.85em;
}

.pa-kpi-value {
  margin-top: 6px;
  font-weight: 850;
  font-size: 1.6em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.pa-kpi-value.lg {
  font-size: 1.85em;
}

.pa-kpi-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pa-dashboard-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  margin-bottom: 4px;
}

.pa-dashboard-title-meta {
  font-size: 0.8em;
  color: var(--text-muted);
  font-weight: 400;
}

.pa-dashboard-title-actions {
  flex-basis: 100%;
  width: 100%;
  margin-left: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  order: 20;
  margin-top: 6px;
}

.pa-dashboard-title-actions button {
  margin-left: 0 !important;
}

.pa-tabbar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin: 0 0 16px;
}

/* Grid Layouts */
.pa-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.pa-grid-3 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

/* Card Component */
.pa-card {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 14px;
  box-shadow: none;
  transition: background-color 180ms ease, border-color 180ms ease;
  display: flex;
  flex-direction: column;
}

.pa-card:hover {
  background: var(--background-modifier-hover);
  border-color: var(--background-modifier-border-hover);
}

.pa-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.pa-card-title {
  font-weight: 600;
  font-size: 1em;
  color: var(--text-normal);
  margin: 0;
}

.pa-card-subtitle {
  font-size: 0.85em;
  color: var(--text-muted);
}

/* Strategy List & Items */
.pa-strategy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
}

.pa-strategy-item {
  padding: 10px 12px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  line-height: 1.2;
}

.pa-strategy-item:hover {
  transform: none;
}

.pa-strategy-title {
  font-size: 0.95em;
  font-weight: 700;
}

/* Tags */
.pa-tag {
  display: inline-block;
  font-size: 0.75em;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--background-modifier-form-field);
  color: var(--text-muted);
  margin-right: 4px;
  margin-bottom: 4px;
}

/* Analytics Tables */
.pa-analytics-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 0.9em;
  border-bottom: 1px solid var(--background-modifier-border);
}

.pa-analytics-row:last-child {
  border-bottom: none;
}

.pa-stat-value {
  font-family: var(--font-monospace);
  font-weight: bold;
}
.pa-stat-value.pos { color: var(--pa-v5-win); }
.pa-stat-value.neg { color: var(--pa-v5-loss); }

/* Utility */
.pa-text-muted { color: var(--text-muted); }
.pa-text-faint { color: var(--text-faint); }
.pa-font-bold { font-weight: 600; }
  `}</style>
);
