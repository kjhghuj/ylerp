import React, { useRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../components/ui/sheet';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '../components/ui/alert-dialog';

const variants = [
  { name: 'Dialog', Root: Dialog, Content: DialogContent, Title: DialogTitle, Description: DialogDescription },
  { name: 'Sheet', Root: Sheet, Content: SheetContent, Title: SheetTitle, Description: SheetDescription },
  { name: 'AlertDialog', Root: AlertDialog, Content: AlertDialogContent, Title: AlertDialogTitle, Description: AlertDialogDescription },
] as const;

describe.each(variants)('$name controlled focus without Trigger', ({ name, Root, Content, Title, Description }) => {
  function Harness({ custom = false, customOpenOnly = false }: { custom?: boolean; customOpenOnly?: boolean }) {
    const [open, setOpen] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const destination = useRef<HTMLButtonElement>(null);
    return <>
      <Button onClick={() => setOpen(true)}>First opener</Button>
      <Button onClick={() => setOpen(true)}>Second opener</Button>
      <Button ref={destination}>Custom destination</Button>
      <Root open={open} onOpenChange={setOpen}>
        <Content onOpenAutoFocus={custom || customOpenOnly ? event => { event.preventDefault(); input.current?.focus(); } : undefined}
          onCloseAutoFocus={custom ? event => { event.preventDefault(); destination.current?.focus(); } : undefined}>
          <Title>Controlled editor</Title><Description>Change this record</Description>
          <input ref={input} aria-label="Editor input" />
          {name === 'AlertDialog' ? <AlertDialogCancel>Dismiss</AlertDialogCancel> : <Button onClick={() => setOpen(false)}>Dismiss</Button>}
        </Content>
      </Root>
    </>;
  }

  it('returns focus after Escape to the active control that opened it', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'First opener' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('captures the latest opener on every opening while the wrapper remains mounted', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'First opener' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    const second = screen.getByRole('button', { name: 'Second opener' });
    await userEvent.click(second);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(second).toHaveFocus());
  });

  it('honors explicit open and close focus handlers with preventDefault', async () => {
    render(<Harness custom />);
    await userEvent.click(screen.getByRole('button', { name: 'First opener' }));
    await waitFor(() => expect(screen.getByLabelText('Editor input')).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Custom destination' })).toHaveFocus());
  });

  it('captures the opener before a custom initial-focus handler moves focus into the dialog', async () => {
    render(<Harness customOpenOnly />);
    const opener = screen.getByRole('button', { name: 'First opener' });
    await userEvent.click(opener);
    await waitFor(() => expect(screen.getByLabelText('Editor input')).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

it('restores only the upper controlled dialog then the parent opener', async () => {
  function Nested() {
    const [parent, setParent] = useState(false);
    const [child, setChild] = useState(false);
    return <><Button onClick={() => setParent(true)}>Open parent</Button><Dialog open={parent} onOpenChange={setParent}><DialogContent><DialogTitle>Parent editor</DialogTitle><DialogDescription>Parent</DialogDescription><Button onClick={() => setChild(true)}>Open child</Button><Dialog open={child} onOpenChange={setChild}><DialogContent><DialogTitle>Child editor</DialogTitle><DialogDescription>Child</DialogDescription><Button>Child action</Button></DialogContent></Dialog></DialogContent></Dialog></>;
  }
  render(<Nested />);
  const parentOpener = screen.getByRole('button', { name: 'Open parent' });
  await userEvent.click(parentOpener);
  await userEvent.click(screen.getByRole('button', { name: 'Open child' }));
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Child editor' })).not.toBeInTheDocument());
  expect(screen.getByRole('dialog', { name: 'Parent editor' })).toBeVisible();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open child' })).toHaveFocus());
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(parentOpener).toHaveFocus());
});

it('preserves the clicked outside control for a non-modal dialog', async () => {
  function NonModal() {
    const [open, setOpen] = useState(false);
    return <><Button onClick={() => setOpen(true)}>Open non-modal</Button><Button>Outside action</Button><Dialog modal={false} open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Non-modal editor</DialogTitle><DialogDescription>Other controls remain usable</DialogDescription><Button>Inside action</Button></DialogContent></Dialog></>;
  }
  render(<NonModal />);
  await userEvent.click(screen.getByRole('button', { name: 'Open non-modal' }));
  const outside = screen.getByRole('button', { name: 'Outside action' });
  await userEvent.click(outside);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(outside).toHaveFocus();
});

it('does not try to focus an opener removed by a successful action', async () => {
  function RemovedOpener() {
    const [open, setOpen] = useState(false);
    const [showOpener, setShowOpener] = useState(true);
    return <>{showOpener && <Button onClick={() => setOpen(true)}>Edit removable row</Button>}<Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Remove row</DialogTitle><DialogDescription>The row will disappear</DialogDescription><Button onClick={() => { setShowOpener(false); setOpen(false); }}>Remove row</Button></DialogContent></Dialog></>;
  }
  render(<RemovedOpener />);
  const opener = screen.getByRole('button', { name: 'Edit removable row' });
  await userEvent.click(opener);
  const focus = vi.spyOn(opener, 'focus');
  await userEvent.click(screen.getByRole('button', { name: 'Remove row' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(opener.isConnected).toBe(false);
  expect(focus).not.toHaveBeenCalled();
});
