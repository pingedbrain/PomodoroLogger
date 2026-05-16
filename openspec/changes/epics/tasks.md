# Tasks: Epics — Parent-Child Grouping for Kanban Cards

**Status**: Draft
**Change**: epics
**Backend**: engram (`sdd/epics/tasks`) + openspec (`openspec/changes/epics/tasks.md`)
**Depends on**: Spec (`sdd/epics/spec`), Design (`sdd/epics/design`)

---

## Summary

| Metric | Count |
|--------|-------|
| **Total tasks** | 22 |
| **Batch 1: Data Model & Persistence** | 6 tasks |
| **Batch 2: Aggregation Logic** | 4 tasks |
| **Batch 3: UI — Epic Management** | 6 tasks |
| **Batch 4: Reports & Polish** | 4 tasks |
| **Integration tests** | 2 tasks |
| **Total files created** | 8 (all in Batch 3) |
| **Total files modified** | 14 |
| **Total files affected** | 22 |

---

## Batch 1: Data Model & Persistence

*Goal: Establish the data foundation — epic collection, type system, and CRUD helpers. No UI changes yet.*

---

### 1.1 Add `epicsDB` to `dbPaths` in `src/config.ts`

| Field | Detail |
|-------|--------|
| **File(s)** | `src/config.ts` |
| **Change** | Add `epicsDB: join(dbBaseDir, 'epics.nedb')` to the `dbPaths` object |
| **Dependencies** | None |
| **Complexity** | 1 (one-line addition) |
| **Test strategy** | Covered by existing config tests (assert object shape). No dedicated test needed. |

```typescript
export const dbPaths = {
    // ... existing
    epicsDB: join(dbBaseDir, 'epics.nedb'),   // NEW
};
```

**Note**: The test env block (`process.env.NODE_ENV === 'test'`) iterates `dbPaths` keys and appends `shortid` — `epicsDB` is automatically included with no additional change needed.

---

### 1.2 Initialize `epicsDB` in `src/main/db.ts`

| Field | Detail |
|-------|--------|
| **File(s)** | `src/main/db.ts` |
| **Change** | Destructure `epicsDB` from `dbPaths`; add `epicsDB: new nedb({ filename: epicsDB })` to `DBs` object and `refreshDbs()` |
| **Dependencies** | 1.1 (must have dbPaths entry) |
| **Complexity** | 1 (mechanical addition, 4 lines) |
| **Test strategy** | Covered by existing DB init tests. Also: assert `DBs.epicsDB` is defined after `loadDBs()`. |

```typescript
const { projectDB, sessionDB, settingDB, kanbanDB, cardsDB, listsDB, moveDB, epicsDB } = dbPaths;
export let DBs = {
    // ... existing
    epicsDB: new nedb({ filename: epicsDB }),
};
// Same addition in refreshDbs()
```

**Note**: `src/renderer/dbs.ts` re-exports `DBs` automatically — no change needed there. The `workers/index.ts` `initWorkers()` iterates `dbPaths` keys — the `epicsDB` worker is created automatically with no code change to that file.

---

### 1.3 Add `Epic` interface to `src/renderer/components/Kanban/type.d.ts`

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/type.d.ts` |
| **Change** | Add `Epic` and `EpicAggregates` interfaces |
| **Dependencies** | None |
| **Complexity** | 1 (type-only addition) |
| **Test strategy** | TypeScript compilation check. No runtime test. |

```typescript
export interface Epic {
    _id: string;
    name: string;
    description: string;
    boardId: string;
    cardIds: string[];
    status: 'active' | 'archived';
    estimatedHours: number;    // cached: sum of cards' estimated
    actualHours: number;       // cached: sum of unique session durations
    pomodoroCount: number;     // cached: count of unique sessionIds
    createdTime: number;
    dueTime?: number;
}

export interface EpicAggregates {
    totalPomodoros: number;
    totalEstimatedHours: number;
    totalActualHours: number;
    completionPercent: number | null;  // null when no estimate set
    cardCount: number;
}
```

---

### 1.4 Add `epicId?: string` to `Card` interface

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/type.d.ts` |
| **Change** | Add `epicId?: string` field to the existing `Card` interface |
| **Dependencies** | None |
| **Complexity** | 1 (one-line addition) |
| **Test strategy** | TypeScript compilation. No migration needed — `undefined` by default on existing cards. |

```typescript
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
    epicId?: string;  // NEW
}
```

---

