import * as React from "react";

interface StrategyPick {
    path: string;
    canonicalName: string;
}

interface Props {
    picks: StrategyPick[];
    onOpenFile: (path: string) => void;
}

export const Strategies: React.FC<Props> = ({ picks, onOpenFile }) => {
    const textButtonStyle: React.CSSProperties = {
        padding: "2px 4px",
        border: "none",
        background: "transparent",
        color: "var(--text-accent)",
        cursor: "pointer",
        textAlign: "left",
        borderRadius: "6px",
        outline: "none",
        transition: "background-color 180ms ease, box-shadow 180ms ease",
    };

    const onTextBtnMouseEnter = React.useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            if (e.currentTarget.disabled) return;
            e.currentTarget.style.background = "var(--background-modifier-hover)";
        },
        []
    );

    const onTextBtnMouseLeave = React.useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.background = "transparent";
        },
        []
    );

    const onTextBtnFocus = React.useCallback(
        (e: React.FocusEvent<HTMLButtonElement>) => {
            if (e.currentTarget.disabled) return;
            e.currentTarget.style.boxShadow = "0 0 0 2px var(--interactive-accent)";
        },
        []
    );

    const onTextBtnBlur = React.useCallback(
        (e: React.FocusEvent<HTMLButtonElement>) => {
            e.currentTarget.style.boxShadow = "none";
        },
        []
    );

    if (picks.length === 0) return null;

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
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>今日策略推荐</div>
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
                {picks.map((s) => (
                    <li key={s.path} style={{ marginBottom: "6px" }}>
                        <button
                            type="button"
                            onClick={() => onOpenFile(s.path)}
                            style={textButtonStyle}
                            onMouseEnter={onTextBtnMouseEnter}
                            onMouseLeave={onTextBtnMouseLeave}
                            onFocus={onTextBtnFocus}
                            onBlur={onTextBtnBlur}
                        >
                            {s.canonicalName}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};
