import * as React from "react";

export type GalleryItem = {
  tradePath?: string;
  coverPath: string;
  url?: string;
};

interface Props {
  items: GalleryItem[];
  available: boolean;
  onOpenFile: (path: string) => void;
}

export const Gallery: React.FC<Props> = ({ items, available, onOpenFile }) => {
  const onCoverMouseEnter = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.borderColor = "var(--interactive-accent)";
      e.currentTarget.style.background = "rgba(var(--mono-rgb-100), 0.06)";
    },
    []
  );

  const onCoverMouseLeave = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.borderColor = "var(--background-modifier-border)";
      e.currentTarget.style.background = "rgba(var(--mono-rgb-100), 0.03)";
    },
    []
  );

  const onCoverFocus = React.useCallback(
    (e: React.FocusEvent<HTMLButtonElement>) => {
      e.currentTarget.style.boxShadow = "0 0 0 2px var(--interactive-accent)";
    },
    []
  );

  const onCoverBlur = React.useCallback(
    (e: React.FocusEvent<HTMLButtonElement>) => {
      e.currentTarget.style.boxShadow = "none";
    },
    []
  );

  return (
    <div
      style={{
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "10px",
        padding: "12px",
        marginBottom: "16px",
        background: "var(--background-primary)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: "8px" }}>
        最新复盘（画廊）
      </div>
      {!available ? (
        <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
          画廊不可用。
        </div>
      ) : items.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: "8px",
          }}
        >
          {items.map((it) => (
            <button
              key={`gal-${it.coverPath}`}
              type="button"
              onClick={() => onOpenFile(it.coverPath)}
              title={it.coverPath}
              onMouseEnter={onCoverMouseEnter}
              onMouseLeave={onCoverMouseLeave}
              onFocus={onCoverFocus}
              onBlur={onCoverBlur}
              style={{
                padding: 0,
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                overflow: "hidden",
                background: `rgba(var(--mono-rgb-100), 0.03)`,
                cursor: "pointer",
                outline: "none",
                transition:
                  "background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
              }}
            >
              {it.url ? (
                <img
                  src={it.url}
                  alt=""
                  style={{
                    width: "100%",
                    height: "120px",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    height: "120px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-faint)",
                    fontSize: "0.85em",
                  }}
                >
                  —
                </div>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
          未找到封面图片。
        </div>
      )}
    </div>
  );
};
