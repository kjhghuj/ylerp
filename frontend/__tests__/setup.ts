import '@testing-library/jest-dom/vitest';

// jsdom has no layout observer. Radix form controls subscribe to one to mirror
// their DOM control size; real layout is verified by Playwright in browsers.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
