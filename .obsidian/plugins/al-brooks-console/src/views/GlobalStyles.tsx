import * as React from "react";

export const GlobalStyles: React.FC = () => (
    <style>{`
/* Dashboard Container */
.pa-dashboard {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
  font-family: var(--font-interface);
  color: var(--text-normal);
}

/* Grid Layouts */
.pa-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.pa-grid-3 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

/* Card Component */
.pa-card {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  display: flex;
  flex-direction: column;
}

.pa-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: var(--interactive-accent);
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
  font-size: 1.1em;
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
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
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
.pa-stat-value.pos { color: var(--text-success); }
.pa-stat-value.neg { color: var(--text-error); }

/* Utility */
.pa-text-muted { color: var(--text-muted); }
.pa-text-faint { color: var(--text-faint); }
.pa-font-bold { font-weight: 600; }
  `}</style>
);