### 1.5 Create Epic DB helper functions (`src/renderer/components/Kanban/Epic/action.ts`)

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/Epic/action.ts` (NEW) |
| **Change** | Create a module with functions for Epic CRUD operations using `workers.dbWorkers.epicsDB`. Export: `fetchEpics`, `createEpic`, `updateEpic`, `deleteEpic`, `assignCardToEpic`, `removeCardFromEpic`. |
| **Dependencies** | 1.1, 1.2, 1.3, 1.4 |
| **Complexity** | 2 (follows existing Board/action.ts patterns; 6 CRUD functions) |
| **Test strategy** | See task 1.6 |

**Functions**:

| Function | Signature | Description |
|----------|-----------|-------------|
| `fetchEpics` | `(boardId: string) => Promise<Epic[]>` | Find all epics with matching `boardId`, sort by `createdTime` desc |
| `createEpic` | `(boardId, name, description?, dueTime?) => Promise<Epic>` | Insert new epic with `shortid`, default `cardIds: []`, `status: 'active'`, totals = 0 |
| `updateEpic` | `(_id, updates: Partial<Epic>) => Promise<void>` | `$set` fields on epic doc |
| `deleteEpic` | `(_id) => Promise<void>` | Remove epic doc. Must check for assigned cards first → optionally clear `epicId` on cards. |
| `assignCardToEpic` | `(cardId, epicId) => Promise<void>` | Set `card.epicId = epicId` via `cardActions`, add `cardId` to epic's `cardIds`, recalc stats |
| `removeCardFromEpic` | `(cardId) => Promise<void>` | Clear `card.epicId`, remove `cardId` from epic's `cardIds`, recalc stats |

**Key pattern** (from design):
```typescript
const db = workers.dbWorkers.epicsDB;
// Follows same fetch/create/update/delete pattern as Board/action.ts
```

---

### 1.6 Write unit tests for Epic CRUD operations

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/Epic/action.test.ts` (NEW) |
| **Change** | Write Jest tests for each CRUD function using `FakeDBWorker` (already in test env) |
| **Dependencies** | 1.5 (functions must exist to test) |
| **Complexity** | 2 (follows Board/action.test.ts patterns for DB-backed tests; db cleanup in `beforeEach`) |
| **Test strategy** | Unit tests using `FakeDBWorker` to assert DB state. |

**Test cases**:

```gherkin
Feature: Epic CRUD

  Scenario: Create epic with full details
    Given a board_id "B1"
    When createEpic(B1, "Release v2.0", "Desc", dueTime) is called
    Then a new epic doc exists in epicsDB
    And epic.name === "Release v2.0"
    And epic.boardId === "B1"
    And epic.cardIds === []
    And epic.estimatedHours === 0

  Scenario: Create epic with minimum fields (name only)
    When createEpic(B1, "Bug Bash") is called
    Then epic.description === ""
    And epic.dueTime is undefined

  Scenario: Fetch epics for a board
    Given board B1 has 3 epics, board B2 has 2 epics
    When fetchEpics("B1") is called
    Then it returns exactly 3 epics
    And they are sorted by createdTime descending

  Scenario: Update epic metadata
    Given an epic with _id "E1"
    When updateEpic("E1", { name: "New Name", status: "archived" })
    Then epic.name === "New Name"
    And epic.status === "archived"

  Scenario: Delete epic
    Given an epic with _id "E1"
    When deleteEpic("E1")
    Then epicsDB no longer has _id "E1"

  Scenario: Assign card to epic
    Given card "C1" and epic "E1"
    When assignCardToEpic("C1", "E1")
    Then card C1's epicId === "E1" (verify via cardsDB)
    And epic E1's cardIds includes "C1"

  Scenario: Remove card from epic
    Given card "C1" is assigned to epic "E1"
    When removeCardFromEpic("C1")
    Then card C1's epicId is undefined
    And epic E1's cardIds does not include "C1"
```

---

## Batch 2: Aggregation Logic

*Goal: Implement the core `recalculateEpicStats` function and integrate it at all mutation points. This is the most critical batch for correctness due to the session over-association quirk.*

---

