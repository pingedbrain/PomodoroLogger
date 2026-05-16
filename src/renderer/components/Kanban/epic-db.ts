import shortid from 'shortid';
import { workers } from '../../workers';
import { Epic } from './epic-type';

/**
 * Shape needed from a Card for aggregation — works with partial/in-memory card data.
 */
export interface CardAggregationShape {
    spentTimeInHour: { estimated: number };
    sessionIds: string[];
}

/**
 * Shape needed from a session for aggregation.
 */
export interface SessionAggregationShape {
    spentTimeInHour: number;
}

const db = workers.dbWorkers.epicPath;

export interface CreateEpicData {
    name: string;
    description?: string;
    boardId: string;
}

/**
 * Create a new epic and persist it to the database.
 */
export async function createEpic(data: CreateEpicData): Promise<Epic> {
    const now = Date.now();
    const epic: Epic = {
        _id: shortid.generate(),
        name: data.name,
        description: data.description || '',
        boardId: data.boardId,
        cardIds: [],
        status: 'active',
        createdTime: now,
        estimatedHours: 0,
        actualHours: 0,
        pomodoroCount: 0,
    };
    await db.insert(epic);
    return epic;
}

/**
 * Retrieve an epic by its _id. Returns null if not found.
 */
export async function getEpic(_id: string): Promise<Epic | null> {
    const doc = await db.findOne({ _id });
    return doc || null;
}

/**
 * Update specific fields of an existing epic.
 */
export async function updateEpic(
    _id: string,
    updates: Partial<
        Pick<
            Epic,
            | 'name'
            | 'description'
            | 'cardIds'
            | 'status'
            | 'estimatedHours'
            | 'actualHours'
            | 'pomodoroCount'
            | 'dueTime'
        >
    >
): Promise<void> {
    await db.update({ _id }, { $set: updates });
}

/**
 * Archive an epic by setting its status to 'archived'.
 */
export async function archiveEpic(_id: string): Promise<void> {
    await db.update({ _id }, { $set: { status: 'archived' } });
}

/**
 * List all epics belonging to a board.
 */
export async function listEpicsByBoard(boardId: string): Promise<Epic[]> {
    return await db.find({ boardId }, {});
}

// ── Aggregation ─────────────────────────────────────────────────────

/**
 * Pure function: compute epic cached fields from card and session data.
 *
 * Deduplicates sessionIds using a Set — critical because of the
 * over-association quirk (all cards in the focused list get every session).
 *
 * @param cardIds  IDs of cards belonging to the epic
 * @param cards    Map of cardId → card data (spentTimeInHour + sessionIds)
 * @param sessions Map of sessionId → session record (spentTimeInHour)
 * @returns Aggregated { estimatedHours, actualHours, pomodoroCount }
 */
export function computeEpicAggregates(
    cardIds: string[],
    cards: { [cardId: string]: CardAggregationShape | undefined },
    sessions: { [sessionId: string]: SessionAggregationShape | undefined }
): { estimatedHours: number; actualHours: number; pomodoroCount: number } {
    const uniqueSessionIds = new Set<string>();
    let estimatedHours = 0;

    for (const cardId of cardIds) {
        const card = cards[cardId];
        if (card) {
            estimatedHours += card.spentTimeInHour.estimated;
            if (card.sessionIds) {
                for (const sid of card.sessionIds) {
                    uniqueSessionIds.add(sid);
                }
            }
        }
    }

    let actualHours = 0;
    for (const sessionId of uniqueSessionIds) {
        const session = sessions[sessionId];
        if (session) {
            actualHours += session.spentTimeInHour;
        }
    }

    return {
        estimatedHours,
        actualHours,
        pomodoroCount: uniqueSessionIds.size,
    };
}

/**
 * Load an epic and all its related cards and sessions, recompute the
 * cached aggregate fields (estimatedHours, actualHours, pomodoroCount),
 * persist the update, and return the updated epic.
 *
 * Accepts optional getters for cards and sessions so consumers can
 * inject cached data or mocks instead of hitting the DB every time.
 *
 * @param epicId  The _id of the epic to recalculate
 * @param getters Optional override for loading cards and sessions
 * @returns The updated Epic, or null if not found
 */
export async function recalculateEpicStats(
    epicId: string,
    getters?: {
        getCard?: (cardId: string) => Promise<CardAggregationShape | null>;
        getSession?: (sessionId: string) => Promise<SessionAggregationShape | null>;
    }
): Promise<Epic | null> {
    const epic = await getEpic(epicId);
    if (!epic) return null;

    // Default getters — use the DB workers
    const getCard =
        getters?.getCard ||
        (async (cardId: string): Promise<CardAggregationShape | null> => {
            try {
                return await workers.dbWorkers.cardsDB.findOne({ _id: cardId });
            } catch {
                return null;
            }
        });

    const getSession =
        getters?.getSession ||
        (async (sessionId: string): Promise<SessionAggregationShape | null> => {
            try {
                return await workers.dbWorkers.sessionDB.findOne({ _id: sessionId });
            } catch {
                return null;
            }
        });

    // Fetch all cards
    const cards: { [cardId: string]: CardAggregationShape | undefined } = {};
    for (const cardId of epic.cardIds) {
        cards[cardId] = (await getCard(cardId)) ?? undefined;
    }

    // Collect unique session IDs from all cards
    const uniqueSessionIds = new Set<string>();
    for (const cardId of epic.cardIds) {
        const card = cards[cardId];
        if (card?.sessionIds) {
            for (const sid of card.sessionIds) {
                uniqueSessionIds.add(sid);
            }
        }
    }

    // Fetch sessions for the unique IDs
    const sessions: { [sessionId: string]: SessionAggregationShape | undefined } = {};
    for (const sessionId of uniqueSessionIds) {
        sessions[sessionId] = (await getSession(sessionId)) ?? undefined;
    }

    // Compute aggregates using the pure function
    const { estimatedHours, actualHours, pomodoroCount } = computeEpicAggregates(
        epic.cardIds,
        cards,
        sessions
    );

    // Persist
    await db.update({ _id: epicId }, { $set: { estimatedHours, actualHours, pomodoroCount } });

    return { ...epic, estimatedHours, actualHours, pomodoroCount };
}
