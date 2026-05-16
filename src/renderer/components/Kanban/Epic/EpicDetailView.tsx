import React from 'react';
import { Progress, Icon } from 'antd';
import styled from 'styled-components';
import { Epic } from '../epic-type';
import { Card } from '../type';
import { EPIC_COLORS, formatDate } from './EpicPanel';

const Container = styled.div`
    padding: 16px;
    width: 280px;
    min-width: 280px;
    background: #fff;
    border-left: 1px solid #e8e8e8;
    overflow-y: auto;
`;

const StatRow = styled.div`
    display: flex;
    justify-content: space-between;
    margin: 8px 0;
    font-size: 14px;
    line-height: 1.8;
`;

const CardItem = styled.div`
    padding: 6px 8px;
    border-bottom: 1px solid #f0f0f0;
    font-size: 13px;
    cursor: default;

    &:hover {
        background: #fafafa;
    }
`;

const SectionTitle = styled.h4`
    margin: 16px 0 8px 0;
    font-size: 14px;
    color: #333;
    border-bottom: 1px solid #f0f0f0;
    padding-bottom: 4px;
`;

interface Props {
    epic: Epic;
    cards: { [cardId: string]: Card };
    onBack: () => void;
}

export function computeProgress(estimatedHours: number, actualHours: number): number {
    if (estimatedHours <= 0) return 0;
    return Math.min(100, Math.round((actualHours / estimatedHours) * 100));
}

export function getDaysUntilDue(dueTime?: number): number | null {
    if (!dueTime) return null;
    return Math.ceil((dueTime - Date.now()) / (1000 * 60 * 60 * 24));
}

export function getDueDateLabel(daysUntilDue: number | null): string {
    if (daysUntilDue === null) return '';
    if (daysUntilDue > 0) return `${daysUntilDue} days left`;
    if (daysUntilDue === 0) return 'Today';
    return `${Math.abs(daysUntilDue)} days overdue`;
}

export const EpicDetailView: React.FC<Props> = ({ epic, cards }) => {
    const pct = computeProgress(epic.estimatedHours, epic.actualHours);
    const daysUntilDue = getDaysUntilDue(epic.dueTime);
    const dueLabel = getDueDateLabel(daysUntilDue);

    const assignedCards = epic.cardIds.map((id) => cards[id]).filter(Boolean) as Card[];

    return (
        <Container>
            <div
                style={{ cursor: 'pointer', marginBottom: 8, color: '#1890ff' }}
                onClick={() => {}}
            >
                <Icon type="arrow-left" style={{ marginRight: 4, cursor: 'pointer' }} />
            </div>

            <h3 style={{ margin: '0 0 4px 0' }}>{epic.name}</h3>
            {epic.description && (
                <p style={{ color: '#666', fontSize: 13, margin: '4px 0 12px 0' }}>
                    {epic.description}
                </p>
            )}

            <SectionTitle>Progress</SectionTitle>
            <Progress percent={pct} strokeColor={EPIC_COLORS[0]} format={() => `${pct}%`} />

            <SectionTitle>Stats</SectionTitle>
            <StatRow>
                <span>
                    <Icon type="clock-circle" style={{ marginRight: 4 }} />
                    Pomodoros
                </span>
                <strong>{epic.pomodoroCount}</strong>
            </StatRow>
            <StatRow>
                <span>Estimated Hours</span>
                <strong>{epic.estimatedHours.toFixed(1)}h</strong>
            </StatRow>
            <StatRow>
                <span>Actual Hours</span>
                <strong>{epic.actualHours.toFixed(1)}h</strong>
            </StatRow>
            {dueLabel && (
                <StatRow>
                    <span>
                        <Icon type="calendar" style={{ marginRight: 4 }} />
                        Due Date
                    </span>
                    <strong
                        style={{
                            color:
                                daysUntilDue !== null && daysUntilDue < 0
                                    ? '#f5222d'
                                    : daysUntilDue !== null && daysUntilDue <= 3
                                    ? '#fa8c16'
                                    : '#52c41a',
                        }}
                    >
                        {dueLabel}
                    </strong>
                </StatRow>
            )}

            <SectionTitle>Cards ({assignedCards.length})</SectionTitle>
            {assignedCards.length === 0 && (
                <p style={{ color: '#999' }}>No cards assigned to this epic.</p>
            )}
            {assignedCards.map((card) => (
                <CardItem key={card._id}>
                    <div>{card.title}</div>
                </CardItem>
            ))}
        </Container>
    );
};