### 2.1 Implement `recalculateEpicStats(epicId)` — core aggregation

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/Epic/action.ts` (add to existing file from 1.5) |
| **Change** | Add `recalcEpicStats(epicId)` function that: (1) loads the epic, (2) queries all cards where `epicId` matches, (3) deduplicates session IDs via Set, (4) sums estimated/actual hours, (5) writes back to epicsDB |
| **Dependencies** | 1.3, 1.4 (types), 1.5 (action.ts file exists) |
| **Complexity** | 3 (core algorithm with dedup logic; must handle edge cases) |
| **Test strategy** | See task 2.4 |

**Algorithm** (from spec §5.1):
```
uniqueSessionIds = new Set<string>()
for each cardId in epic.cardIds:
    card = cards[cardId]
    for sessionId of card.sessionIds:
        uniqueSessionIds.add(sessionId)

actualHours = sum(records[sessionId].spentTimeInHour for each unique sessionId)
pomodoroCount = uniqueSessionIds.size
estimatedHours = sum(cards[cardId].spentTimeInHour.estimated for each cardId)
completionPercent = min(actualHours / estimatedHours * 100, 100) if estimated > 0 else null
```

**Edge cases**:
- Epic with 0 cards → all zeros, `completionPercent = null`
- Cards with no sessions → skipped in pomodoro count
- Estimated=0 on all cards → `completionPercent = null` (N/A)
- Session appears in multiple cards within same epic → deduplicated via Set
- Card has `epicId` but epic no longer exists → skip (orphaned card)

**Design choice**: The design doc specifies **cached computed fields** on the Epic document (not compute-on-read). This function writes back to epicsDB after computation.

---

### 2.2 Integrate epic aggregation with timer finish flow

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Timer/action.ts`, `src/renderer/components/Kanban/Board/action.ts` |
| **Change** | After `cardActions.onTimerFinished()` in `boardActions.onTimerFinished()`, check if any card has `epicId` and call `recalcEpicStats(epicId)` for each unique epic encountered. |
| **Dependencies** | 2.1 (recalcEpicStats must exist) |
| **Complexity** | 2 (follows existing timerFinished → card update chain) |

**Flow** (from design §Session Attribution Flow):
```
Timer.onFocusingSessionDone()
  → Timer.action.timerFinished(sessionData, cardIds, boardId)
    → boardActions.onTimerFinished(boardId, sessionId, spentTime, cardIds)
      → for each cardId:
          cardActions.onTimerFinished(cardId, sessionId, spentTime)
          → after all cards updated:
              collect unique epicIds from cardIds
              for each epicId: recalcEpicStats(epicId)
```

**Key detail**: The epic recalc runs AFTER all card updates are done, inside `boardActions.onTimerFinished()`. This ensures the DB has all updated card data before aggregating.

**Modification in `Board/action.ts`**:
```typescript
onTimerFinished: (boardId, sessionId, spentTime, cardIds) => async (dispatch) => {
    // existing: update board
    dispatch(onTimerFinished(boardId, sessionId, spentTime));
    await db.update(...);
    
    // existing: update cards
    for (const cardId of cardIds) {
        await cardActions.onTimerFinished(cardId, sessionId, spentTime)(dispatch);
    }
    
    // NEW: recalc epic aggregates
    const affectedEpics = new Set<string>();
    for (const cardId of cardIds) {
        const card = await workers.dbWorkers.cardsDB.findOne({ _id: cardId });
        if (card?.epicId) {
            affectedEpics.add(card.epicId);
        }
    }
    for (const epicId of affectedEpics) {
        await recalcEpicStats(epicId);
    }
    
    await actions.setLastVisitTime(boardId, new Date().getTime())(dispatch);
}
```

---

### 2.3 Update DataMerger with `setEpicInfo()`

| Field | Detail |
|-------|--------|
| **File(s)** | `src/shared/dataMerger/dataMerger.ts` |
| **Change** | (1) Add `epics` field to `SourceData` interface, (2) Add `mergeEpics()` method following `mergeBoards` pattern, (3) Add `setEpicInfo()` that recalculates cached totals by iterating epic.cardIds → looking up cards, (4) Call both in `merge()` method |
| **Dependencies** | 1.3 (Epic type), 1.4 (Card.epicId type) |
| **Complexity** | 3 (must understand existing DataMerger patterns deeply; epic merge rules: latest updatedTime wins, cardIds unioned) |
| **Test strategy** | Add epic test cases to existing dataMerger tests (task 2.4) |

**Modifications**:
```typescript
export interface SourceData {
    records: PomodoroRecord[];
    cards: CardsState;
    lists: ListsState;
    boards: KanbanBoardState;
    move: MoveInfo[];
    epics: EpicsState;  // NEW: { [_id: string]: Epic }
}
```

