import React, { useState } from 'react';
import { DatePicker, Modal, Input, Button } from 'antd';
import { createEpic, updateEpic } from '../epic-db';

interface Props {
    visible: boolean;
    onClose: () => void;
    boardId: string;
}

export const EpicCreateDialog: React.FC<Props> = ({ visible, onClose, boardId }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [dueTime, setDueTime] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const handleOk = async () => {
        if (!name.trim()) {
            alert('Please input the epic name!');
            return;
        }
        setLoading(true);
        try {
            const epic = await createEpic({
                name: name.trim(),
                description: description.trim(),
                boardId,
            });
            if (dueTime) {
                await updateEpic(epic._id, { dueTime: dueTime.valueOf() });
            }
            // Reset
            setName('');
            setDescription('');
            setDueTime(null);
            onClose();
        } catch (err) {
            console.error('Error creating epic:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        setName('');
        setDescription('');
        setDueTime(null);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            title="Create Epic"
            okText="Create"
            onCancel={handleCancel}
            onOk={handleOk}
            confirmLoading={loading}
            destroyOnClose={true}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>Name *</div>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Epic name"
                        autoFocus={true}
                    />
                </div>
                <div>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>Description</div>
                    <Input.TextArea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Description (optional)"
                        rows={3}
                    />
                </div>
                <div>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>Due Date</div>
                    <DatePicker
                        style={{ width: '100%' }}
                        value={dueTime}
                        onChange={(date) => setDueTime(date)}
                        placeholder="Select due date (optional)"
                    />
                </div>
            </div>
        </Modal>
    );
};
