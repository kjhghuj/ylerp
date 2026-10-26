import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ToastProvider, useToast } from '../components/Toast';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(() => 1), error: vi.fn(() => 2), info: vi.fn(() => 3), dismiss: vi.fn() },
  Toaster: () => <div data-testid="toaster" />,
}));

it('preserves showToast defaults, explicit severity/duration and cleans owned notifications', async () => {
  function Consumer() {
    const { showToast } = useToast();
    return <><button onClick={() => showToast('Saved')}>Save</button><button onClick={() => showToast('Failed', 'error', 9000)}>Fail</button><button onClick={() => showToast('Working', 'info')}>Info</button></>;
  }
  const { unmount } = render(<ToastProvider><Consumer /></ToastProvider>);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(toast.success).toHaveBeenCalledWith('Saved', expect.objectContaining({ duration: 3000 }));
  await userEvent.click(screen.getByRole('button', { name: 'Fail' }));
  expect(toast.error).toHaveBeenCalledWith('Failed', expect.objectContaining({ duration: 9000 }));
  await userEvent.click(screen.getByRole('button', { name: 'Info' }));
  expect(toast.info).toHaveBeenCalledWith('Working', expect.objectContaining({ duration: 3000 }));
  unmount();
  expect(toast.dismiss).toHaveBeenCalledWith(1);
  expect(toast.dismiss).toHaveBeenCalledWith(2);
  expect(toast.dismiss).toHaveBeenCalledWith(3);
});
