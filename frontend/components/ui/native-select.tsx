import * as React from 'react';
import { cn } from '@/lib/utils';

/** Native events and empty values are preserved for existing business forms. */
const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} data-ui="native-select" className={cn('flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)} {...props}>
      {children}
    </select>
  ),
);
NativeSelect.displayName = 'NativeSelect';

export { NativeSelect };
