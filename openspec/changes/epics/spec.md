# Spec: Epics — Parent-Child Grouping for Kanban Cards

**Status**: Draft  
**Change**: epics  
**Backend**: engram (`sdd/epics/spec`) + openspec (`openspec/changes/epics/spec.md`)  
**Depends on**: Proposal (`sdd/epics/proposal`)  

---

## 1. Functional Requirements

### 1.1 Epic CRUD

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-CRUD-01 | Create an epic with `name` (required), `description` (optional), `dueDate` (optional), and automatic `boardId` linkage to the current board. Epics are scoped to a board. | P0 |
| REQ-CRUD-02 | Read/List epics for a given board. Return epics sorted by creation time (newest first). Include computed aggregate fields (`totalPomodoros`, `totalEstimatedHours`, `totalActualHours`, `completionPercent`). | P0 |
| REQ-CRUD-03 | Update epic metadata: name, description, dueDate, status (`active` | `archived`). Epics default to `active` on creation. | P0 |
| REQ-CRUD-04 | Archive an epic (soft-delete via status field). Archived epics are hidden from the Kanban board view but remain accessible in reports and the archive view. | P0 |
| REQ-CRUD-05 | Delete an epic (hard-delete). Must warn if cards are still assigned. Cards remain intact; their `epicId` field is cleared. | P1 |

### 1.2 Epic-Card Assignment

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-ASSIGN-01 | Assign a card to an epic by setting `card.epicId = epic._id`. A card can belong to at most one epic at a time. | P0 |
| REQ-ASSIGN-02 | Unassign a card from an epic by clearing its `epicId`. | P0 |
| REQ-ASSIGN-03 | Re-assign a card from one epic to another (atomic swap: clear old `epicId`, set new `epicId`). | P0 |
| REQ-ASSIGN-04 | Prevent deleting an epic that has assigned cards without user confirmation (warning dialog). | P1 |
| REQ-ASSIGN-05 | Provide a UI mechanism to assign cards: (a) context menu on a card "Assign to Epic...", (b) drag card onto epic in sidebar, (c) multi-select and bulk-assign. | P1 |

### 1.3 Epic Progress Aggregation

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-AGG-01 | Aggregate total pomodoro sessions across all cards in an epic: `totalPomodoros = sum(card.sessionIds.length)`. Deduplicate session IDs across cards to handle the session over-association quirk. | P0 |
| REQ-AGG-02 | Aggregate total estimated hours: `totalEstimatedHours = sum(card.spentTimeInHour.estimated)`. | P0 |
| REQ-AGG-03 | Aggregate total actual hours: `totalActualHours = sum(card.spentTimeInHour.actual)`. | P0 |
| REQ-AGG-04 | Compute completion percentage as `min(totalActualHours / totalEstimatedHours * 100, 100)` when `totalEstimatedHours > 0`. Show `N/A` when no estimate is set. | P0 |
| REQ-AGG-05 | Compute aggregates on-demand (read path), not stored. Follow the DataMerger pattern: merge epics similarly to how boards are merged. | P0 |
| REQ-AGG-06 | Cache aggregated values per render cycle to avoid recomputation on every render. | P1 |

### 1.4 Epic UI

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-UI-01 | Epic creation dialog: modal with fields for name (required), description (textarea, optional), due date (date picker, optional). Accessible via a "+ Epic" button in the Kanban toolbar. | P0 |
| REQ-UI-02 | Epic sidebar/panel: collapsible panel on the right side of the Kanban board listing all active epics for the current board. Each entry shows epic name, card count, and a mini progress bar. | P0 |
| REQ-UI-03 | Epic detail view when clicking an epic in the sidebar: shows full epic metadata, the list of assigned cards, and aggregate stats (total pomodoros, estimated vs actual hours, completion %). | P0 |
| REQ-UI-04 | Card badge: small colored tag/badge on each card indicating its assigned epic name. Uses a distinct color per epic (deterministic color from epic `_id`). | P0 |
| REQ-UI-05 | Epic progress bar in the sidebar list item: visual bar showing completion %, with estimated vs actual time breakdown below it. | P1 |
| REQ-UI-06 | Edit epic dialog: pre-filled modal to edit name, description, due date. Accessible from the epic sidebar item context menu. | P1 |
| REQ-UI-07 | Archive/unarchive action in the epic sidebar context menu. Archived epics move to a separate "Archived" section at the bottom of the sidebar. | P1 |

