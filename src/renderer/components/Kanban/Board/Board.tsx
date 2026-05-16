import { DragDropContext, Droppable, DropResult } from 'react-beautiful-dnd';
import React, { FC, useState, useEffect, useCallback } from 'react';
import { BoardActionTypes, defaultBoard } from './action';
import styled from 'styled-components';
import List from '../List';
import { Button, Select, Icon } from 'antd';
import { fatScrollBar } from '../../../style/scrollbar';
import { isShallowEqualByKeys } from '../../../utils';
import { KanbanBoard } from '../type';
import { CardsState } from '../Card/action';
import { Epic } from '../epic-type';
import { listEpicsByBoard } from '../epic-db';
import { EpicCreateDialog } from '../Epic/EpicCreateDialog';
import { EpicPanel } from '../Epic/EpicPanel';
import { EpicDetailView } from '../Epic/EpicDetailView';

const { Option } = Select;

const Container = styled.div`
    height: 100%;
    width: 100%;
    overflow-x: auto;
    margin: 0;
    ${fatScrollBar}
`;

const BoardContent = styled.div`
    display: flex;
    flex-direction: row;
    height: 100%;
`;

const ListsArea = styled.div`
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    ${fatScrollBar}
`;

const ListContainer = styled.div`
    display: flex;
    flex-direction: row;
    align-content: space-around;
`;

const ListPlaceholder = styled.div`
    margin: 4px;
    max-height: 4em;
    min-width: 200px;
    border-radius: 8px;
    border: 1px dashed rgba(0, 0, 0, 0.2);
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
`;

const FilterBar = styled.div`
    padding: 4px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #f0f0f0;
    background: #fff;
`;

export interface InputProps {
    boardId: string;
    doesOnlyShowFocusedList?: boolean;
    showHeader?: boolean;
}

const usefulPropNames = Object.keys(defaultBoard).concat(['lists', 'cards', 'boardId']);
interface Props extends KanbanBoard, BoardActionTypes, InputProps {
    cards?: CardsState;
}
export const Board: FC<Props> = React.memo(
    (props: Props) => {
        const [epics, setEpics] = useState<Epic[]>([]);
        const [showCreateDialog, setShowCreateDialog] = useState(false);
        const [selectedEpicId, setSelectedEpicId] = useState<string | undefined>(undefined);
        const [epicFilterId, setEpicFilterId] = useState<string | undefined>(undefined);

        // Load epics for this board
        useEffect(() => {
            let cancelled = false;
            listEpicsByBoard(props.boardId).then((loaded) => {
                if (!cancelled) setEpics(loaded);
            });
            return () => {
                cancelled = true;
            };
        }, [props.boardId]);

        // Refresh epics after creating one
        const refreshEpics = useCallback(() => {
            listEpicsByBoard(props.boardId).then((loaded) => setEpics(loaded));
        }, [props.boardId]);

        const handleCreateEpic = useCallback(() => {
            setShowCreateDialog(true);
        }, []);

        const handleCloseCreateDialog = useCallback(() => {
            setShowCreateDialog(false);
            refreshEpics();
        }, [refreshEpics]);

        const handleSelectEpic = useCallback((epicId?: string) => {
            setSelectedEpicId(epicId);
        }, []);

        const handleFilterChange = useCallback((value: string) => {
            setEpicFilterId(value === '__all__' ? undefined : value);
        }, []);

        const handleDragEnd = ({ source, destination, type }: DropResult) => {
            if (!destination) return;
            if (type === 'COLUMN') {
                if (source.index !== destination.index) {
                    props.moveList(source.droppableId, source.index, destination.index);
                }
                return;
            }
            if (
                source.index !== destination.index ||
                source.droppableId !== destination.droppableId
            ) {
                props.moveCard(
                    source.droppableId,
                    destination.droppableId,
                    source.index,
                    destination.index
                );
            }
        };

        const addList = async () => {
            await props.addList(props._id, 'TestList');
        };

        // Build epicsMap for lookup
        const epicsMap: { [epicId: string]: Epic } = {};
        for (const epic of epics) {
            epicsMap[epic._id] = epic;
        }

        const { doesOnlyShowFocusedList = false } = props;
        let lists;
        if (doesOnlyShowFocusedList) {
            lists = (provided: any) => (
                <ListContainer ref={provided.innerRef} {...provided.droppableProps}>
                    <List
                        listId={props.focusedList}
                        index={0}
                        key={0}
                        boardId={props.boardId}
                        focused={true}
                        epicsMap={epicsMap}
                        epicFilterId={epicFilterId}
                    />
                    {provided.placeholder}
                </ListContainer>
            );
        } else {
            lists = (provided: any) => (
                <ListContainer ref={provided.innerRef}>
                    {props.lists.map((listId, index) => (
                        <List
                            listId={listId}
                            index={index}
                            key={listId}
                            boardId={props.boardId}
                            focused={listId === props.focusedList}
                            done={listId === props.doneList}
                            epicsMap={epicsMap}
                            epicFilterId={epicFilterId}
                        />
                    ))}
                    {provided.placeholder}
                    <ListPlaceholder>
                        <Button onClick={addList} icon={'plus'} shape="circle-outline" />
                    </ListPlaceholder>
                </ListContainer>
            );
        }

        const selectedEpic = selectedEpicId ? epicsMap[selectedEpicId] : undefined;

        return (
            <Container>
                <FilterBar>
                    <span style={{ fontSize: 13, color: '#666' }}>Filter by Epic:</span>
                    <Select
                        value={epicFilterId || '__all__'}
                        onChange={handleFilterChange}
                        style={{ width: 180 }}
                        size="small"
                    >
                        <Option value="__all__">All Epics</Option>
                        {epics.map((epic) => (
                            <Option key={epic._id} value={epic._id}>
                                {epic.name}
                            </Option>
                        ))}
                    </Select>
                </FilterBar>
                <BoardContent>
                    <ListsArea>
                        <DragDropContext onDragEnd={handleDragEnd}>
                            <Droppable droppableId={props._id} type="COLUMN" direction="horizontal">
                                {lists}
                            </Droppable>
                        </DragDropContext>
                    </ListsArea>
                    {selectedEpic ? (
                        <EpicDetailView
                            epic={selectedEpic}
                            cards={props.cards || {}}
                            onBack={() => setSelectedEpicId(undefined)}
                        />
                    ) : (
                        <EpicPanel
                            boardId={props.boardId}
                            epics={epics}
                            onSelectEpic={handleSelectEpic}
                            selectedEpicId={selectedEpicId}
                            onCreateEpic={handleCreateEpic}
                        />
                    )}
                </BoardContent>
                <EpicCreateDialog
                    visible={showCreateDialog}
                    onClose={handleCloseCreateDialog}
                    boardId={props.boardId}
                />
            </Container>
        );
    },
    (prevProps, nextProps) => {
        return isShallowEqualByKeys(prevProps, nextProps, usefulPropNames);
    }
);
