import * as React from "react";
import { Button } from "../../../ui/components/Button";

interface StrategyPick {
    path: string;
    canonicalName: string;
}

interface Props {
    picks: StrategyPick[];
    onOpenFile: (path: string) => void;
}

export const Strategies: React.FC<Props> = ({ picks, onOpenFile }) => {
    if (picks.length === 0) return null;

    return (
        <div className="pa-card">
            <h4 className="pa-card-title" style={{ marginBottom: "8px", fontSize: "1em" }}>今日策略推荐</h4>
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
                {picks.map((s) => (
                    <li key={s.path} style={{ marginBottom: "6px" }}>
                        <Button
                            variant="text"
                            onClick={() => onOpenFile(s.path)}
                            style={{ textAlign: "left", padding: "2px 4px", width: "100%" }}
                        >
                            {s.canonicalName}
                        </Button>
                    </li>
                ))}
            </ul>
        </div>
    );
};