```typescript
// In DataMerger class:
merge(a: SourceData, b: SourceData): SourceData {
    const ans = cloneDeep(a);
    this.mergeRecords(ans, b.records);
    this.setRecordMap(ans);
    this.mergeCards(ans, b.cards);
    this.mergeMove(ans, b.move);
    this.mergeLists(ans, b.lists);
    this.mergeBoards(ans, b.boards);
    this.mergeEpics(ans, b.epics);        // NEW
    this.resetDanglingCard(ans);
    this.setBoardInfo(ans);
    this.setEpicInfo(ans);                 // NEW
    this.clear();
    return ans;
}
```

`setEpicInfo()` iterates all epics, uses card data from `ans.cards` to recalculate:
```typescript
private setEpicInfo(ans: SourceData) {
    for (const epicId in ans.epics) {
        const epic = ans.epics[epicId];
        const uniqueSessions = new Set<string>();
        let estimatedHours = 0;
        for (const cardId of epic.cardIds) {
            const card = ans.cards[cardId];
            if (!card) continue; // skip deleted cards
            estimatedHours += card.spentTimeInHour.estimated;
            for (const sId of card.sessionIds) {
                uniqueSessions.add(sId);
            }
        }
        // actualHours from unique sessions
        let actualHours = 0;
        for (const sId of uniqueSessions) {
            actualHours += this.recordMap[sId]?.spentTimeInHour ?? 0;
        }
        epic.estimatedHours = estimatedHours;
        epic.actualHours = actualHours;
        epic.pomodoroCount = uniqueSessions.size;
    }
}
```

---

### 2.4 Write tests for aggregation logic (including deduplication edge case)

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/Epic/action.test.ts` (add to existing from 1.6), `src/shared/dataMerger/__test__/epicCase/` (NEW test data directory) |
| **Change** | Write unit tests for `recalcEpicStats()` and data merger epic integration |
| **Dependencies** | 2.1, 2.3 |
| **Complexity** | 2 (complexity is in the dedup edge cases, not the test harness) |
| **Test strategy** | Pure function tests with mocked DB + cards + records |

**Test cases for `recalcEpicStats`**:

| Scenario | Setup | Expected |
|----------|-------|----------|
| **Basic aggregation** | Epic E1 has 2 cards, each with 1 unique session | pomodoroCount=2, actualHours=sum of 2 sessions |
| **Deduplication across cards** | Epic E1 has 2 cards sharing 1 session (over-association) | pomodoroCount=1 (not 2), actualHours counted once |
| **Mixed: some shared, some unique** | 3 cards: C1[s1,s2], C2[s2,s3], C3[s4] → total unique: s1,s2,s3,s4 | pomodoroCount=4, actualHours=sum(s1-s4) |
| **Epic with 0 cards** | cardIds=[] | All zeros, completionPercent=null |
| **Estimated=0 on all cards** | 2 cards, estimated=0 on both | completionPercent=null (N/A) |
| **Mixed estimated = 0** | C1: est=0, act=1; C2: est=4, act=2 | completionPercent=2/4=50% (skip C1 in estimate) |
| **No sessions on any card** | 2 cards, both sessionIds=[] | pomodoroCount=0, actualHours=0 |

**Test cases for DataMerger integration**:
| Scenario | Setup | Expected |
|----------|-------|----------|
| **Merge epics from two instances** | Instance A has epic E1, Instance B has same epic E1 with new card | Merged epic has union of cardIds |
| **Merge epics with latest metadata wins** | Instance A: E1.name="Old", Instance B: E1.name="New" (later updatedTime) | Merged name = "New" |
| **setEpicInfo recalculates after merge** | After merge of cards + records + epics, `setEpicInfo` runs | epic.estimatedHours, .actualHours, .pomodoroCount correct |

---

## Batch 3: UI — Epic Management

*Goal: Build the epic user interface — creation dialog, sidebar panel with list, detail view, card badges, context menu, and filter.*

---

### 3.1 Create `EpicCreateDialog` component

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/Epic/EpicCreateDialog.tsx` (NEW) |
| **Change** | React component using Ant Design `Modal` + `Form`. Fields: name (`Input`, required), description (`Input.TextArea`, optional), due date (`DatePicker`, optional). Submit calls `createEpic`. |
| **Dependencies** | 1.5 (createEpic must exist) |
| **Complexity** | 2 (standard form dialog following existing patterns) |
| **Test strategy** | Snapshot test + enzyme mount test for form submission |

