# Task Plan - Dashboard Refactoring

- [x] Extract Schema Logic to `src/hooks/useSchemaScanner.ts` <!-- id: 30 -->
    - [x] Create `src/hooks/useSchemaScanner.ts` with logic from Dashboard.tsx (lines 356-488). <!-- id: 31 -->
    - [x] Import and use the hook in `Dashboard.tsx`. <!-- id: 32 -->
    - [x] Verify build. <!-- id: 33 -->
- [x] Extract Action Logic to `src/hooks/useDashboardActions.ts` <!-- id: 34 -->
    - [x] Create `useDashboardActions` hook. <!-- id: 35 -->
    - [x] Move `handleToggleChecklistItem` and `handleUpdateRiskLimit` to hook. <!-- id: 36 -->
    - [x] Integrate into `Dashboard.tsx`. <!-- id: 37 -->
- [x] Extract Header to `src/views/components/dashboard/DashboardHeader.tsx` <!-- id: 38 -->
    - [x] Create component with props. <!-- id: 39 -->
    - [x] Move JSX and local handlers. <!-- id: 40 -->
    - [x] Update Dashboard.tsx. <!-- id: 41 -->