### 1.5 Timer Integration

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-TIMER-01 | When a pomodoro session finishes, if any card in the focused list has an `epicId`, attribute the session to that epic. Since sessions are associated with ALL cards in the focused list (existing behavior), deduplicate session IDs when computing epic aggregates. | P0 |
| REQ-TIMER-02 | The session record itself does not store an `epicId` field. Epic attribution is derived at aggregation time from the card's `epicId` at the time of reading. This is consistent with how `boardId` attribution works. | P0 |

### 1.6 Reports & Filters

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-RPT-01 | Add an epic filter dropdown in the History/Reports view next to the existing project (board) filter. Filtering by epic shows only sessions attributed to cards in that epic. | P0 |
| REQ-RPT-02 | Epic-level efficiency view: show aggregated efficiency metrics (total pomodoros, total time, avg efficiency) for each epic in a given time range. | P1 |
| REQ-RPT-03 | Existing report visualizations (Bar chart, DualPieChart, PomodoroDot, ProjectTrend) should respect the epic filter when one is selected. | P1 |
| REQ-RPT-04 | Add an epic breakdown section in reports: list all epics with their stats, expandable to show individual cards. | P2 |

### 1.7 Data Persistence

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-DB-01 | New NeDB collection `epicsDB` with path in `config.dbPaths` as `epicsDB: join(dbBaseDir, 'epics.nedb')`. | P0 |
| REQ-DB-02 | Initialize `epicsDB` in `main/db.ts` alongside existing collections. Expose via `renderer/dbs.ts`. | P0 |
| REQ-DB-03 | Create a `DBWorker` for `epicsDB` in `workers/index.ts` following the existing pattern. | P0 |
| REQ-DB-04 | No data migration required. Existing cards without `epicId` continue to work identically. The `epicId` field is optional (`string | undefined`) on the `Card` interface. | P0 |

---

## 2. Interface Definitions

### 2.1 Epic Interface

```typescript
// src/renderer/components/Kanban/type.d.ts (new addition)

export interface Epic {
    _id: string;
    name: string;
    description: string;       // defaults to ''
    boardId: string;           // scoped to a board
    status: 'active' | 'archived';
    dueDate?: number;          // timestamp, optional
    createdTime: number;
    updatedTime: number;
}

// Computed on read (not stored):
export interface EpicAggregates {
    totalPomodoros: number;       // deduplicated session count
    totalEstimatedHours: number;
    totalActualHours: number;
    completionPercent: number | null;  // null when no estimate set
    cardCount: number;
}
```

### 2.2 Card Extension

```typescript
// src/renderer/components/Kanban/type.d.ts (modified)

export interface Card {
    _id: string;
    content: string;
    title: string;
    sessionIds: string[];
    spentTimeInHour: {
        estimated: number;
        actual: number;
    };
    createdTime?: number;
    epicId?: string;             // NEW: optional, references Epic._id
}
```

### 2.3 Epic Redux State

```typescript
// New: src/renderer/components/Epic/reducer.ts (or appended to reducers/index.ts)

export interface EpicState {
    epics: { [_id: string]: Epic };
    aggregates: { [_id: string]: EpicAggregates };
    filter: {
        boardId: string | null;
        epicId: string | null;    // for reports filter
    };
}

// Added to RootState (reducers/index.ts):
// epic: EpicState;
```

---