**Props**:
```typescript
interface EpicCreateDialogProps {
    visible: boolean;
    onClose: () => void;
    boardId: string;
    onCreated: (epic: Epic) => void;  // callback to update local state
}
```

**States**: visible/hidden, submitting, validation error, duplicate name warning.

---

### 3.2 Create `EpicPanel` sidebar component with `EpicList` and `EpicCard`

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/Epic/EpicPanel.tsx`, `src/renderer/components/Kanban/Epic/EpicCard.tsx`, `src/renderer/components/Kanban/Epic/index.ts` (ALL NEW) |
| **Change** | `EpicPanel` is a collapsible right sidebar (following Kanban layout patterns). Contains `EpicList` rendering `EpicCard` entries. Each `EpicCard` shows: epic name, card count badge, mini progress bar, due date indicator. `EpicPanel` also has a "+" button to open `EpicCreateDialog` and an optional "Archived" section. |
| **Dependencies** | 1.5 (fetchEpics), 2.1 (recalcEpicStats), 3.1 (create dialog) |
| **Complexity** | 3 (non-trivial layout; collapsible panel; progress bar rendering; archived section toggle) |
| **Test strategy** | Snapshot test with mock epic data; test collapsible open/close; test empty state |

**Component structure**:
```
EpicPanel
├── Header ("Epics" title + "+" button)
├── Active Epics section
│   └── EpicCard[] (scrollable list)
│       ├── Color dot (hashed from _id)
│       ├── Name (truncated >20 chars)
│       ├── Progress bar (completion %)
│       ├── Card count badge
│       └── Due date indicator (if near)
├── [Collapsed] Archived section
│   └── ArchivedEpicCard[]
└── EpicCreateDialog (modal, conditionally rendered)
```

**EpicCard detail**:
```typescript
interface EpicCardProps {
    epic: Epic;
    aggregates: EpicAggregates;
    onSelect: (epicId: string) => void;   // open detail view
    onArchive: (epicId: string) => void;
    onUnarchive: (epicId: string) => void;
    color: string;  // deterministic HSL from _id hash
}
```

**Styling**: Use `styled-components` following `src/renderer/components/Kanban/style/` patterns. Progress bar via Ant Design `<Progress />`.

---

### 3.3 Create `EpicDetailView` with progress stats

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/Epic/EpicDetailView.tsx` (NEW) |
| **Change** | Shows full epic metadata (name, description, due date, status), aggregate stats (estimated vs actual hours bar, pomodoro count, completion %), and a filtered card list showing all cards assigned to this epic (with time spent per card). |
| **Dependencies** | 1.5 (fetchEpics), 2.1 (recalcEpicStats), 3.4 (epic badge for cards) |
| **Complexity** | 2 (data display component; card list uses existing List subcomponents if possible) |
| **Test strategy** | Snapshot test with mock data |

**Sections**:
1. **Header**: Epic name (editable), status badge, archive/unarchive button
2. **Stats**: estimated vs actual horizontal bar (`<Progress percent={...} success={{ percent: actualPct }} />`), pomodoro count, card count
3. **Card list**: Compact list of cards assigned to this epic, each showing title, time badge, and epic badge.

---

### 3.4 Add epic badge to `Card` component

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/Card/Card.tsx` (modify) |
| **Change** | When `card.epicId` is defined, display a small colored badge/tag with the epic name in the card header. Color derived deterministically from epic `_id` (hash → HSL). Badge clickable → filter board by this epic. |
| **Dependencies** | 1.4 (Card.epicId), 1.5 (fetchEpics to get epic name), 3.6 (filter integration) |
| **Complexity** | 2 (rendering conditional badge; needs epic data from context/state) |
| **Test strategy** | Snapshot: card with epicId shows badge; card without epicId shows no badge |

**Badge component** (inline or tiny sub-component):
```tsx
const EpicBadge = styled.span`
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 11px;
    color: white;
    cursor: pointer;
    background: ${props => props.color};
`;
```

**Data access**: Card needs to know the epic name. Options:
- Pass epic map via context/props from Kanban.tsx
- Add a simple `useEpicsForBadge(boardId)` hook
- The design suggests React context or props drilling for simplicity

---

### 3.5 Add "Assign to Epic" / "Remove from Epic" to card context menu

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/Card/Card.tsx` or `src/renderer/components/Kanban/Card/CardContextMenu.tsx` (if such a file exists; otherwise inline in Card.tsx) |
| **Change** | Add context menu items: "Assign to Epic..." opens submenu listing active epics; "Remove from Epic" (visible only when card has `epicId`) unassigns the card. |
| **Dependencies** | 1.5 (assignCardToEpic, removeCardFromEpic), 3.1 (epic list for submenu), 3.2 (EpicPanel updates on change) |
| **Complexity** | 2 (follows existing card interaction patterns; submenu uses Ant Design `Menu`) |
| **Test strategy** | Snapshot: context menu with vs without epicId. Integration: click "Assign to Epic" → epic assigned. |

