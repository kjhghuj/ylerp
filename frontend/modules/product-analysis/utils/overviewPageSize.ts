/** Fit rows inside a ranking card after its heading, padding and pager. */
export function overviewPageSize(cardHeight: number): number {
  return Math.max(1, Math.min(16, Math.floor((cardHeight - 130) / 42)));
}