## 3. Scenarios (Gherkin)

### Scenario 1: Create an epic with name, description, and due date

```gherkin
Feature: Epic Creation

  Scenario: User creates an epic with full details
    Given the user is viewing a Kanban board
    When the user clicks the "+ Epic" button in the toolbar
    Then an epic creation dialog appears
    
    When the user enters "Release v2.0" as the epic name
    And enters "All tickets needed for the v2.0 release" as the description
    And selects "2026-07-01" as the due date
    And clicks "Create"
    Then a new epic document is inserted into the epics collection
    And the epic appears in the sidebar with name "Release v2.0"
    And the epic shows 0 cards, 0 pomodoros, 0% progress
    And the Kanban toolbar "+ Epic" button re-enables

  Scenario: User creates an epic with only a name (minimum fields)
    Given the user is viewing a Kanban board
    When the user clicks the "+ Epic" button
    And enters "Bug Bash" as the epic name
    And leaves description and due date empty
    And clicks "Create"
    Then an epic is created with empty description and no due date
    And the epic appears in the sidebar
```

### Scenario 2: Assign a card to an epic

```gherkin
Feature: Epic-Card Assignment

  Scenario: User assigns a card to an epic via context menu
    Given the board has an active epic "Release v2.0"
    And the board has a card "Implement login page"
    When the user right-clicks the card "Implement login page"
    And selects "Assign to Epic" from the context menu
    And selects "Release v2.0" from the epic list
    Then the card's epicId is set to "Release v2.0"'s _id
    And the card displays an epic badge with "Release v2.0" name
    And the epic sidebar updates to show card count = 1
    And the epic progress bar appears (even if 0%)
```

### Scenario 3: Unassign a card from an epic

```gherkin
Feature: Card Unassignment

  Scenario: User unassigns a card from its epic
    Given the card "Implement login page" is assigned to epic "Release v2.0"
    When the user right-clicks the card
    And selects "Remove from Epic" from the context menu
    Then the card's epicId is cleared (set to undefined)
    And the epic badge disappears from the card
    And the epic "Release v2.0" card count decrements to 0
    And the epic's aggregate stats recalculate
```

### Scenario 4: View epic progress aggregated from cards

```gherkin
Feature: Epic Progress

  Scenario: User views an epic's aggregated progress
    Given epic "Release v2.0" has 3 assigned cards:
      | Card                | Estimated (hrs) | Actual (hrs) | Session IDs |
      | Implement login     | 4.0             | 3.5          | [s1, s2]    |
      | Add tests           | 2.0             | 1.0          | [s3]        |
      | Write docs          | 1.0             | 0.0          | []          |
    When the user clicks on epic "Release v2.0" in the sidebar
    Then the epic detail view shows:
      | Metric              | Value   |
      | Total Cards         | 3       |
      | Total Pomodoros     | 3       |
      | Total Estimated     | 7.0 hrs |
      | Total Actual        | 4.5 hrs |
      | Completion          | 64%     |
    And the progress bar is filled to 64%

  Scenario: Epic progress shows N/A when no card has estimates
    Given epic "Bug Bash" has 2 cards with no estimated hours set
    When the user views epic "Bug Bash" details
    Then the completion percentage shows "N/A"
    And the progress bar is indeterminate (or empty with a dash)
```

### Scenario 5: Complete a pomodoro session → epic time updates

```gherkin
Feature: Timer Integration

  Scenario: Pomodoro session on epic-assigned card updates epic aggregates
    Given the user is focused on a board with epic "Release v2.0"
    And the focused list contains cards ["Implement login" (epicId: release-v2), "Add tests" (epicId: release-v2), "Write docs" (no epic)]
    When a pomodoro session finishes with 0.5 hours spent
    And the session is attributed to ALL cards in the focused list (existing behavior)
    Then the card "Implement login" sessionIds includes the new session
    And the card "Add tests" sessionIds includes the new session
    And the card "Write docs" sessionIds includes the new session
    When epic aggregates are computed
    Then epic "Release v2.0" totalPomodoros increments by 1 (not 2) due to deduplication
    And epic "Release v2.0" totalActualHours increments by 0.5 (not 1.0)
```

