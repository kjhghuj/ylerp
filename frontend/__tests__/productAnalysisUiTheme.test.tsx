import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { buildPaTheme, contrastRatio, createPaUiVariables, rgbToHex } from '../modules/product-analysis/theme';
import { PaThemeProvider, usePaTheme } from '../modules/product-analysis/themeContext';

function hslHex(channels: string): string {
  const [degrees, saturation, lightness] = channels.split(/\s+/).map(parseFloat);
  const hue = degrees / 360;
  const sat = saturation / 100;
  const light = lightness / 100;
  const channel = (offset: number) => {
    const position = (offset + hue * 12) % 12;
    return light - sat * Math.min(light, 1 - light) * Math.max(-1, Math.min(position - 3, 9 - position, 1));
  };
  return rgbToHex({ r: channel(0) * 255, g: channel(8) * 255, b: channel(4) * 255 });
}

afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.classList.remove('dark'); });

describe('product analysis shared UI theme', () => {
  it('preserves readable custom-color button pairs in both themes', () => {
    for (const base of ['#FFFFFF', '#000000', '#7A7A7A', '#7048EC', '#2563EB', '#059669', '#EA580C']) {
      for (const isDark of [false, true]) {
        const theme = buildPaTheme(base, isDark);
        const variables = createPaUiVariables(theme);
        expect(contrastRatio(hslHex(variables['--ui-primary']), hslHex(variables['--ui-primary-foreground']))).toBeGreaterThanOrEqual(4.5);
        expect(theme.base).toBe(base);
        expect(variables['--pa-accent-ui']).toBe(theme.cssVars[isDark ? '--pa-u-d' : '--pa-u-l']);
      }
    }
  });

  it('updates the same module and body portal variables when a custom color changes', async () => {
    function Probe() {
      const { theme, setColor } = usePaTheme();
      return <section data-testid="module" style={createPaUiVariables(theme)}><Dialog open><DialogContent>
        <DialogTitle>Themed analysis</DialogTitle><DialogDescription>Custom colors follow the active module</DialogDescription>
        <Button onClick={() => setColor('#FFFFFF')}>Change color</Button>
      </DialogContent></Dialog></section>;
    }
    render(<PaThemeProvider><Probe /></PaThemeProvider>);
    const dialog = await screen.findByRole('dialog', { name: 'Themed analysis' });
    const host = dialog.closest('[data-ui-theme-portal]') as HTMLElement;
    expect(host?.parentElement).toBe(document.body);
    expect(screen.getByTestId('module')).not.toContainElement(dialog);
    await userEvent.click(screen.getByRole('button', { name: 'Change color' }));
    await waitFor(() => expect(host.style.getPropertyValue('--ui-primary')).toBe(screen.getByTestId('module').style.getPropertyValue('--ui-primary')));
    expect(host.style.getPropertyValue('--pa-on-accent')).toBe('#171B3D');
  });
});
