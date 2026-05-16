# Design: Epics — Parent-Child Grouping for Kanban Cards

## Technical Approach

Pure additive — new `epics` NeDB collection + optional `epicId` field on `Card`. Epic aggregation uses **cached computed fields**: totals are stored on the Epic document and recalculated whenever cards are added/removed or a pomodoro session finishes. This avoids expensive on-demand aggregation across card-to-session joins and is consistent with the existing pattern where `Board.spentHours` and `Board.relatedSessions` are derived at write time.

The approach diverges from the DataMerger pattern (compute-on-read) for pragmatic reasons: epic stats are displayed in real-time UI (progress bars, summary cards) and recomputing by scanning all linked cards × session records on every render would be costly. Cached fields are kept consistent via a single aggregation function triggered at every mutation point.

## Architecture Decisions

### Decision: Cached computed fields vs compute-on-read

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Compute on read (DataMerger style) | Pure derived data, no sync issues, but expensive to compute across card×session joins on every render | ❌ Rejected — too expensive for real-time progress bars |
| Cached computed fields on Epic doc | Fast reads, must sync at mutation points, slight data duplication | ✅ **Chosen** — pragmatic for real-time UI, sync is contained |
| Hybrid: cache + DataMerger re-derives | Keeps DataMerger in sync, adds complexity | ⚠️ DataMerger already re-derives Board stats; Epic stats will be re-derived similarly |

DataMerger will also re-derive Epic cached fields during merge, following the same pattern as `setBoardInfo()`. This ensures cross-device sync consistency.

### Decision: Local component state vs Redux slice for epics

| Option | Tradeoff | Decision |
|--------|----------|----------|
| New `epics` Redux slice | Full Redux integration, selectors, debugging, but boilerplate | ❌ Rejected — Kanban uses `dbs` + `workers` directly for most operations; epics is simpler |
| Local state with direct DB calls | Matches existing Kanban patterns (Board/List/Card all use `workers.dbWorkers`), less indirection | ✅ **Chosen** — epics are always loaded in context of a board, so a `useEpics(boardId)` hook with local state is sufficient |
| Hybrid: thin slice + local state | Over-engineered for this scope | ❌ Rejected |

### Decision: Epic DB operations handled by existing DBWorker

The `DBWorker` class is fully generic — it takes a `dbPaths` key and routes all CRUD (`find`, `insert`, `update`, `remove`, `count`) to the correct NeDB file. Adding `epicDB` to `dbPaths` is sufficient; no new worker class needed.

## Data Model

```typescript
// src/renderer/components/Kanban/type.d.ts — NEW interface
interface Epic {
    _id: string;
    name: string;
    description: string;
    boardId: string;
    cardIds: string[];
    status: 'active' | 'completed' | 'archived';
    createdTime: number;
    dueTime?: number;
    estimatedHours: number;   // cached: sum of cards' spentTimeInHour.estimated
    actualHours: number;      // cached: sum of unique session durations
    pomodoroCount: number;    // cached: count of unique sessionIds
}

// Modified Card
interface Card {
    _id: string;
    content: string;
    title: string;
    sessionIds: string[];
    spentTimeInHour: {
        estimated: number;
        actual: number;
    };
    createdTime?: number;
    epicId?: string;           // NEW — optional link to Epic._id
}
```

## Aggregation Logic

The core aggregation function `recalcEpicStats(epic, allCards, allSessions)`:

```
estimatedHours = sum(card.spentTimeInHour.estimated for each card in epic.cardIds)

actualHours = sum(
    deduplicated session durations:
      collect all sessionIds from all cards in epic.cardIds
      for each unique sessionId, look up PomodoroRecord.spentTimeInHour
      sum them
)

pomodoroCount = count(unique sessionIds across all cards in epic.cardIds)
```

Session deduplication is **critical** due to the over-association quirk: when a session finishes, ALL cards in the focused list receive that `sessionId`. Without dedup, an epic covering multiple cards in the same list would double-count the same session.

## Data Flow

### Session Attribution Flow

