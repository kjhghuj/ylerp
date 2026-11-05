import React, { useMemo } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import type { RankedRestockTargetSku } from '../utils/restockTargetSku';

/** 补货V2 / V3 共用：SKU 忽略大小写与首尾空格的相等比较 */
export const sameSku = (
  left: string | null | undefined,
  right: string | null | undefined,
) =>
  String(left || '')
    .trim()
    .toUpperCase() ===
  String(right || '')
    .trim()
    .toUpperCase();

const percentageStyle = (percentage: number) =>
  percentage === 100
    ? 'bg-success-subtle text-success ring-success/20'
    : percentage >= 80
      ? 'bg-accent text-accent-foreground ring-primary/20'
      : 'bg-muted text-muted-foreground ring-border';

interface CandidatePickerProps {
  itemId: string;
  candidates: RankedRestockTargetSku[];
  selectedSku: string;
  selectedCandidate?: RankedRestockTargetSku;
  onChange: (sku: string) => void;
}

// Candidate identities are (id, sku) JSON tuples — ids are not guaranteed
// unique upstream, so neither id nor sku alone can key an option. The c:/u:
// namespaces never collide with real content because decoding requires the
// exact prefix plus a valid tuple.
const CANDIDATE_PREFIX = 'c:';
const UNKNOWN_PREFIX = 'u:';
const pairKey = (id: string, sku: string) => JSON.stringify([id, sku]);
const isBlankSku = (value: string) => !value.trim();

/**
 * 补货V2 / V3 共用：本地 SKU 候选下拉。
 *
 * 视图算法（全局选择迁移计划 X01）：
 * - 外部 `selectedSku` 是唯一权威；组件不保存第二份已选状态。
 * - 同 (id, sku) 的重复候选只在视图折叠为第一个，不改外部候选、排名或分数。
 * - 选择回调只回传候选的原始 sku；sameSku 仅用于匹配展示。
 */
export const CandidatePicker: React.FC<CandidatePickerProps> = ({
  itemId,
  candidates,
  selectedSku,
  selectedCandidate,
  onChange,
}) => {
  const { viewCandidates, candidateByPair } = useMemo(() => {
    const byPair = new Map<string, RankedRestockTargetSku>();
    const view: RankedRestockTargetSku[] = [];
    for (const item of candidates) {
      const key = pairKey(item.id, item.sku);
      if (!byPair.has(key)) {
        byPair.set(key, item);
        view.push(item);
      }
    }
    return { viewCandidates: view, candidateByPair: byPair };
  }, [candidates]);

  // Display resolution: the external selectedCandidate wins only when it is
  // still present verbatim and matches selectedSku under sameSku; otherwise
  // an exact sku match, then the first loose (trimmed, case-insensitive)
  // match in ranking order. Unknown values stay visible as unavailable.
  const displayCandidate = useMemo(() => {
    if (!selectedSku) return null;
    if (selectedCandidate) {
      const stillPresent = candidates.some(
        item => item.id === selectedCandidate.id && item.sku === selectedCandidate.sku,
      );
      if (stillPresent && sameSku(selectedCandidate.sku, selectedSku)) return selectedCandidate;
    }
    return (
      candidates.find(item => item.sku === selectedSku) ??
      candidates.find(item => sameSku(item.sku, selectedSku)) ??
      null
    );
  }, [candidates, selectedCandidate, selectedSku]);

  const unknownSelected = !displayCandidate && !isBlankSku(selectedSku);
  const rootValue = displayCandidate
    ? CANDIDATE_PREFIX + pairKey(displayCandidate.id, displayCandidate.sku)
    : unknownSelected
      ? UNKNOWN_PREFIX + JSON.stringify(selectedSku)
      : '';

  const handleValueChange = (raw: string) => {
    if (!raw.startsWith(CANDIDATE_PREFIX)) return;
    const item = candidateByPair.get(raw.slice(CANDIDATE_PREFIX.length));
    if (!item || isBlankSku(item.sku)) return;
    onChange(item.sku);
  };

  return (
    <div className="relative min-w-[13rem]">
      <Select value={rootValue} onValueChange={handleValueChange}>
        <SelectTrigger
          data-testid={`target-sku-select-${itemId}`}
          aria-label="选择本地 SKU"
          className="h-10 w-full justify-between rounded-lg border border-input bg-card px-3 text-left text-sm font-medium text-foreground shadow-sm transition hover:border-primary"
        >
          <SelectValue placeholder="选择本地 SKU" />
        </SelectTrigger>
        <SelectContent className="w-[var(--radix-select-trigger-width)] min-w-[13rem] max-w-[calc(100vw-2rem)] [&_[data-radix-select-viewport]]:min-w-0">
          {viewCandidates.length ? (
            viewCandidates.map(item => {
              const value = CANDIDATE_PREFIX + pairKey(item.id, item.sku);
              return (
                <SelectItem
                  key={value}
                  value={value}
                  disabled={isBlankSku(item.sku)}
                  textValue={isBlankSku(item.sku) ? undefined : item.sku.trim()}
                  className="min-w-0 whitespace-normal [&>span:last-child]:min-w-0 [&>span:last-child]:whitespace-normal [&>span:last-child]:[overflow-wrap:anywhere]"
                >
                  {isBlankSku(item.sku) ? (
                    '无效候选（空 SKU）'
                  ) : (
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="min-w-0 break-all font-medium">{item.sku}</span>
                      {item.matchPercentage !== undefined ? (
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] ring-1 ${percentageStyle(item.matchPercentage)}`}>
                          {item.matchPercentage}%
                        </span>
                      ) : null}
                    </span>
                  )}
                </SelectItem>
              );
            })
          ) : (
            <p className="px-3 py-3 text-sm text-muted-foreground">没有符合的 SKU</p>
          )}
          {unknownSelected && (
            <SelectItem
              value={UNKNOWN_PREFIX + JSON.stringify(selectedSku)}
              disabled
              textValue={selectedSku}
              className="min-w-0 whitespace-normal text-muted-foreground [&>span:last-child]:min-w-0 [&>span:last-child]:whitespace-normal [&>span:last-child]:[overflow-wrap:anywhere]"
            >
              当前值暂不可用：{selectedSku}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
};
