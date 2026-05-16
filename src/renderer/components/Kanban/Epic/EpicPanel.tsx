import React, { useState } from 'react';
import { Button, Progress, Tag, Icon } from 'antd';
import styled from 'styled-components';
import { Epic } from '../epic-type';

const PanelContainer = styled.div<{ collapsed: boolean }>`
    width: ${(p) => (p.collapsed ? '40px' : '280px')};
    min-width: ${(p) => (p.collapsed ? '40px' : '280px')};
    background: #fff;
    border-left: 1px solid #e8e8e8;
    padding: ${(p) => (p.collapsed ? '8px' : '12px')};
    overflow-y: auto;
    transition: width 0.2s;
`;

const PanelHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
`;

const EpicCard = styled.div<{ selected?: boolean }>`
    padding: 8px 12px;
    margin-bottom: 8px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid ${(p) => (p.selected ? '#1890ff' : '#e8e8e8')};
    background: ${(p) => (p.selected ? '#e6f7ff' : '#fff')};
    transition: all 0.2s;

    &:hover {
        border-color: #1890ff;
    }
`;

const EpicName = styled.div`
    font-weight: 500;
    font-size: 14px;
    margin-bottom: 4px;
`;

const EpicMeta = styled.div`
    font-size: 12px;
    color: #888;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
`;

export const EPIC_COLORS = [
    '#1890ff',
    '#52c41a',
    '#fa8c16',
    '#eb2f96',
    '#722ed1',
    '#13c2c2',
    '#f5222d',
    '#faad14',
];

export function getEpicColor(index: number): string {
    return EPIC_COLORS[index % EPIC_COLORS.length];
}

export function formatDate(ts?: number): string {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface Props {
    boardId: string;
    epics: Epic[];
    onSelectEpic: (epicId?: string) => void;
    selectedEpicId?: string;
    onCreateEpic: () => void;
}

export const EpicPanel: React.FC<Props> = ({
    epics,
    onSelectEpic,
    selectedEpicId,
    onCreateEpic,
}) => {
    const [collapsed, setCollapsed] = useState(false);

    if (collapsed) {
        return (
            <PanelContainer collapsed={true}>
                <Button
                    type="default"
                    icon="right-circle"
                    onClick={() => setCollapsed(false)}
                    title="Expand Epics"
                    style={{ padding: 0, width: 24, height: 24 }}
                />
            </PanelContainer>
        );
    }

    return (
        <PanelContainer collapsed={false}>
            <PanelHeader>
                <strong>Epics</strong>
                <div>
                    <Button
                        size="small"
                        icon="minus"
                        onClick={() => setCollapsed(true)}
                        style={{ marginRight: 4 }}
                    />
                    <Button size="small" type="primary" icon="plus" onClick={onCreateEpic}>
                        Create Epic
                    </Button>
                </div>
            </PanelHeader>
            {epics.length === 0 && (
                <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>
                    No epics yet. Create one!
                </div>
            )}
            {epics.map((epic, index) => {
                const pct =
                    epic.estimatedHours > 0
                        ? Math.min(100, Math.round((epic.actualHours / epic.estimatedHours) * 100))
                        : 0;
                const color = getEpicColor(index);

                return (
                    <EpicCard
                        key={epic._id}
                        selected={epic._id === selectedEpicId}
                        onClick={() =>
                            onSelectEpic(epic._id === selectedEpicId ? undefined : epic._id)
                        }
                    >
                        <EpicName>
                            <Tag color={color} style={{ marginRight: 4 }}>
                                {epic.name}
                            </Tag>
                        </EpicName>
                        <Progress
                            percent={pct}
                            size="small"
                            strokeColor={color}
                            format={() => `${epic.pomodoroCount} pomodoros`}
                        />
                        <EpicMeta>
                            <span>
                                <Icon type="clock-circle" style={{ marginRight: 2 }} />
                                {epic.pomodoroCount} pomodoros
                            </span>
                            {epic.dueTime && (
                                <span>
                                    <Icon type="calendar" style={{ marginRight: 2 }} />
                                    Due: {formatDate(epic.dueTime)}
                                </span>
                            )}
                        </EpicMeta>
                    </EpicCard>
                );
            })}
        </PanelContainer>
    );
};