```
Timer.onFocusingSessionDone()
  → Timer.action.timerFinished(sessionData, cardIds, boardId)
    → boardActions.onTimerFinished(boardId, sessionId, spentTime, cardIds)
      → for each cardId:
          cardActions.onTimerFinished(cardId, sessionId, spentTime)
            → updates Card.sessionIds[] and Card.spentTimeInHour.actual
            → reads updated card from DB
            → if card.epicId exists:
                loads Epic from epicsDB
                runs recalcEpicStats(epic, allCards, allSessions)
                  → queries epicsDB to get all linked cards
                  → queries sessionDB for unique sessionIds
                saves Epic back to epicsDB
```

### Epic CRUD Flow

```
EpicCreateDialog
  → insert into epicsDB (cardIds: [], totals: 0)
  → local state setEpics(prev => [...prev, newEpic])

AssignCardToEpic
  → update Card: set epicId
  → update Epic: push cardId to cardIds, recalc totals
  → local state update

RemoveCardFromEpic
  → update Card: unset epicId
  → update Epic: pull cardId from cardIds, recalc totals
  → local state update
```

### DataMerger Integration

`DataMerger` gains an `epics` field in `SourceData` and a `mergeEpics()` method that:
- Merges Epic documents by `_id` (like `mergeBoards`)
- After merge, calls `setEpicInfo()` which recalculates cached totals (parallel to `setBoardInfo()`)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/config.ts` | Modify | Add `epicsDB` to `dbPaths` |
| `src/main/db.ts` | Modify | Add `epicsDB` to `DBs` and `refreshDbs` |
| `src/renderer/components/Kanban/type.d.ts` | Modify | Add `Epic` interface; add `epicId?: string` to `Card` |
| `src/renderer/components/Kanban/Epic/action.ts` | Create | Epic CRUD actions + `recalcEpicStats()` |
| `src/renderer/components/Kanban/Epic/EpicPanel.tsx` | Create | Sidebar panel listing epics for current board |
| `src/renderer/components/Kanban/Epic/EpicCard.tsx` | Create | Single epic row (name, progress bar, due badge) |
| `src/renderer/components/Kanban/Epic/EpicCreateDialog.tsx` | Create | Modal dialog for creating an epic |
| `src/renderer/components/Kanban/Epic/EpicDetailView.tsx` | Create | Detailed view: stats + filtered card list |
| `src/renderer/components/Kanban/Epic/index.ts` | Create | Barrel export |
| `src/renderer/components/Kanban/Kanban.tsx` | Modify | Integrate EpicPanel sidebar; add "Filter by Epic" dropdown |
| `src/renderer/components/Kanban/Card/Card.tsx` | Modify | Add epic badge (colored tag with epic name) |
| `src/renderer/components/Kanban/Card/CardContextMenu.tsx` | Modify | Add "Assign to Epic" / "Remove from Epic" |
| `src/renderer/components/Kanban/Board/Board.tsx` | Modify | Pass epic filter state to List/Card rendering |
| `src/renderer/components/Timer/action.ts` | Modify | In `timerFinished`, after card update, trigger epic recalculation |
| `src/renderer/components/Kanban/Board/action.ts` | Modify | In `onTimerFinished`, after card updates, trigger epic recalc for any card with epicId |
| `src/shared/dataMerger/dataMerger.ts` | Modify | Add `epics` to `SourceData`; add `mergeEpics()` and `setEpicInfo()` |
| `src/renderer/components/Visualization/PomodoroDot.tsx` | Modify | Add `epicId` prop; filter records by epic's card sessionIds |
| `src/renderer/components/Visualization/ProjectTrend.tsx` | Modify | Add `epicId` filter prop |
| `src/renderer/components/Visualization/Bar.tsx` | Modify | Add `epicId` filter prop |
| `src/renderer/components/Visualization/DualPieChart.tsx` | Modify | Add `epicId` filter prop |

**Totals**: 8 new files, 14 modified files.

## Interfaces / Contracts

### EpicActions

```typescript
interface EpicActions {
    fetchEpics(boardId: string): Promise<Epic[]>;
    createEpic(boardId: string, name: string, description?: string, dueTime?: number): Promise<Epic>;
    updateEpic(_id: string, updates: Partial<Epic>): Promise<void>;
    deleteEpic(_id: string): Promise<void>;
    assignCardToEpic(cardId: string, epicId: string): Promise<void>;
    removeCardFromEpic(cardId: string): Promise<void>;
    recalcEpicStats(epicId: string): Promise<void>;  // core aggregation
}
```

### Hook

```typescript
function useEpics(boardId?: string): {
    epics: Epic[];
    loading: boolean;
    createEpic: (name: string, description?: string, dueTime?: number) => Promise<Epic>;
    deleteEpic: (_id: string) => Promise<void>;
    assignCard: (cardId: string, epicId: string) => Promise<void>;
    removeCard: (cardId: string) => Promise<void>;
    getEpicForCard: (cardId: string) => Epic | undefined;
    filterByEpic: string | undefined;  // current epic filter
    setFilterByEpic: (epicId?: string) => void;
}
```

### DataMerger Extension

```typescript
interface SourceData {
    records: PomodoroRecord[];
    cards: CardsState;
    lists: ListsState;
    boards: KanbanBoardState;
    move: MoveInfo[];
    epics: EpicsState;    // NEW
}
```

`DataMerger.setEpicInfo()` iterates all epics, recalculates `estimatedHours`, `actualHours`, `pomodoroCount` from linked cards (using `travelCards` pattern), and writes back to the merge output.

## Session Deduplication Detail

The over-association quirk means one pomodoro session is attributed to every card in the focused list. When an epic has 3 cards in the same list, each session appears in all 3 cards' `sessionIds`. The aggregation must:

```
uniqueSessionIds = new Set<string>()
for each cardId in epic.cardIds:
    card = cards[cardId]
    for sessionId of card.sessionIds:
        uniqueSessionIds.add(sessionId)

