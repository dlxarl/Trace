import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseThemeMode, resolveTheme } from '../services/theme';
import { GRAPH_PALETTES } from '../features/graph/graphTheme';
import { buildGraphStyle } from '../features/graph/graphStyle';

const css = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf-8');
const block = (start: RegExp) => {
  const m = start.exec(css)!;
  let depth = 0;
  for (let i = m.index; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(m.index, i + 1);
  }
  throw new Error('unterminated block');
};
const vars = (b: string) => new Set([...b.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

describe('theme resolution', () => {
  it('parses stored values defensively', () => {
    expect(parseThemeMode('light')).toBe('light');
    expect(parseThemeMode('dark')).toBe('dark');
    expect(parseThemeMode('system')).toBe('system');
    for (const bad of [null, undefined, '', 'Light', 'blue', 42]) expect(parseThemeMode(bad)).toBe('system');
  });
  it('follows the OS only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('light theme stylesheet', () => {
  const dark = vars(block(/:root\s*\{/));
  const light = vars(block(/:root\[data-theme='light'\]\s*\{/));

  it('overrides every surface/text token of the dark theme', () => {
    const tokens = [...dark].filter((v) => /^--t-/.test(v));
    expect(tokens.length).toBeGreaterThan(20);
    expect(tokens.filter((t) => !light.has(t))).toEqual([]);
  });
  it('flips the grey scale and status hues', () => {
    for (const n of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) expect(light.has(`--color-zinc-${n}`)).toBe(true);
    for (const h of ['emerald', 'sky', 'amber', 'rose', 'purple', 'indigo', 'violet']) expect(light.has(`--color-${h}-400`)).toBe(true);
    expect(light.has('--color-white')).toBe(true);
  });
  it('keeps text on accent fills white in both themes', () => {
    expect(css).toMatch(/--color-on-accent:\s*#ffffff/);
    expect(/--t-on-accent:\s*#ffffff/.test(block(/:root\[data-theme='light'\]\s*\{/))).toBe(true);
  });
  it('has no hard-coded colours left in the markdown/code styles', () => {
    const md = css.slice(css.indexOf('/* Markdown prose styling */'));
    expect(md.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });
});

describe('graph palettes', () => {
  it('define the same keys for both themes, with a legible label/background pair', () => {
    expect(Object.keys(GRAPH_PALETTES.light).sort()).toEqual(Object.keys(GRAPH_PALETTES.dark).sort());
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const t of ['dark', 'light'] as const) {
      const P = GRAPH_PALETTES[t];
      expect(ratio(P.label, P.bg), `${t} label on canvas`).toBeGreaterThan(4.5);
      expect(ratio(P.labelStrong, P.labelBg), `${t} strong label on label background`).toBeGreaterThan(4.5);
      expect(ratio(P.select, P.bg), `${t} selection ring`).toBeGreaterThan(7);
    }
  });
  it('builds a different stylesheet per theme, from palette values only', () => {
    const d = JSON.stringify(buildGraphStyle(GRAPH_PALETTES.dark));
    const l = JSON.stringify(buildGraphStyle(GRAPH_PALETTES.light));
    expect(d).not.toBe(l);
    for (const [t, json] of [['dark', d], ['light', l]] as const) {
      const P = GRAPH_PALETTES[t];
      for (const c of [P.label, P.labelBg, P.select, P.edgeLabel, P.collectionFill]) expect(json).toContain(c);
    }
    // a colour that only the light palette uses must not leak into the dark stylesheet and vice versa
    expect(d).not.toContain(GRAPH_PALETTES.light.label);
    expect(l).not.toContain(GRAPH_PALETTES.dark.label);
  });
});
