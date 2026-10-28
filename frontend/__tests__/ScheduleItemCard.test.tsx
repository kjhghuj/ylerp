import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ItemCard } from '../modules/schedule/ItemCard';
import type { ScheduleItemData } from '../modules/schedule/constants';

const baseItem: ScheduleItemData = {
  id: 'schedule-1',
  type: 'approval',
  title: 'Review supplier quote',
  description: 'Check pricing before approval',
  completed: false,
  sortKey: 1,
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
};

const renderCard = (overrides: Partial<React.ComponentProps<typeof ItemCard>> = {}) => {
  const props: React.ComponentProps<typeof ItemCard> = {
    item: baseItem,
    dragId: null,
    dragOverId: null,
    flyingItemId: null,
    progress: 0,
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    onDoubleClick: vi.fn(),
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
    onDragEnd: vi.fn(),
    onPointerDown: vi.fn(),
    onPointerUp: vi.fn(),
    ...overrides,
  };

  render(<ItemCard {...props} />);
  return props;
};

describe('Schedule ItemCard', () => {
  it('lets the delete button be clicked without starting card long-press handling', () => {
    const onDelete = vi.fn();
    const onPointerDown = vi.fn();
    renderCard({ onDelete, onPointerDown });

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.pointerDown(deleteButton);
    fireEvent.click(deleteButton);

    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledWith('schedule-1');
  });

  it('offers explicit keyboard actions without starting the card long press', () => {
    const props = renderCard();
    const edit = screen.getByRole('button', { name: 'Edit Review supplier quote' });
    fireEvent.pointerDown(edit);
    fireEvent.click(edit);
    expect(props.onPointerDown).not.toHaveBeenCalled();
    expect(props.onDoubleClick).toHaveBeenCalledWith(baseItem);
    const complete = screen.getByRole('button', { name: 'Complete Review supplier quote' });
    fireEvent.pointerDown(complete);
    fireEvent.click(complete);
    expect(props.onToggle).toHaveBeenCalledWith(baseItem);
    expect(props.onPointerDown).not.toHaveBeenCalled();
  });
});