actualHours = sum(records[sessionId].spentTimeInHour for each unique sessionId)
pomodoroCount = uniqueSessionIds.size
estimatedHours = sum(cards[cardId].spentTimeInHour.estimated for each cardId in epic.cardIds)
```

## UI Component Tree

```
Kanban.tsx
├── Board (existing, modified)
│   └── List (existing)
│       └── Card (existing, modified)
│           ├── EpicBadge (new inline component) ← shows colored tag with epic name
│           └── CardContextMenu (existing, modified)
│               ├── "Assign to Epic" → submenu listing available epics
│               └── "Remove from Epic" (visible only if card has epicId)
├── EpicPanel (new, collapsible sidebar)
│   ├── EpicList
│   │   └── EpicCard (name, progress bar, due date badge, card count)
│   ├── EpicCreateDialog (modal: name, description, dueTime)
│   └── EpicDetailView (expanded from EpicCard click)
│       ├── ProgressStats (estimated vs actual bar, pomodoro count)
│       └── CardList (filtered cards belonging to this epic)
└── FilterByEpic dropdown (new, in toolbar)
```

### Styling approach
- Follow existing `styled-components` patterns in Kanban (`src/renderer/components/Kanban/style/`)
- Epic badges use a color derived from the epic's `_id` (hash → HSL, consistent with existing color patterns)
- EpicPanel is a collapsible right sidebar, similar to the existing overview panel pattern
- Use Ant Design `Modal`, `Progress`, `Badge`, `Select` components already in the project

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `recalcEpicStats()` with cross-card session dedup | Pure function test: mock cards + records, verify dedup produces correct totals |
| Unit | Epic CRUD actions (create, assign, remove) | Use `FakeDBWorker` (already in test environment) to assert DB state |
| Unit | DataMerger `setEpicInfo()` | Add epic test data to existing merger tests, verify totals after merge |
| Integration | Session attribution → epic recalc flow | `boardActions.onTimerFinished()` with cards that have `epicId`, verify epic totals update |
| E2E | UI: create epic → assign card → verify progress bar | Requires Electron test harness (manual for now) |

## Migration / Rollout

No migration required. `epicId` on Card is `undefined` by default — existing cards are unaffected. The `epics` collection starts empty. Feature is behind no flag since it's purely additive.

## Open Questions

- [ ] Should EpicPanel be a collapsible right drawer, or always-visible sidebar? Suggestion: collapsible drawer matching the existing Kanban layout patterns.
- [ ] What color generation strategy for epic badges? Option: hash from `_id` to HSL, similar to existing board color patterns.
- [ ] Should epic status transitions ('active' → 'completed') be manual (user clicks complete) or automatic (when all cards in doneList)? Suggestion: manual for now, auto as future enhancement.
- [ ] Does the DataMerger's existing `travelCards` helper need an epic-aware variant, or can `setEpicInfo` use a simpler model-level query?
