import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CandidatePicker } from '../modules/restock/components/CandidatePicker';
import type { RankedRestockTargetSku } from '../modules/restock/utils/restockTargetSku';

// jsdom lacks pointer capture and layout scrolling used by the real Radix list.
const platformMethods = ['hasPointerCapture', 'releasePointerCapture', 'scrollIntoView'] as const;
const descriptors = platformMethods.map(key => Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
beforeAll(() => {
  platformMethods.forEach(key => {
    if (!HTMLElement.prototype[key]) Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value: key === 'hasPointerCapture' ? () => false : () => undefined });
  });
});
afterAll(() => {
  platformMethods.forEach((key, index) => {
    if (descriptors[index]) Object.defineProperty(HTMLElement.prototype, key, descriptors[index]!);
    else Reflect.deleteProperty(HTMLElement.prototype, key);
  });
});

const candidate = (id: string, sku: string, matchPercentage?: number): RankedRestockTargetSku => ({ id, sku, matchPercentage });

describe('CandidatePicker display resolution', () => {
  it('shows the exact-ranked candidate when only selectedSku is provided (regression gap)', () => {
    const candidates = [candidate('a', 'SKU-A', 92), candidate('b', 'SKU-B', 40)];
    render(<CandidatePicker itemId="row1" candidates={candidates} selectedSku="SKU-A" onChange={() => {}} />);
    const trigger = screen.getByTestId('target-sku-select-row1');
    expect(trigger).toHaveTextContent('SKU-A');
    expect(trigger).toHaveTextContent('92%');
  });

  it('matches loosely by trimmed case-insensitive sku and emits candidate skus verbatim', async () => {
    const changed = vi.fn();
    const candidates = [candidate('a', 'sku-a', 80), candidate('b', 'sku-b', 60)];
    render(<CandidatePicker itemId="row2" candidates={candidates} selectedSku="  SKU-A  " onChange={changed} />);
    const trigger = screen.getByTestId('target-sku-select-row2');
    // The loose match renders the current ranking's original sku, not the raw input.
    expect(trigger).toHaveTextContent('sku-a');
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('option', { name: /sku-b60%/ }));
    expect(changed).toHaveBeenCalledExactlyOnceWith('sku-b');
  });

  it('keeps an unmatched selectedSku visible as unavailable instead of clearing it', () => {
    render(<CandidatePicker itemId="row3" candidates={[candidate('a', 'SKU-A')]} selectedSku="SKU-GONE" onChange={() => {}} />);
    expect(screen.getByTestId('target-sku-select-row3')).toHaveTextContent('SKU-GONE');
  });

  it('ignores a stale selectedCandidate that no longer exists in the ranking', () => {
    const candidates = [candidate('a', 'SKU-A', 90)];
    render(
      <CandidatePicker
        itemId="row4"
        candidates={candidates}
        selectedSku="SKU-A"
        selectedCandidate={candidate('ghost', 'SKU-Z', 12)}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByTestId('target-sku-select-row4');
    expect(trigger).toHaveTextContent('SKU-A');
    expect(trigger).toHaveTextContent('90%');
  });
});

describe('CandidatePicker duplicate identities', () => {
  it('collapses identical (id, sku) pairs to one option while keeping distinct ids or skus', async () => {
    const candidates = [
      candidate('a', 'SKU-A', 90),
      candidate('a', 'SKU-A', 90),
      candidate('a', 'SKU-B', 70),
      candidate('b', 'SKU-A', 60),
    ];
    render(<CandidatePicker itemId="row5" candidates={candidates} selectedSku="" onChange={() => {}} />);
    await userEvent.click(screen.getByTestId('target-sku-select-row5'));
    const options = screen.getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual(['SKU-A90%', 'SKU-B70%', 'SKU-A60%']);
  });

  it('handles skus containing quotes and colons and emits them verbatim', async () => {
    const changed = vi.fn();
    const tricky = candidate('id:1', 'SKU:"A":v:2', 88);
    render(<CandidatePicker itemId="row6" candidates={[tricky]} selectedSku="" onChange={changed} />);
    await userEvent.click(screen.getByTestId('target-sku-select-row6'));
    await userEvent.click(screen.getByRole('option', { name: /SKU:"A":v:2\s*88%/ }));
    expect(changed).toHaveBeenCalledExactlyOnceWith('SKU:"A":v:2');
  });

  it('disables blank-sku candidates with zero callbacks', async () => {
    const changed = vi.fn();
    const candidates = [candidate('blank', '   '), candidate('ok', 'SKU-OK')];
    render(<CandidatePicker itemId="row7" candidates={candidates} selectedSku="" onChange={changed} />);
    await userEvent.click(screen.getByTestId('target-sku-select-row7'));
    await userEvent.click(screen.getByRole('option', { name: /无效候选/ })).catch(() => undefined);
    expect(changed).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('option', { name: 'SKU-OK' }));
    expect(changed).toHaveBeenCalledExactlyOnceWith('SKU-OK');
  });
});

describe('CandidatePicker list dynamics', () => {
  it('restores an unknown selection once its candidate arrives, without callbacks', async () => {
    const changed = vi.fn();
    function Harness() {
      const [candidates, setCandidates] = useState<RankedRestockTargetSku[]>([candidate('a', 'SKU-A')]);
      return (
        <div>
          <CandidatePicker itemId="row8" candidates={candidates} selectedSku="SKU-LATER" onChange={changed} />
          <button type="button" onClick={() => setCandidates(previous => [...previous, candidate('later', 'SKU-LATER', 77)])}>补全</button>
        </div>
      );
    }
    render(<Harness />);
    const trigger = screen.getByTestId('target-sku-select-row8');
    expect(trigger).toHaveTextContent('SKU-LATER');
    await userEvent.click(screen.getByRole('button', { name: '补全' }));
    expect(trigger).toHaveTextContent('SKU-LATER');
    expect(trigger).toHaveTextContent('77%');
    expect(changed).not.toHaveBeenCalled();
  });

  it('keeps an empty list openable with a non-selectable explanation', async () => {
    const changed = vi.fn();
    render(<CandidatePicker itemId="row9" candidates={[]} selectedSku="" onChange={changed} />);
    const trigger = screen.getByTestId('target-sku-select-row9');
    expect(trigger).toHaveTextContent('选择本地 SKU');
    await userEvent.click(trigger);
    expect(screen.getByText('没有符合的 SKU')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });

  it('releases focus back to the trigger after Escape', async () => {
    render(<CandidatePicker itemId="row10" candidates={[candidate('a', 'SKU-A')]} selectedSku="" onChange={() => {}} />);
    const trigger = screen.getByTestId('target-sku-select-row10');
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
