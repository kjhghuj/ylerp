import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ALL_PERMISSIONS, getAllPermissionKeys, PermissionTree } from '../components/PermissionTree';

it('keeps select-all, module and child permissions synchronized through real checkboxes', async () => {
  const changed = vi.fn();
  function Harness() {
    const [selected, setSelected] = useState<string[]>([]);
    return <PermissionTree selected={selected} onChange={next => { changed(next); setSelected(next); }} />;
  }
  render(<Harness />);
  await userEvent.click(screen.getByRole('checkbox', { name: '全部功能模块' }));
  expect(changed).toHaveBeenLastCalledWith(getAllPermissionKeys());
  await userEvent.click(screen.getByRole('checkbox', { name: ALL_PERMISSIONS[0].label }));
  const expected = getAllPermissionKeys().filter(key => key !== ALL_PERMISSIONS[0].key && !ALL_PERMISSIONS[0].children?.some(child => child.key === key));
  expect(changed).toHaveBeenLastCalledWith(expected);
  expect(screen.getByRole('checkbox', { name: '全部功能模块' })).toBePartiallyChecked();
  await userEvent.click(screen.getByRole('checkbox', { name: ALL_PERMISSIONS[0].children![0].label }));
  expect(changed.mock.calls.at(-1)?.[0]).toEqual([...expected, ALL_PERMISSIONS[0].children![0].key]);
  expect(changed.mock.calls.at(-1)?.[0]).not.toContain(ALL_PERMISSIONS[0].key);
  expect(changed.mock.calls.at(-1)?.[0]).toContain(ALL_PERMISSIONS[0].children![0].key);
});

it('allows readonly expansion but never changes disabled permissions', async () => {
  const changed = vi.fn();
  render(<PermissionTree selected={[]} onChange={changed} disabled />);
  expect(screen.getByRole('checkbox', { name: '全部功能模块' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: `收起${ALL_PERMISSIONS[0].label}` }));
  expect(screen.queryByRole('checkbox', { name: ALL_PERMISSIONS[0].children![0].label })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: `展开${ALL_PERMISSIONS[0].label}` }));
  expect(screen.getByRole('checkbox', { name: ALL_PERMISSIONS[0].children![0].label })).toBeDisabled();
  expect(changed).not.toHaveBeenCalled();
});



