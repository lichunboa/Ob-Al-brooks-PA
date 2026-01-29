import * as React from "react";
import { DailyJournal } from "../../../types/journal";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { buttonStyle, buttonSmStyle } from "../../../ui/styles/dashboardPrimitives";

const titleStyle: React.CSSProperties = {
    fontSize: "1.2em",
    fontWeight: "600",
    marginBottom: "10px",
    color: "var(--text-normal)",
};

interface JournalEditorProps {
    date: string;
    entry?: DailyJournal;
    onSave: (entry: DailyJournal) => Promise<void>;
}

export const JournalEditor: React.FC<JournalEditorProps> = ({
    date,
    entry,
    onSave,
}) => {
    // Local state for form
    const [mood, setMood] = React.useState<DailyJournal['mood']>("neutral");
    const [score, setScore] = React.useState<number>(5);
    const [notes, setNotes] = React.useState<string>("");

    // Check if dirty
    const [isDirty, setIsDirty] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);

    // Sync from props when date or entry changes
    React.useEffect(() => {
        if (entry) {
            setMood(entry.mood);
            setScore(entry.score);
            setNotes(entry.notes);
        } else {
            // Reset for new entry
            setMood("neutral");
            setScore(5);
            setNotes("");
        }
        setIsDirty(false);
    }, [date, entry]);

    const handleSave = async () => {
        setIsSaving(true);
        const newEntry: DailyJournal = {
            date,
            mood,
            score,
            notes,
            tags: [], // TODO: Tag selector
        };
        await onSave(newEntry);
        setIsSaving(false);
        setIsDirty(false);
    };

    const MOODS: { val: DailyJournal['mood'], icon: string, label: string }[] = [
        { val: "disciplined", icon: "🧘‍♂️", label: "Disciplined" },
        { val: "neutral", icon: "😐", label: "Neutral" },
        { val: "tilted", icon: "😡", label: "Tilted" },
        { val: "fearful", icon: "😨", label: "Fearful" },
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", height: "100%" }}>
            {/* Header / Meta */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {/* Mood Selector */}
                <GlassPanel>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>Mood</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                        {MOODS.map(m => (
                            <button
                                key={m.val}
                                onClick={() => { setMood(m.val); setIsDirty(true); }}
                                className={`pa-btn ${mood === m.val ? "pa-btn--lift" : "pa-btn--text"}`}
                                style={{
                                    padding: "6px",
                                    opacity: mood === m.val ? 1 : 0.6,
                                    border: mood === m.val ? "1px solid var(--interactive-accent)" : undefined
                                }}
                                title={m.label}
                            >
                                <span style={{ fontSize: "16px" }}>{m.icon}</span>
                            </button>
                        ))}
                    </div>
                </GlassPanel>

                {/* Score Selector */}
                <GlassPanel>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>Self Score (1-10)</div>
                    <input
                        type="range"
                        min="1" max="10"
                        value={score}
                        onChange={(e) => { setScore(Number(e.target.value)); setIsDirty(true); }}
                        style={{ width: "100%" }}
                    />
                    <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "16px" }}>{score}</div>
                </GlassPanel>
            </div>

            {/* Notes Editor */}
            <GlassPanel style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>Reflections</div>
                <textarea
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); setIsDirty(true); }}
                    style={{
                        flex: 1,
                        width: "100%",
                        resize: "none",
                        background: "transparent",
                        border: "none",
                        fontFamily: "var(--font-monospace)",
                        fontSize: "13px"
                    }}
                    placeholder="Write your review here..."
                />
            </GlassPanel>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                    className="pa-btn pa-btn--lift"
                    disabled={!isDirty || isSaving}
                    onClick={handleSave}
                    style={{ minWidth: "100px" }}
                >
                    {isSaving ? "Saving..." : "Save Entry"}
                </button>
            </div>
        </div>
    );
};
