/**
 * Graph canvas theme. Entity colours come from ENTITY_TYPES so the canvas,
 * entity list, inspector and editors all use the same muted palette.
 */
import { ENTITY_TYPES, type EntityType, type RelationshipStatus } from '@/types';

export const GRAPH_BG = '#111113';

/** Canvas colours that depend on the light/dark theme. Entity colours are shared by both. */
export interface GraphPalette {
  bg: string;
  label: string;
  labelStrong: string;
  labelHover: string;
  labelBg: string;
  select: string;
  selectLabel: string;
  edgeLabel: string;
  edgeLabelStrong: string;
  collectionFill: string;
  warn: string;
  connectSource: string;
  connectTarget: string;
  hoverBorder: string;
  edge: Record<RelationshipStatus, string>;
  noteEdge: string;
}

export const GRAPH_PALETTES: Record<'dark' | 'light', GraphPalette> = {
  dark: {
    bg: '#111113',
    label: '#b4b8c0',
    labelStrong: '#d0d3d9',
    labelHover: '#f1f2f4',
    labelBg: '#0b0b0e',
    select: '#e6e8ec',
    selectLabel: '#ffffff',
    edgeLabel: '#9ea3ab',
    edgeLabelStrong: '#d4d7dd',
    collectionFill: '#1a1a20',
    warn: '#c6a463',
    connectSource: '#a99bd6',
    connectTarget: '#7fb79a',
    hoverBorder: '#d4d7dd',
    edge: { confirmed: '#8e98a8', supported: '#7f8ea3', unverified: '#8a8270', candidate: '#6b7079', rejected: '#8a5a5a' },
    noteEdge: '#6b7079',
  },
  light: {
    bg: '#f6f6f7',
    label: '#4a4d54',
    labelStrong: '#2a2c31',
    labelHover: '#111113',
    labelBg: '#ffffff',
    select: '#1b1c20',
    selectLabel: '#000000',
    edgeLabel: '#5f636b',
    edgeLabelStrong: '#2a2c31',
    collectionFill: '#ececef',
    warn: '#a07a2c',
    connectSource: '#6f5fb0',
    connectTarget: '#3f8a66',
    hoverBorder: '#3a3d44',
    edge: { confirmed: '#5f6b7c', supported: '#56667d', unverified: '#80764f', candidate: '#8a8f98', rejected: '#b05a5a' },
    noteEdge: '#8a8f98',
  },
};

/** Graph node colours are the app-wide entity colours (single source of truth). */
export const GRAPH_NODE_COLORS: Record<EntityType | 'note', string> = {
  ...(Object.fromEntries(ENTITY_TYPES.map((t) => [t.type, t.color])) as Record<EntityType, string>),
  note: '#7d7a72',
};

export function graphNodeColor(type: string): string {
  return (GRAPH_NODE_COLORS as Record<string, string>)[type] ?? '#8b8f98';
}

/** Edge colours: neutral by default; status is mostly carried by line style. */
export const GRAPH_EDGE_COLORS: Record<RelationshipStatus, string> = {
  confirmed: '#8e98a8',
  supported: '#7f8ea3',
  unverified: '#8a8270',
  candidate: '#6b7079',
  rejected: '#8a5a5a',
};

export const GRAPH_EDGE_STYLE: Record<RelationshipStatus, 'solid' | 'dashed' | 'dotted'> = {
  confirmed: 'solid',
  supported: 'solid',
  unverified: 'dashed',
  candidate: 'dotted',
  rejected: 'dashed',
};

export const GRAPH_SELECT = '#e6e8ec';

/** Node radius (model units) from degree: small by default, hubs grow sub-linearly. */
export function nodeDiameter(degree: number, maxDegree: number): number {
  const base = 9;
  if (degree <= 1) return base;
  const norm = Math.log(1 + degree) / Math.log(1 + Math.max(maxDegree, 2));
  return Math.round(base + norm * 17);
}
