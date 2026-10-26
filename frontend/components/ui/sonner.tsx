// Source pattern: https://v3.shadcn.com/r/styles/new-york/sonner.json (MIT).
// Vite adaptation: observe the app's existing root .dark rather than next-themes.
import * as React from 'react';
import { Toaster as Sonner } from 'sonner';

export function Toaster(props: React.ComponentProps<typeof Sonner>) {
  const [dark, setDark] = React.useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  React.useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return <Sonner theme={dark ? 'dark' : 'light'} className="ui-toaster" position="top-right" closeButton expand visibleToasts={5}
    style={{ '--normal-bg': 'hsl(var(--ui-card))', '--normal-text': 'hsl(var(--ui-card-foreground))', '--normal-border': 'hsl(var(--ui-border))' } as React.CSSProperties}
    toastOptions={{ classNames: { toast: 'font-sans text-sm', description: 'text-muted-foreground' } }} {...props} />;
}