**Key UX**:
- Right-click card → context menu with "Assign to Epic" item
- "Assign to Epic" → submenu with list of active epics for current board
- If already assigned, show "Remove from Epic" (with separator) instead of assign option
- After assign: badge appears on card, epic sidebar updates card count

---

### 3.6 Add "Filter by Epic" dropdown to KanbanBoard

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/Kanban.tsx` (modify), `src/renderer/components/Kanban/Board/Board.tsx` (modify) |
| **Change** | Add an epic filter dropdown in the Kanban toolbar (Ant Design `<Select>`). Options: "All Cards" (default), each active epic, "(Unassigned Cards)". Filter state passed down to Board → List → Card rendering to show/hide cards. |
| **Dependencies** | 3.2 (epics available from EpicPanel hook), 1.4 (Card.epicId) |
| **Complexity** | 3 (filter state management; card visibility logic in Board/List; integration with existing search filter) |
| **Test strategy** | Integration: select epic filter → only matching cards visible; clear filter → all cards visible |

**State management**:
```typescript
// Local state in Kanban.tsx or lifted to redux
const [epicFilter, setEpicFilter] = useState<string | undefined>(undefined);
```

**Filter logic in Board/List**:
```typescript
const visibleCards = epicFilter
    ? list.cards.filter(cardId => cards[cardId]?.epicId === epicFilter)
    : epicFilter === '__unassigned__'
        ? list.cards.filter(cardId => !cards[cardId]?.epicId)
        : list.cards; // no filter
```

---

## Batch 4: Reports & Polish

*Goal: Integrate epics into reports/visualizations and handle edge cases.*

---

### 4.1 Add epic filter to visualization components

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Visualization/PomodoroDot.tsx`, `src/renderer/components/Visualization/ProjectTrend.tsx`, `src/renderer/components/Visualization/Bar.tsx`, `src/renderer/components/Visualization/DualPieChart.tsx` |
| **Change** | Add optional `epicId?: string` prop to each component. When provided, filter records/cards to match the epic's cards before rendering. For each component, the filter logic is: if `epicId` is set, only include sessions belonging to cards with that `epicId`. |
| **Dependencies** | 1.4 (Card.epicId), 4.2 (epic-level view for reports) |
| **Complexity** | 2 (mechanical addition of filter prop; each component ~5-10 lines change) |
| **Test strategy** | Snapshot: component with epic filter vs without; verify filtered data output |

**Pattern** (applied to each component):
```typescript
interface Props {
    // existing props...
    epicId?: string;  // NEW
    epics?: { [_id: string]: Epic };  // NEW: epic data for name resolution
}
```

**Filter logic** (in a shared utility or duplicated per component):
```typescript
function filterSessionsByEpic(
    sessions: PomodoroRecord[],
    cards: CardsState,
    epic: Epic
): PomodoroRecord[] {
    const epicCardIds = new Set(epic.cardIds);
    const epicSessionIds = new Set<string>();
    for (const cardId of epicCardIds) {
        const card = cards[cardId];
        if (card) {
            for (const sId of card.sessionIds) {
                epicSessionIds.add(sId);
            }
        }
    }
    return sessions.filter(s => epicSessionIds.has(s._id));
}
```

---

