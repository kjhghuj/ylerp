import * as React from 'react';
import { createPortal } from 'react-dom';

type ThemeVariables = React.CSSProperties & Record<`--${string}`, string | number>;
const ThemePortalContext = React.createContext<HTMLElement | null>(null);

/** Module-specific semantic variables are copied to a body-level Portal host.
 * This preserves theme inheritance without putting fixed overlays inside a
 * clipped/scrolling module. Global dark mode still comes from documentElement.
 */
export function UIThemeScope({ children, variables }: { children: React.ReactNode; variables?: ThemeVariables }) {
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  return (
    <ThemePortalContext.Provider value={container}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div data-ui-theme-portal="" style={variables} ref={setContainer} />,
        document.body,
      )}
    </ThemePortalContext.Provider>
  );
}

export function useThemePortalContainer() {
  return React.useContext(ThemePortalContext) ?? undefined;
}