### Scenario 6: Filter kanban board by epic

```gherkin
Feature: Board Filtering

  Scenario: User filters the kanban board to show only cards in an epic
    Given the board has epics "Release v2.0" (3 cards) and "Bug Bash" (2 cards)
    When the user selects "Release v2.0" from the epic filter dropdown
    Then only the 3 cards assigned to "Release v2.0" are visible across lists
    And cards not in "Release v2.0" are hidden (or visually dimmed)
    And the filter indicator shows "Filtering: Release v2.0"
    
    When the user clears the epic filter
    Then all 5 cards are visible again

  Scenario: Filter dropdown shows "(No Epic)" option for unassigned cards
    Given the board has cards with and without epicId
    When the user opens the epic filter dropdown
    Then the dropdown includes an "(Unassigned Cards)" option
    And selecting it shows only cards with no epicId
```

### Scenario 7: Archive an epic

```gherkin
Feature: Epic Archival

  Scenario: User archives an active epic
    Given epic "Release v2.0" has 2 assigned cards
    When the user opens the context menu on epic "Release v2.0" in the sidebar
    And selects "Archive"
    Then a confirmation dialog appears: "Archive this epic? Cards will remain but their epic badge will be hidden."
    When the user confirms
    Then the epic's status is set to "archived"
    And the epic moves to the "Archived" section in the sidebar
    And the cards' epicId values are preserved (not cleared)
    And the cards no longer show the epic badge
    And the epic is excluded from the active epic filter dropdown
    
    When the user expands the Archived section and clicks "Unarchive"
    Then the epic's status reverts to "active"
    And the epic returns to the active section
    And the card badges reappear
```

### Scenario 8: View epic in reports/dashboard

```gherkin
Feature: Epic Reporting

  Scenario: User filters reports by epic
    Given the History view is showing the default all-sessions report
    When the user selects epic "Release v2.0" from the epic filter dropdown
    Then the session list is filtered to sessions belonging to cards in epic "Release v2.0"
    And the aggregate stats (total time, pomodoro count) reflect only those sessions
    And the epoch visualization (PomodoroDot, Bar chart) updates to show filtered data
    
    When the user also selects a board filter in addition to the epic filter
    Then both filters apply (intersection — sessions that match BOTH)
    
    When the user clears the epic filter
    Then the report returns to its unfiltered state (respecting board filter if still active)

  Scenario: Epic-level efficiency view shows per-epic metrics
    Given sessions exist across multiple epics in the selected time range
    When the user switches to "Epic Breakdown" view in reports
    Then a table/list shows each epic with:
      | Epic           | Pomodoros | Total Hours | Avg Efficiency | Cards |
      | Release v2.0   | 12        | 6.0         | 82%            | 3     |
      | Bug Bash       | 5         | 2.5         | 75%            | 2     |
    And clicking an epic row expands to show individual card breakdown
```

---

## 4. Non-Functional Requirements

### 4.1 Backward Compatibility

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-BC-01 | Existing cards without `epicId` work exactly as before. The `epicId` field is optional (`string | undefined`). All existing tests pass without modification. | P0 |
| NFR-BC-02 | Existing boards, lists, and reports function unchanged when no epics exist. | P0 |
| NFR-BC-03 | The `DataMerger.mergeCard()` function must preserve `epicId` across merges (cards from different DB instances should retain their epic assignment). | P0 |
| NFR-BC-04 | The epic sidebar panel is hidden (or shows an empty state) when viewing a board with no epics. Additive UI — no existing layout shifts. | P0 |