### 4.2 Add epic-level efficiency view

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Visualization/EpicBreakdown.tsx` (NEW), `src/renderer/components/History/History.tsx` (modify), `src/renderer/components/History/action.ts` (modify) |
| **Change** | Add an "Epic Breakdown" option in the History/Reports view. When selected, show a table of all epics in the time range with: epic name, pomodoro count, total hours, avg efficiency, card count. Expandable rows show per-card breakdown. Add `chosenEpicId` filter state to Redux/epic slice. |
| **Dependencies** | 2.1 (recalcEpicStats), 4.1 (visualization filtering) |
| **Complexity** | 3 (new view with data aggregation; time range filtering across epic-card-session chain) |
| **Test strategy** | Snapshot test; integration test with mock session data across multiple epics |

**View structure**:
```
┌──────────────────────────────────────────────────────┐
│  Report Type: [Board ▼] [Epic Breakdown ▼] [Time ▼]  │
├──────────────────────────────────────────────────────┤
│  Epic           │ Pomos │ Hours │ Eff. │ Cards       │
│  ─────────────────────────────────────────────────── │
│  ▶ Release v2.0 │ 12    │ 6.0h  │ 82%  │ 3           │
│    ├ Implement login  │ 4 pomos │ 2.0h │             │
│    ├ Add tests        │ 5 pomos │ 2.5h │             │
│    └ Write docs       │ 3 pomos │ 1.5h │             │
│  ▶ Bug Bash      │ 5     │ 2.5h  │ 75%  │ 2           │
└──────────────────────────────────────────────────────┘
```

---

### 4.3 Handle edge cases

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/Board/action.ts`, `src/renderer/components/Kanban/Epic/action.ts`, `src/renderer/components/Kanban/Kanban.tsx` |
| **Change** | Implement spec §6 edge case handlers |
| **Dependencies** | 1.5, 2.2, 3.2, 3.6 |
| **Complexity** | 2 (multiple small guards across files) |
| **Test strategy** | Unit tests for each edge case |

**Edge cases to handle**:

| Edge Case | Location | Handling |
|-----------|----------|----------|
| **Orphan epics on board delete** | `Board/action.ts` — `deleteBoard()` | After deleting board, query epics with matching `boardId` and delete/archive them. Or show warning if any cards still reference deleted board. |
| **Epic status transitions** | `Epic/action.ts` — `updateEpic()` | Allow status change only to `active`↔`archived`. Prevent deleting active epic with cards without confirmation dialog. |
| **Card re-assignment (epic switch)** | `Epic/action.ts` — `assignCardToEpic()` | If card already has `epicId`, call `removeCardFromEpic` for old epic before assigning to new one. |
| **Board switch resets epic filter** | `Kanban.tsx` — `onBoardChange` | When `chosenBoardId` changes, reset `epicFilter` to undefined and reload epics for new board. |
| **Empty state: no epics** | `EpicPanel.tsx` | Show "No epics yet. Create one!" with a create button instead of empty list. |
| **Empty state: epic has no cards** | `EpicDetailView.tsx` | Show "No cards assigned. Drag cards here or use card context menu." |
| **Archived epic in filter** | `Kanban.tsx` — filter dropdown | Exclude archived epics from main dropdown. Add optional "Include Archived" checkbox. |

---

### 4.4 Write integration tests for the complete flow

| Field | Detail |
|-------|--------|
| **File(s)** | `src/renderer/components/Kanban/Epic/__tests__/epic-integration.test.ts` (NEW) |
| **Change** | Write end-to-end integration tests that exercise the full epic flow: create epic → assign card → timer finishes → filter by epic → archive epic → verify data integrity |
| **Dependencies** | 1.6, 2.4, 3.1, 3.2, 3.4, 3.5, 3.6, 4.1, 4.3 |
| **Complexity** | 3 (most complex test; multi-step state assertions) |
| **Test strategy** | Integration tests using `FakeDBWorker`, redux store, and component render. Follow existing patterns from `Board/action.test.ts`. |

**Integration test scenarios**:

```gherkin
Feature: Epic Complete Flow

  Scenario: Full lifecycle
    Given a board with 2 lists and 3 cards
    When user creates an epic "Release v2.0" for the board
    Then the epic is created with 0 cards
    
    When user assigns card "C1" to the epic
    Then card C1.epicId === epic._id
    And epic.cardIds includes "C1"
    And epic.pomodoroCount === 0
    
    When a pomodoro session finishes (0.5h) on the board
    And the focused list contains C1 and C2 (both in same epic)
    Then epic.pomodoroCount === 1 (deduped)
    And epic.actualHours === 0.5 (not 1.0)
    
    When user views the epic detail
    Then it shows: 1 card, 1 pomodoro, 0.5h actual
    And completion displays correctly
    
    When user archives the epic
    Then epic.status === 'archived'
    And card C1 still has epicId (badge hidden)
    
    When user unarchives the epic
    Then epic.status === 'active'
    And epic reappears in sidebar

  Scenario: DataMerger preserves epic data
    Given SourceData A has epic E1 with card C1
    And SourceData B has the same epic E1 with card C2 added
    When DataMerger.merge(A, B)
    Then merged E1.cardIds includes both C1 and C2
    And setEpicInfo recalculates totals correctly
```

