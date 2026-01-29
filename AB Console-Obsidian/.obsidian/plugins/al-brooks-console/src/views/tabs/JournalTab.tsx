import * as React from "react";
import { DailyJournal } from "../../types/journal";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { GlassPanel } from "../../ui/components/GlassPanel";
import { glassPanelStyle, glassCardStyle } from "../../ui/styles/dashboardPrimitives";
import { JournalCalendar } from "../components/journal/JournalCalendar";
import { JournalEditor } from "../components/journal/JournalEditor";
import { TradeList } from "../components/TradeList";

const titleStyle: React.CSSProperties = {
    fontSize: "1.2em",
    fontWeight: "600",
    marginBottom: "10px",
    color: "var(--text-normal)",
};

import { TradeRecord } from "../../core/contracts";

interface JournalTabProps {
    journalLogs: DailyJournal[];
    onSaveLog: (entry: DailyJournal) => Promise<void>;
    trades: TradeRecord[];
    onOpenFile: (path: string) => void;
}

export const JournalTab: React.FC<JournalTabProps> = ({
    journalLogs,
    onSaveLog,
    trades,
    onOpenFile,
}) => {
    const [selectedDate, setSelectedDate] = React.useState<string>(new Date().toISOString().split("T")[0]);

    // Find entry for selected date
    const selectedEntry = React.useMemo(() =>
        journalLogs.find(l => l.date === selectedDate),
        [journalLogs, selectedDate]
    );

    // Filter trades for selected date
    const selectedTrades = React.useMemo(() =>
        trades.filter(t => t.dateIso === selectedDate),
        [trades, selectedDate]
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--size-4-4)", height: "100%" }}>
            <SectionHeader title="Trading Journal" icon="book-open" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "var(--size-4-4)", flex: 1, minHeight: 0 }}>
                {/* Left: Calendar View */}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--size-4-4)" }}>
                    <GlassPanel className="pa-journal-calendar">
                        <h3 style={titleStyle}>Calendar</h3>
                        <JournalCalendar
                            selectedDate={selectedDate}
                            onSelectDate={setSelectedDate}
                            trades={trades}
                            journalLogs={journalLogs}
                        />
                    </GlassPanel>

                    {/* Trade List for selected date (Moved to left column or below calendar if space permits,
                        but effectively maybe better in right column split?
                        Let's put it in the right column split for better visibility)
                    */}
                </div>


                {/* Right: Daily Review Editor & Trades */}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--size-4-4)", minHeight: 0 }}>
                    <GlassPanel className="pa-journal-editor" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "300px" }}>
                        <h3 style={titleStyle}>Daily Review: {selectedDate}</h3>
                        <div style={{ flex: 1, minHeight: 0 }}>
                            <JournalEditor
                                date={selectedDate}
                                entry={selectedEntry}
                                onSave={onSaveLog}
                            />
                        </div>
                    </GlassPanel>

                    <GlassPanel style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                        <h3 style={titleStyle}>Trades ({selectedTrades.length})</h3>
                        <div style={{ flex: 1, overflowY: "auto" }}>
                            {selectedTrades.length > 0 ? (
                                <TradeList trades={selectedTrades} onOpenFile={onOpenFile} />
                            ) : (
                                <div style={{ color: "var(--text-muted)", fontSize: "12px", padding: "10px" }}>
                                    No trades recorded for this date.
                                </div>
                            )}
                        </div>
                    </GlassPanel>
                </div>
            </div>
        </div>
    );
};
