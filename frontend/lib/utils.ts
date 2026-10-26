import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind 3-compatible class merging (tailwind-merge 2.x). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
