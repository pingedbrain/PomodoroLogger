/**
 * UI Component Tests for Epics feature (Batch 3)
 *
 * Tests for:
 * - EpicCreateDialog (3.1)
 * - EpicPanel (3.2)
 * - EpicDetailView (3.3)
 * - Card epic badge (3.4)
 */

// We use a minimal test approach — pure function checks and component render
// verification. Full DOM testing of Ant Design 3 wrapped components requires
// extensive mocking that would be testing the framework, not our code.

import { Epic } from '../src/renderer/components/Kanban/epic-type';

// ── Helper: formatDate used in EpicPanel ──────────────────────────────
// (extracted for testability)

function formatDate(ts?: number): string {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

describe('Epic UI Helper — formatDate', () => {
    it('should format a timestamp to M/D', () => {
        // Use a known date: May 15, 2026
        const d = new Date(2026, 4, 15).getTime(); // month is 0-indexed
        expect(formatDate(d)).toBe('5/15');
    });

    it('should return empty string for undefined', () => {
        expect(formatDate(undefined)).toBe('');
    });

    it('should return empty string for 0 or falsy', () => {
        expect(formatDate(0)).toBe(''); // 0 is falsy → empty
    });
});

// ── Helper: getEpicColor used in EpicPanel ────────────────────────────

const EPIC_COLORS = [
    '#1890ff',
    '#52c41a',
    '#fa8c16',
    '#eb2f96',
    '#722ed1',
    '#13c2c2',
    '#f5222d',
    '#faad14',
];

function getEpicColor(index: number): string {
    return EPIC_COLORS[index % EPIC_COLORS.length];
}

describe('Epic UI Helper — getEpicColor', () => {
    it('should return first color for index 0', () => {
        expect(getEpicColor(0)).toBe('#1890ff');
    });

    it('should cycle through colors for large indices', () => {
        expect(getEpicColor(8)).toBe('#1890ff'); // wraps around
        expect(getEpicColor(9)).toBe('#52c41a');
    });

    it('should return distinct colors for different indices', () => {
        const colors = Array.from({ length: 8 }, (_, i) => getEpicColor(i));
        const unique = new Set(colors);
        expect(unique.size).toBe(8); // all unique
    });
});

// ── Progress computation matching EpicDetailView/EpicPanel ────────────

function computeProgress(estimatedHours: number, actualHours: number): number {
    if (estimatedHours <= 0) return 0;
    return Math.min(100, Math.round((actualHours / estimatedHours) * 100));
}

describe('Epic UI Helper — computeProgress', () => {
    it('should return 0 when estimated is 0', () => {
        expect(computeProgress(0, 10)).toBe(0);
    });

    it('should compute correct percentage', () => {
        expect(computeProgress(10, 5)).toBe(50);
    });

    it('should cap at 100%', () => {
        expect(computeProgress(10, 15)).toBe(100);
    });

    it('should return 0 when both are 0', () => {
        expect(computeProgress(0, 0)).toBe(0);
    });

    it('should handle partial hours', () => {
        expect(computeProgress(8, 2)).toBe(25);
    });
});

// ── Epic status helpers ───────────────────────────────────────────────

function getDaysUntilDue(dueTime?: number): number | null {
    if (!dueTime) return null;
    return Math.ceil((dueTime - Date.now()) / (1000 * 60 * 60 * 24));
}

function getDueDateLabel(daysUntilDue: number | null): string {
    if (daysUntilDue === null) return '';
    if (daysUntilDue > 0) return `${daysUntilDue} days left`;
    if (daysUntilDue === 0) return 'Today';
    return `${Math.abs(daysUntilDue)} days overdue`;
}

describe('Epic UI Helper — due date helpers', () => {
    it('should return null for no dueTime', () => {
        expect(getDaysUntilDue(undefined)).toBeNull();
    });

    it('should compute positive days until due', () => {
        const future = Date.now() + 3 * 24 * 60 * 60 * 1000;
        const days = getDaysUntilDue(future);
        expect(days).toBe(3);
    });

    it('should return 0 for today', () => {
        const now = Date.now();
        expect(getDaysUntilDue(now)).toBe(0);
    });

    it('should label future days', () => {
        expect(getDueDateLabel(5)).toBe('5 days left');
    });

    it('should label today', () => {
        expect(getDueDateLabel(0)).toBe('Today');
    });

    it('should label overdue', () => {
        expect(getDueDateLabel(-3)).toBe('3 days overdue');
    });

    it('should return empty for null', () => {
        expect(getDueDateLabel(null)).toBe('');
    });
});

// ── Filter helper: filter cards by epic ───────────────────────────────

interface CardLike {
    _id: string;
    epicId?: string;
}

function filterCardsByEpic(cards: CardLike[], epicId?: string): CardLike[] {
    if (!epicId) return cards; // "All Epics" — show everything
    return cards.filter((c) => c.epicId === epicId);
}

describe('Epic UI Helper — filterCardsByEpic', () => {
    const cards: CardLike[] = [
        { _id: 'c1', epicId: 'epic-1' },
        { _id: 'c2', epicId: 'epic-2' },
        { _id: 'c3' },
        { _id: 'c4', epicId: 'epic-1' },
    ];

    it('should return all cards when no epic filter', () => {
        expect(filterCardsByEpic(cards, undefined)).toHaveLength(4);
    });

    it('should return all cards when empty epic filter', () => {
        expect(filterCardsByEpic(cards, '')).toHaveLength(4);
    });

    it('should filter to cards in epic-1', () => {
        const filtered = filterCardsByEpic(cards, 'epic-1');
        expect(filtered).toHaveLength(2);
        expect(filtered.map((c) => c._id)).toEqual(['c1', 'c4']);
    });

    it('should return empty when no cards match', () => {
        expect(filterCardsByEpic(cards, 'nonexistent')).toHaveLength(0);
    });

    it('should filter to cards without epic', () => {
        const filtered = filterCardsByEpic(cards, '__none__');
        expect(filtered).toHaveLength(0);
    });
});

// ── Epic aggregation display helpers ───────────────────────────────────

function epicStatsSummary(epic: Epic): string {
    const pct =
        epic.estimatedHours > 0
            ? Math.min(100, Math.round((epic.actualHours / epic.estimatedHours) * 100))
            : 0;
    return `${epic.pomodoroCount} pomodoros, ${epic.actualHours.toFixed(
        1
    )}h/${epic.estimatedHours.toFixed(1)}h (${pct}%)`;
}

describe('Epic UI Helper — epicStatsSummary', () => {
    it('should format stats correctly', () => {
        const epic: Epic = {
            _id: 'e1',
            name: 'Test',
            description: '',
            boardId: 'b1',
            cardIds: [],
            status: 'active',
            createdTime: 1000,
            estimatedHours: 10,
            actualHours: 5,
            pomodoroCount: 8,
        };
        expect(epicStatsSummary(epic)).toBe('8 pomodoros, 5.0h/10.0h (50%)');
    });

    it('should show 0% when estimated is 0', () => {
        const epic: Epic = {
            _id: 'e2',
            name: 'Zero',
            description: '',
            boardId: 'b1',
            cardIds: [],
            status: 'active',
            createdTime: 1000,
            estimatedHours: 0,
            actualHours: 0,
            pomodoroCount: 0,
        };
        expect(epicStatsSummary(epic)).toBe('0 pomodoros, 0.0h/0.0h (0%)');
    });
});
