import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '../components/Toast';
import React from 'react';

const TestChild: React.FC = () => {
  const { showToast } = useToast();
  return <div>
    <button onClick={() => showToast('success message')}>Success</button>
    <button onClick={() => showToast('error message', 'error')}>Error</button>
    <button onClick={() => showToast('info message', 'info')}>Info</button>
    <button onClick={() => showToast('custom duration', 'success', 1000)}>Custom Duration</button>
  </div>;
};

const renderWithToast = () => render(<ToastProvider><TestChild /></ToastProvider>);
const trigger = async (label: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }));
    // Sonner batches its external-store subscription on the next timer tick.
    await vi.advanceTimersByTimeAsync(0);
  });
};
const advance = async (milliseconds: number) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
};

describe('Toast', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(async () => {
    cleanup();
    await advance(5000);
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders its children', () => {
    renderWithToast();
    expect(screen.getByRole('button', { name: 'Success' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Error' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Info' })).toBeInTheDocument();
  });

  it('shows a success toast by default', async () => {
    renderWithToast();
    await trigger('Success');
    expect(screen.getByText('success message')).toBeVisible();
    expect(screen.getByText('success message').closest('[data-sonner-toast]')).toHaveAttribute('data-type', 'success');
  });

  it('preserves error severity', async () => {
    renderWithToast();
    await trigger('Error');
    expect(screen.getByText('error message')).toBeVisible();
    expect(screen.getByText('error message').closest('[data-sonner-toast]')).toHaveAttribute('data-type', 'error');
  });

  it('preserves info severity', async () => {
    renderWithToast();
    await trigger('Info');
    expect(screen.getByText('info message')).toBeVisible();
    expect(screen.getByText('info message').closest('[data-sonner-toast]')).toHaveAttribute('data-type', 'info');
  });

  it('keeps the default notification visible until its configured duration', async () => {
    renderWithToast();
    await trigger('Success');
    await advance(2999);
    expect(screen.getByText('success message')).toBeVisible();
  });

  it('removes an expired default notification after its exit transition', async () => {
    renderWithToast();
    await trigger('Success');
    await advance(3000);
    await advance(500);
    expect(screen.queryByText('success message')).not.toBeInTheDocument();
  });

  it('respects custom duration without changing the default duration', async () => {
    renderWithToast();
    await trigger('Success');
    await trigger('Custom Duration');
    await advance(999);
    expect(screen.getByText('custom duration')).toBeVisible();
    await advance(1);
    await advance(500);
    expect(screen.queryByText('custom duration')).not.toBeInTheDocument();
    expect(screen.getByText('success message')).toBeVisible();
  });

  it('shows multiple notifications simultaneously', async () => {
    renderWithToast();
    await trigger('Success');
    await trigger('Error');
    expect(screen.getByText('success message')).toBeVisible();
    expect(screen.getByText('error message')).toBeVisible();
  });
});
