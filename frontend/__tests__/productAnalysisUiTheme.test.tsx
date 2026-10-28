import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { buildPaTheme, contrastRatio, createPaUiVariables, hexToRgb, rgbToHex } from '../modules/product-analysis/theme';
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
  it('keeps sales values and record dates readable over actual bar, zebra, hover and focused-row layers', () => {
    // css:false can stub ?raw CSS when another suite imports the same sheet first.
    // Resolve a filesystem path instead of new URL(asset, import.meta.url), which
    // Vite treats as a browser asset and rewrites to a non-file URL.
    const testDirectory = dirname(fileURLToPath(import.meta.url));
    const styles = readFileSync(resolve(testDirectory, '../modules/product-analysis/product-analysis.css'), 'utf8');
    const globalStyles = readFileSync(resolve(testDirectory, '../index.css'), 'utf8');
    expect(styles, 'The contrast contract must read the full source stylesheet, not Vitest CSS stubs').toContain('.pa-cellbar::before');
    const barAlpha = Number(styles.match(/\.pa-cellbar::before\s*\{[\s\S]*?var\(--pa-accent-ui\)\s+(\d+)%/)![1]) / 100;
    const compose = (color: string, opacity: number, background: string) => {
      const back = hexToRgb(background);
      const [r, g, b, alpha] = color.startsWith('#')
        ? [...Object.values(hexToRgb(color)), 1]
        : color.match(/[\d.]+/g)!.map(Number);
      const front = { r, g, b };
      const effectiveAlpha = alpha * opacity;
      return rgbToHex({
        r: front.r * effectiveAlpha + back.r * (1 - effectiveAlpha),
        g: front.g * effectiveAlpha + back.g * (1 - effectiveAlpha),
        b: front.b * effectiveAlpha + back.b * (1 - effectiveAlpha),
      });
    };
    for (const base of ['#FFFFFF', '#000000', '#7A7A7A', '#7048EC', '#2563EB', '#059669', '#EA580C']) {
      for (const isDark of [false, true]) {
        const globalTokens = globalStyles.match(isDark ? /\.dark\s*\{([^}]+)/ : /:root\s*\{([^}]+)/)![1];
        const foreground = hslHex(globalTokens.match(/--ui-foreground:\s*([^;]+)/)![1]);
        const card = hslHex(globalTokens.match(/--ui-card:\s*([^;]+)/)![1]);
        const theme = buildPaTheme(base, isDark);
        const suffix = isDark ? 'd' : 'l';
        const accent = theme.cssVars[`--pa-u-${suffix}`];
        const soft2 = theme.cssVars[`--pa-s2-${suffix}`];
        const zebraAlpha = Number(styles.match(isDark
          ? /\.dark \.pa-table tbody tr:nth-child\(even\)\s*\{[\s\S]*?var\(--pa-accent-soft-2\)\s+(\d+)%/
          : /\.pa-table tbody tr:nth-child\(even\)\s*\{[\s\S]*?var\(--pa-accent-soft-2\)\s+(\d+)%/)![1]) / 100;
        const backgrounds = [card, compose(soft2, zebraAlpha, card),
          compose(theme.cssVars[`--pa-${isDark ? 's2' : 's'}-${suffix}`], 1, card), compose(soft2, 1, card)];
        for (const rowBackground of backgrounds) {
          // Record dates use the same foreground without a cell-level data bar.
          expect(contrastRatio(foreground, rowBackground), `${base} record date ${rowBackground}`).toBeGreaterThanOrEqual(4.5);
          // Check the complete gradient from transparent through its strongest end.
          for (const step of [0, .25, .5, .75, 1]) {
            const background = compose(accent, barAlpha * step, rowBackground);
            expect(contrastRatio(foreground, background), `${base} ${isDark ? 'dark' : 'light'} ${background}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });
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