---

## Task Dependency Graph

```
Batch 1 (Data Model)
├── 1.1 config.ts dbPaths         ─┐
├── 1.2 main/db.ts init           ─┤ (no deps)
├── 1.3 Epic type interface       ─┘
├── 1.4 Card.epicId               ─┘
│
├── 1.5 Epic CRUD helpers         ← 1.1, 1.2, 1.3, 1.4
└── 1.6 Unit tests for CRUD       ← 1.5

Batch 2 (Aggregation)
├── 2.1 recalcEpicStats()         ← 1.3, 1.4, 1.5
├── 2.2 Timer integration         ← 2.1
├── 2.3 DataMerger setEpicInfo()  ← 1.3, 1.4
└── 2.4 Aggregation tests         ← 2.1, 2.3

Batch 3 (UI)
├── 3.1 EpicCreateDialog          ← 1.5
├── 3.2 EpicPanel + EpicCard      ← 1.5, 2.1, 3.1
├── 3.3 EpicDetailView            ← 1.5, 2.1, 3.4
├── 3.4 Epic badge on Card        ← 1.4, 1.5, 3.6
├── 3.5 Context menu items        ← 1.5, 3.1, 3.2
└── 3.6 Filter by Epic dropdown   ← 3.2, 1.4

Batch 4 (Reports & Polish)
├── 4.1 Viz component filters     ← 1.4
├── 4.2 EpicBreakdown view        ← 2.1, 4.1
├── 4.3 Edge case handlers        ← 1.5, 2.2, 3.2, 3.6
└── 4.4 Integration tests         ← 1.6, 2.4, 3.x, 4.x
```

---

## File Change Index

### New files (8)

| # | File | Batch |
|---|------|-------|
| 1 | `src/renderer/components/Kanban/Epic/action.ts` | 1 |
| 2 | `src/renderer/components/Kanban/Epic/EpicCreateDialog.tsx` | 3 |
| 3 | `src/renderer/components/Kanban/Epic/EpicPanel.tsx` | 3 |
| 4 | `src/renderer/components/Kanban/Epic/EpicCard.tsx` | 3 |
| 5 | `src/renderer/components/Kanban/Epic/EpicDetailView.tsx` | 3 |
| 6 | `src/renderer/components/Kanban/Epic/index.ts` | 3 |
| 7 | `src/renderer/components/Visualization/EpicBreakdown.tsx` | 4 |
| 8 | `src/renderer/components/Kanban/Epic/action.test.ts` | 1+2 |

### Modified files (14)

| # | File | Batch |
|---|------|-------|
| 1 | `src/config.ts` | 1 |
| 2 | `src/main/db.ts` | 1 |
| 3 | `src/renderer/components/Kanban/type.d.ts` | 1 |
| 4 | `src/shared/dataMerger/dataMerger.ts` | 2 |
| 5 | `src/renderer/components/Timer/action.ts` | 2 |
| 6 | `src/renderer/components/Kanban/Board/action.ts` | 2 |
| 7 | `src/renderer/components/Kanban/Card/Card.tsx` | 3 |
| 8 | `src/renderer/components/Kanban/Kanban.tsx` | 3 |
| 9 | `src/renderer/components/Kanban/Board/Board.tsx` | 3 |
| 10 | `src/renderer/components/Visualization/PomodoroDot.tsx` | 4 |
| 11 | `src/renderer/components/Visualization/ProjectTrend.tsx` | 4 |
| 12 | `src/renderer/components/Visualization/Bar.tsx` | 4 |
| 13 | `src/renderer/components/Visualization/DualPieChart.tsx` | 4 |
| 14 | `src/renderer/components/History/History.tsx` | 4 |

### Test files (4)

| # | File | Batch |
|---|------|-------|
| 1 | `src/renderer/components/Kanban/Epic/action.test.ts` | 1+2 |
| 2 | `src/shared/dataMerger/__test__/epicCase/` (new) | 2 |
| 3 | `src/renderer/components/Kanban/Epic/__tests__/epic-integration.test.ts` | 4 |
| 4 | Snapshot tests for UI components (inline in component directories) | 3 |
