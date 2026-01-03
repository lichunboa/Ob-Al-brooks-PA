# Console Repair & Polish Spec

## Goal
Restore feature parity with the v5.0 (Dataview) console and fix UI/UX issues in the new v1.0 React plugin.

## Context
The Trading Console has been ported from a Dataview-based system (v5.0) to a native Obsidian Plugin (v1.0). While the core logic exists, several features are missing or broken, and the UI lacks the polish of the original.

## Problem Analysis
- **UI Architecture**: `Dashboard.tsx` is monolithic (>3000 lines), making it hard to style and debug.
- **Missing Parity**: Key visual elements from v5.0 (likely R-multiples, specific color grading, layout density) need restoration.
- **Data Integrity**: Ensure `TradeIndex` and `Stats` match the original numbers exactly.

## Reference
- **Legacy System**: v5.0 screenshots (pending user upload).
- **Current System**: `src/views/Dashboard.tsx` and core logic.

## Strategy
1. **Component Refactoring**: Break down `Dashboard.tsx` into atomic, testable components.
2. **Visual QA**: Align CSS/Layout with v5.0 standards (Premium Aesthetics).
3. **Feature Restoration**: Re-enable disabled or broken sections (Analytics, Strategy Cards).
