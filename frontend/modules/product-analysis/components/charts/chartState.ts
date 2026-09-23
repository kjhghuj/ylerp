import { createContext, useContext, useState, type Dispatch, type SetStateAction } from 'react';

export type SavedChartState = Record<string, unknown>;
export const ChartStateContext = createContext<{
  values: SavedChartState;
  setValues: Dispatch<SetStateAction<SavedChartState>>;
} | null>(null);

/** A chart can also be rendered standalone without the modal's state provider. */
export function useChartState<T,>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(ChartStateContext);
  const [local, setLocal] = useState(initial);
  if (!context) return [local, setLocal];
  const value = (context.values[key] ?? initial) as T;
  const setValue: Dispatch<SetStateAction<T>> = (next) => context.setValues((old) => ({
    ...old,
    [key]: typeof next === 'function'
      ? (next as (previous: T) => T)((old[key] ?? initial) as T)
      : next,
  }));
  return [value, setValue];
}

export const chartAxisTick = { fontSize: 11, fill: 'var(--text-tertiary)' };
export const finiteMetric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
