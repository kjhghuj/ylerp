import React from 'react';
import { cn } from '../lib/utils';

export function PageHeader({ title, description, actions, className }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return <header className={cn('flex flex-wrap items-start justify-between gap-4', className)}><div className="min-w-0"><h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>{description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}</div>{actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}</header>;
}
