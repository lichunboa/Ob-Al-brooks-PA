import * as React from "react";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { V5_COLORS } from "../../../ui/tokens";
import { Card } from "../../../ui/components/Card";

interface AnalyticsGalleryProps {
    gallery: {
        scopeTotal: number;
        candidateCount: number;
        items: any[];
    };
    openFile: (path: string) => void;
    getResourceUrl?: (path: string) => string;
    SPACE: any;
}

export const AnalyticsGallery: React.FC<AnalyticsGalleryProps> = ({
    gallery,
    openFile,
    getResourceUrl,
    SPACE,
}) => {
    return (
        <Card variant="tight">
            <div
                style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: SPACE.sm,
                    marginBottom: SPACE.sm,
                    flexWrap: "wrap",
                }}
            >
                <div style={{ fontWeight: 700, opacity: 0.75 }}>
                    🖼️ 最新复盘{" "}
                    <span
                        style={{
                            fontWeight: 600,
                            opacity: 0.6,
                            fontSize: "0.85em",
                        }}
                    >
                        （图表/Charts）
                    </span>
                </div>
            </div>

            <div
                style={{
                    marginTop: "2px",
                    color: "var(--text-faint)",
                    fontSize: "0.8em",
                }}
            >
                {`范围内共 ${gallery.scopeTotal} 笔 · 候选 ${gallery.candidateCount} · 展示 ${gallery.items.length}`}
            </div>

            {!getResourceUrl ? (
                <div
                    style={{ color: "var(--text-faint)", fontSize: "0.9em" }}
                >
                    画廊不可用。
                </div>
            ) : gallery.items.length > 0 ? (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: SPACE.md,
                    }}
                >
                    {gallery.items.map((it: any) => (
                        <InteractiveButton
                            key={`gal-${it.tradePath}`}
                            interaction="cover"
                            onClick={() => openFile(it.tradePath)}
                            title={`${it.tradeName} • ${it.coverPath}`}
                            style={{
                                display: "block",
                                width: "100%",
                                height: "auto",
                                minHeight: "140px",
                                padding: 0,
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "8px",
                                overflow: "hidden",
                                background: `rgba(var(--mono-rgb-100), 0.03)`,
                                position: "relative",
                                aspectRatio: "16 / 9",
                            }}
                        >
                            {it.url ? (
                                <>
                                    <img
                                        src={it.url}
                                        alt=""
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "cover",
                                            display: "block",
                                            zIndex: 1,
                                        }}
                                    />

                                    <div
                                        style={{
                                            position: "absolute",
                                            top: SPACE.xs,
                                            right: SPACE.xs,
                                            zIndex: 2,
                                            background:
                                                it.accountType === "Live"
                                                    ? V5_COLORS.live
                                                    : it.accountType === "Backtest"
                                                        ? V5_COLORS.back
                                                        : V5_COLORS.demo,
                                            border:
                                                "1px solid var(--background-modifier-border)",
                                            color: "rgba(var(--mono-rgb-0), 0.9)",
                                            fontSize: "0.6em",
                                            fontWeight: 800,
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                        }}
                                    >
                                        {it.accountType === "Live"
                                            ? "实盘"
                                            : it.accountType === "Backtest"
                                                ? "回测"
                                                : "模拟"}
                                    </div>

                                    <div
                                        style={{
                                            position: "absolute",
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            zIndex: 2,
                                            padding: `${SPACE.xxl} ${SPACE.sm} ${SPACE.xs}`,
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "flex-end",
                                            gap: "10px",
                                            background:
                                                "linear-gradient(rgba(var(--mono-rgb-0), 0), rgba(var(--mono-rgb-0), 0.9))",
                                        }}
                                    >
                                        <div
                                            style={{
                                                color: "var(--text-on-accent)",
                                                fontSize: "0.75em",
                                                fontWeight: 800,
                                                textAlign: "left",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                                flex: "1 1 auto",
                                            }}
                                        >
                                            {it.tradeName}
                                        </div>
                                        <div
                                            style={{
                                                color:
                                                    it.pnl >= 0
                                                        ? V5_COLORS.live
                                                        : V5_COLORS.loss,
                                                fontWeight: 800,
                                                fontSize: "0.9em",
                                                flex: "0 0 auto",
                                                fontVariantNumeric: "tabular-nums",
                                            }}
                                        >
                                            {(() => {
                                                const s = it.pnl
                                                    .toFixed(1)
                                                    .replace(/\.0$/, "");
                                                return `${it.pnl > 0 ? "+" : ""}${s}`;
                                            })()}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div
                                    style={{
                                        position: "absolute",
                                        inset: 0,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "flex-start",
                                        justifyContent: "flex-end",
                                        padding: SPACE.md,
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: "0.8em",
                                            fontWeight: 600,
                                            color: "var(--text-normal)",
                                            marginBottom: "4px",
                                            textAlign: "left",
                                        }}
                                    >
                                        {it.tradeName}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: "0.7em",
                                            color: "var(--text-faint)",
                                            textAlign: "left",
                                        }}
                                    >
                                        {it.tradePath.split("/").pop()}
                                    </div>
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: SPACE.sm,
                                            right: SPACE.sm,
                                            fontSize: "1.5em",
                                            opacity: 0.1,
                                        }}
                                    >
                                        📷
                                    </div>
                                </div>
                            )}
                        </InteractiveButton>
                    ))}
                </div>
            ) : (
                <div
                    style={{ color: "var(--text-faint)", fontSize: "0.9em" }}
                >
                    无图表。
                </div>
            )}
        </Card>
    );
};