### 4.2 Performance

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-PF-01 | Epic aggregation computation must not block the UI thread. Use the existing Web Worker pattern for DB operations. Aggregation should run in the same worker context. | P0 |
| NFR-PF-02 | Aggregation results are cached per render cycle. If the underlying data hasn't changed (same Redux state), return cached aggregates. | P1 |
| NFR-PF-03 | Boards with a large number of epics (>20) and cards (>500) must still render the sidebar without noticeable lag (>100ms frame drop). Virtualize the epic list if needed. | P1 |

### 4.3 Session Deduplication

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-DEDUP-01 | Epic aggregates must account for the session over-association quirk: when a session finishes, it is attributed to ALL cards in the focused list. When computing `totalPomodoros` for an epic, use a Set over session IDs across all assigned cards to deduplicate. | P0 |
| NFR-DEDUP-02 | Similarly, `totalActualHours` must count each session's `spentTimeInHour` only once per epic, even if multiple cards in the epic share the same session ID. | P0 |

### 4.4 Data Integrity

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-DI-01 | Epics are scoped to a board via `boardId`. Listing epics for a board only returns epics with matching `boardId`. | P0 |
| NFR-DI-02 | Assigning a card to an epic from a different board should be prevented (epics are board-scoped). | P0 |
| NFR-DI-03 | If a board is deleted, its epics should be cleaned up (orphan epics should be flagged or removed). | P1 |

---

## 5. Data Flow

### 5.1 Epic Aggregation (Read Path)

```
1. User views epic sidebar / detail
2. React component dispatches FETCH_EPIC_AGGREGATES
3. Thunk reads:
   a. Epic document from epicsDB via DBWorker
   b. All cards from cardsDB where epicId === epic._id
4. For each card:
   a. Collect sessionIds into a Set (deduplication)
   b. Sum spentTimeInHour.estimated
   c. Sum spentTimeInHour.actual
5. Compute completionPercent = (totalActual / totalEstimated) * 100
6. Dispatch SET_EPIC_AGGREGATES with computed values
7. Component re-renders with aggregated data
```

### 5.2 Session Attribution (Timer Finish Path)

```
1. Timer finishes → timerFinished(sessionData, cardIds, boardId)
2. Session saved to sessionDB (existing behavior)
3. For each cardId in cardIds:
   a. Add sessionId to card.sessionIds (existing behavior)
   b. Add spentTimeInHour to card.spentTimeInHour.actual (existing behavior)
4. (No direct epic update — epic aggregates are computed on read)
5. Epic aggregate cache is invalidated (set dirty flag)
```

### 5.3 DataMerger Integration

```
1. DataMerger currently merges: records, cards, lists, boards, move
2. Add epic merging: mergeEpics(ans, b.epics)
3. Epic merge rules:
   - Latest updatedTime wins for metadata (name, description, dueDate, status)
   - Card IDs in the epic are unioned (not replaced — cards may be added on either side)
4. No change to session dedup logic — that's in the aggregation read path
```

---

## 6. Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Card in multiple epics** | Prevented at schema level — `epicId` is a single string, not an array. A card can belong to at most one epic. |
| **Epic with 0 cards** | Show empty state with "No cards assigned. Drag cards here or use card context menu." Aggregates show all zeros. |
| **Epic deleted with assigned cards** | Warning dialog: "This epic has N assigned cards. Deleting will unassign them." On confirm, clear `epicId` on all cards, then delete epic. |
| **Board switch** | Sidebar reloads epics for the newly selected board. Filter state resets per-board. |
| **Session over-association** | Dedup via Set<sessionId> across all cards in the epic. A session shared by 2 cards in the same epic counts once. |
| **Estimated = 0 on all cards** | `completionPercent` shows `null` → UI displays "N/A" instead of "0%". |
| **Epic name too long** | Truncate epic name in badges (>20 chars shows ellipsis). Full name visible on hover/tooltip. |
| **Race condition: card assigned while aggregation running** | Aggregation reads current Redux state which is synchronous. No race as long as dispatching is sequential. |
| **Cross-board assignment attempt** | UI prevents selecting epics from other boards. API-level check on the reducer: reject if card's board doesn't match epic's boardId. |
| **Multiple rapid session finishes** | Each timerFinished dispatch is sequential. Aggregation reads from Redux which is updated synchronously. |
| **Archived epic with active filter** | Archived epics are excluded from the main filter dropdown. An "Include Archived" checkbox optionally reveals them. |

