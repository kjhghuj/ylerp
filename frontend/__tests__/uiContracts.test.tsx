import React, { createRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { NativeSelect } from '../components/ui/native-select';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableRow } from '../components/ui/table';
import { UIThemeScope } from '../components/ui/theme-scope';

describe('shared UI behavior contracts', () => {
  it('keeps the existing scroll ancestor when a sticky table opts out of wrapping', () => {
    render(<section data-testid="scroll-owner"><Table wrapped={false}><TableBody><TableRow><TableCell>SKU</TableCell></TableRow></TableBody></Table></section>);
    expect(screen.getByRole('table').parentElement).toBe(screen.getByTestId('scroll-owner'));
  });

  it('mounts overlays in the body theme host rather than a clipped module', async () => {
    render(<UIThemeScope variables={{ '--ui-primary': '221 83% 53%' }}><section data-testid="module"><Dialog><DialogTrigger asChild><Button>Open themed editor</Button></DialogTrigger><DialogContent><DialogTitle>Themed editor</DialogTitle><DialogDescription>The module color applies here</DialogDescription></DialogContent></Dialog></section></UIThemeScope>);
    await userEvent.click(screen.getByRole('button', { name: 'Open themed editor' }));
    const dialog = screen.getByRole('dialog', { name: 'Themed editor' });
    expect(dialog.closest('[data-ui-theme-portal]')).toHaveStyle('--ui-primary: 221 83% 53%');
    expect(dialog.closest('[data-ui-theme-portal]')?.parentElement).toBe(document.body);
    expect(screen.getByTestId('module')).not.toContainElement(dialog);
  });

  it('does not submit by default and preserves explicit submit buttons', async () => {
    const submitted = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(<form onSubmit={submitted}><Button>Preview</Button><Button type="submit">Save</Button></form>);
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(submitted).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it('forwards input refs and preserves intermediate decimal text', () => {
    const ref = createRef<HTMLInputElement>();
    const changed = vi.fn();
    render(<Input ref={ref} aria-label="Amount" name="amount" inputMode="decimal" onChange={changed} />);
    ref.current?.focus();
    expect(screen.getByLabelText('Amount')).toHaveFocus();
    fireEvent.change(ref.current!, { target: { value: '1.' } });
    expect(ref.current?.value).toBe('1.');
    expect(changed).toHaveBeenCalledOnce();
  });

  it('preserves native select event semantics and an empty option', () => {
    const changed = vi.fn();
    render(<NativeSelect aria-label="Site" name="site" defaultValue="" onChange={changed}><option value="">All</option><option value="SG">Singapore</option></NativeSelect>);
    fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'SG' } });
    expect(changed.mock.calls[0][0].target.name).toBe('site');
    expect(changed.mock.calls[0][0].target.value).toBe('SG');
  });

  it('closes only the upper dialog and restores focus to its trigger', async () => {
    function NestedDialogs() {
      const [upperOpen, setUpperOpen] = useState(false);
      return <Dialog><DialogTrigger asChild><Button>Open editor</Button></DialogTrigger><DialogContent><DialogTitle>Editor</DialogTitle><DialogDescription>Edit the record</DialogDescription><Dialog open={upperOpen} onOpenChange={setUpperOpen}><DialogTrigger asChild><Button>Open confirmation</Button></DialogTrigger><DialogContent><DialogTitle>Confirm</DialogTitle><DialogDescription>Confirm the edit</DialogDescription><Button>Confirm edit</Button></DialogContent></Dialog></DialogContent></Dialog>;
    }
    render(<NestedDialogs />);
    await userEvent.click(screen.getByRole('button', { name: 'Open editor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open confirmation' }));
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirm' })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Editor' })).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open confirmation' })).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open editor' })).toHaveFocus());
  });
});
