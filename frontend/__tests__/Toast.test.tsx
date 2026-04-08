import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../components/Toast';
import React from 'react';

vi.useFakeTimers();

const TestChild: React.FC = () => {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast('success message', 'success')}>Success</button>
      <button onClick={() => showToast('error message', 'error')}>Error</button>
      <button onClick={() => showToast('info message', 'info')}>Info</button>
      <button onClick={() => showToast('custom duration', 'success', 1000)}>Custom Duration</button>
    </div>
  );
};

const renderWithToast = () => {
  return render(
    <ToastProvider>
      <TestChild />
    </ToastProvider>
  );
};

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render children', () => {
    renderWithToast();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('should show a success toast when triggered', () => {
    renderWithToast();
    act(() => {
      screen.getByText('Success').click();
    });
    expect(screen.getByText('success message')).toBeInTheDocument();
  });

  it('should show an error toast with correct styling', () => {
    renderWithToast();
    act(() => {
      screen.getByText('Error').click();
    });
    const toast = screen.getByText('error message').closest('div');
    expect(toast).toHaveClass('bg-red-50', 'border-red-200', 'text-red-700');
  });

  it('should show an info toast with correct styling', () => {
    renderWithToast();
    act(() => {
      screen.getByText('Info').click();
    });
    const toast = screen.getByText('info message').closest('div');
    expect(toast).toHaveClass('bg-blue-50', 'border-blue-200', 'text-blue-700');
  });

  it('should auto-dismiss toast after duration (closing animation)', () => {
    renderWithToast();
    act(() => {
      screen.getByText('Success').click();
    });
    expect(screen.getByText('success message')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const toastEl = screen.getByText('success message').closest('div');
    expect(toastEl).toHaveClass('opacity-0', 'translate-x-8', 'scale-95');
  });

  it('should remove toast after closing animation completes', () => {
    renderWithToast();
    act(() => {
      screen.getByText('Success').click();
    });

    act(() => {
      vi.advanceTimersByTime(3000 + 300);
    });

    expect(screen.queryByText('success message')).not.toBeInTheDocument();
  });

  it('should respect custom duration', () => {
    renderWithToast();
    act(() => {
      screen.getByText('Custom Duration').click();
    });

    act(() => {
      vi.advanceTimersByTime(999);
    });

    expect(screen.getByText('custom duration')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    const toastEl = screen.getByText('custom duration').closest('div');
    expect(toastEl).toHaveClass('opacity-0');
  });

  it('should show multiple toasts simultaneously', () => {
    renderWithToast();
    act(() => {
      screen.getByText('Success').click();
      screen.getByText('Error').click();
    });
    expect(screen.getByText('success message')).toBeInTheDocument();
    expect(screen.getByText('error message')).toBeInTheDocument();
  });
});
