export interface Epic {
    _id: string;
    name: string;
    description: string;
    boardId: string;
    cardIds: string[];
    status: 'active' | 'completed' | 'archived';
    createdTime: number;
    dueTime?: number;
    estimatedHours: number; // cached computed
    actualHours: number; // cached computed
    pomodoroCount: number; // cached computed
}