---

## 7. Affected Files

| File | Change | Description |
|------|--------|-------------|
| `src/config.ts` | Modified | Add `epicsDB` to `dbPaths` |
| `src/main/db.ts` | Modified | Initialize `epicsDB` NeDB collection |
| `src/renderer/dbs.ts` | Modified | Expose `epicsDB` (auto-handled by sharedDB pattern) |
| `src/renderer/components/Kanban/type.d.ts` | Modified | Add `Epic` interface, `EpicAggregates` interface, `epicId` on `Card` |
| `src/renderer/reducers/index.ts` | Modified | Add `epic` slice to `RootState` |
| `src/renderer/components/Kanban/Card/action.ts` | Modified | Handle `epicId` field in card CRUD |
| `src/renderer/components/Kanban/Card/reducer.ts` | Modified | Handle `epicId` set/clear actions |
| `src/shared/dataMerger/dataMerger.ts` | Modified | Merge epic data across DB instances |
| `src/renderer/workers/index.ts` | Modified | Add `epicsDB` worker |
| `src/renderer/components/Timer/action.ts` | Modified | Invalidate epic aggregation cache on session finish |
| `src/renderer/components/History/op.ts` | Modified | Filter records by epic ID |
| `src/renderer/components/History/action.ts` | Modified | Add `chosenEpicId` filter state |
| `src/renderer/components/History/History.tsx` | Modified | Add epic filter dropdown UI |
| `src/renderer/components/Kanban/Board/action.ts` | Modified | Add epic-scoped board actions |

**New files:**
| File | Description |
|------|-------------|
| `src/renderer/components/Epic/reducer.ts` | Epic Redux reducer (actions, state, thunks) |
| `src/renderer/components/Epic/EpicSidebar.tsx` | Epic sidebar panel component |
| `src/renderer/components/Epic/EpicDialog.tsx` | Epic creation/edit dialog |
| `src/renderer/components/Epic/EpicBadge.tsx` | Epic badge component for cards |
| `src/renderer/components/Epic/EpicDetail.tsx` | Epic detail view with aggregates |
| `src/renderer/components/Epic/EpicFilter.tsx` | Epic filter dropdown (used in board + reports) |
| `src/renderer/components/Epic/EpicBreakdown.tsx` | Epic breakdown section in reports |

---

## 8. Out of Scope (Confirmed)

- **Nested epics** (epics within epics) — No hierarchical structure beyond flat epic grouping.
- **Epic templates** — No pre-defined epic templates.
- **Auto-assignment rules** — No rules-based automation for assigning cards to epics.
- **Epic-specific color themes** — Colors are deterministic from `_id`, not user-configurable.
- **Epic due-date reminders** — No notification system for approaching due dates.
- **Bulk epic operations** — No batch create/edit/archive of epics.

---

## 9. Risks (Updated from Proposal)

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| Session over-association double-counting | High | Deduplicate session IDs via Set when computing aggregates |
| UI density — epics add complexity to Kanban | Med | Progressive disclosure: epic panel as collapsible sidebar; badge only on hover or always-on (configurable) |
| NeDB aggregation performance across many cards | Low | Compute on-demand, cache per render cycle; offload to Web Worker |
| Merge conflicts on epic metadata | Low | Latest `updatedTime` wins; cards are unioned (additive) |
| Orphan epics after board deletion | Low | Track via `boardId`; cleanup on board delete (existing cleanup loop) |
