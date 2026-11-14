import type cytoscape from 'cytoscape';
import type { GraphPalette } from './graphTheme';

/** Cytoscape stylesheet for the graph canvas. Colours come from the theme palette. */
export function buildGraphStyle(P: GraphPalette): cytoscape.StylesheetJson {
  return [
  {
    selector: 'node',
    style: {
      'shape': 'ellipse',
      'background-color': 'data(color)',
      'background-opacity': 0.92,
      'border-width': 0,
      'label': '',
      'color': P.label,
      'font-size': 9,
      'font-family': 'Inter, system-ui, sans-serif',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 3,
      'text-wrap': 'ellipsis',
      'text-max-width': '140px',
      'text-background-color': P.labelBg,
      'text-background-opacity': 0.72,
      'text-background-padding': '1.5px',
      'text-background-shape': 'roundrectangle',
      'min-zoomed-font-size': 6,
      'width': 'data(nodeSize)' as any,
      'height': 'data(nodeSize)' as any,
      'overlay-opacity': 0,
      'underlay-opacity': 0,
      'z-index': 10,
    },
  },
  // LOD-controlled label visibility
  {
    selector: 'node.label-on',
    style: { 'label': 'data(label)' },
  },
  {
    selector: 'node[degree >= 6]',
    style: { 'z-index': 20, 'color': P.labelStrong },
  },
  // Entity-type glyph inside the node (issue #1). Photos below override it.
  {
    selector: 'node[icon]',
    style: {
      'background-image': 'data(icon)',
      'background-fit': 'none',
      'background-width': '62%',
      'background-height': '62%',
      'background-image-opacity': 0,
      'background-image-smoothing': 'yes',
    } as any,
  },
  {
    selector: 'node[icon].hovered, node[icon]:selected',
    style: { 'background-image-opacity': 0.9 } as any,
  },
  {
    selector: 'node[imageUrl]',
    style: {
      'background-image': 'data(imageUrl)',
      'background-fit': 'cover',
      'background-clip': 'node',
      'background-opacity': 1,
      'border-width': 1,
      'border-color': 'data(color)',
    },
  },
  {
    selector: 'node[?isCollection]',
    style: {
      'shape': 'round-rectangle',
      'background-color': P.collectionFill,
      'border-width': 1,
      'border-style': 'dashed',
      'border-color': 'data(color)',
      'border-opacity': 0.8,
    },
  },
  {
    selector: 'node[?isNote]',
    style: {
      'shape': 'round-rectangle',
      'background-color': 'data(color)',
      'background-opacity': 0.7,
    },
  },
  {
    selector: 'node.transform-running',
    style: {
      'underlay-color': P.warn,
      'underlay-padding': 6,
      'underlay-opacity': 0.35,
      'underlay-shape': 'ellipse',
    },
  },
  {
    selector: 'node.hovered',
    style: {
      'label': 'data(label)',
      'background-opacity': 1,
      'border-width': 1.5,
      'border-color': P.hoverBorder,
      'border-opacity': 0.9,
      'color': P.labelHover,
      'z-index': 9999,
    },
  },
  {
    selector: 'node.hovered-neighbor',
    style: { 'background-opacity': 1, 'z-index': 500 },
  },
  {
    selector: 'node:selected',
    style: {
      'label': 'data(label)',
      'background-opacity': 1,
      'border-width': 2,
      'border-color': P.select,
      'border-opacity': 1,
      'underlay-color': P.select,
      'underlay-padding': 4,
      'underlay-opacity': 0.12,
      'underlay-shape': 'ellipse',
      'color': P.selectLabel,
      'font-weight': 600 as any,
      'z-index': 10000,
    },
  },
  {
    selector: 'node.connecting-source',
    style: { 'border-width': 2, 'border-color': P.connectSource, 'z-index': 99999 },
  },
  {
    selector: 'node.connecting-target',
    style: { 'border-width': 2, 'border-color': P.connectTarget, 'z-index': 99999 },
  },
  {
    selector: 'edge',
    style: {
      'width': 0.8,
      'line-color': 'data(color)',
      'line-opacity': 0.4,
      'curve-style': 'haystack',
      'haystack-radius': 0,
      'label': '',
      'font-size': 8,
      'font-family': 'Inter, system-ui, sans-serif',
      'color': P.edgeLabel,
      'text-rotation': 'autorotate',
      'text-background-opacity': 0.8,
      'text-background-color': P.labelBg,
      'text-background-padding': '1.5px',
      'text-background-shape': 'roundrectangle',
      'min-zoomed-font-size': 7,
      'z-index': 1,
    },
  },
  // Unverified relationships: thinner, fainter, broken line
  {
    selector: 'edge[!verified]',
    style: { 'line-opacity': 0.22, 'width': 0.7 },
  },
  { selector: 'edge[lineStyle = "dashed"]', style: { 'line-style': 'dashed', 'line-dash-pattern': [4, 3] } },
  { selector: 'edge[lineStyle = "dotted"]', style: { 'line-style': 'dotted' } },
  { selector: 'edge[status = "rejected"]', style: { 'line-opacity': 0.18 } },
  // Emphasised edges (hover / selection neighbourhood / zoomed-in labels)
  {
    selector: 'edge.emph',
    style: {
      'curve-style': 'bezier',
      'width': 1.3,
      'line-opacity': 0.85,
      'z-index': 600,
    },
  },
  // Evidence indicator (issue #2): a dot at the midpoint of emphasised
  // edges. Filled = at least one evidence source, hollow = unsourced.
  {
    selector: 'edge.emph[evidenceCount > 0]',
    style: {
      'mid-target-arrow-shape': 'circle',
      'mid-target-arrow-fill': 'filled',
      'mid-target-arrow-color': 'data(color)',
      'arrow-scale': 0.55,
    },
  },
  {
    selector: 'edge.emph[evidenceCount = 0]',
    style: {
      'mid-target-arrow-shape': 'circle',
      'mid-target-arrow-fill': 'hollow',
      'mid-target-arrow-color': P.warn,
      'arrow-scale': 0.55,
    },
  },
  {
    selector: 'edge.emph[?directed]',
    style: {
      'target-arrow-shape': 'triangle',
      'target-arrow-color': 'data(color)',
      'arrow-scale': 0.55,
    },
  },
  {
    selector: 'edge.edge-label-on',
    style: { 'label': 'data(label)' },
  },
  {
    selector: 'edge.hovered-connected',
    style: {
      'curve-style': 'bezier',
      'width': 1.4,
      'line-opacity': 0.9,
      'label': 'data(label)',
      'color': P.edgeLabelStrong,
      'z-index': 800,
    },
  },
  {
    selector: 'edge.hovered-connected[?directed]',
    style: { 'target-arrow-shape': 'triangle', 'target-arrow-color': 'data(color)', 'arrow-scale': 0.6 },
  },
  {
    selector: 'edge:selected',
    style: {
      'curve-style': 'bezier',
      'width': 1.8,
      'line-color': P.select,
      'line-opacity': 1,
      'label': 'data(label)',
      'color': P.selectLabel,
      'target-arrow-color': P.select,
      'z-index': 900,
    },
  },
  {
    selector: 'edge:selected[?directed]',
    style: { 'target-arrow-shape': 'triangle', 'arrow-scale': 0.7 },
  },
  // Context dimming: selection neighbourhood
  {
    selector: 'node.dimmed',
    style: { 'opacity': 0.22 },
  },
  {
    selector: 'edge.dimmed',
    style: { 'opacity': 0.12 },
  },
  // Focus / search fading (stronger)
  {
    selector: '.faded',
    style: { 'opacity': 0.08, 'text-opacity': 0 },
  },
  {
    selector: 'node.highlighted',
    style: { 'opacity': 1, 'label': 'data(label)' },
  },
  {
    selector: 'edge.highlighted',
    style: { 'opacity': 1, 'line-opacity': 0.8, 'curve-style': 'bezier' },
  },
] as cytoscape.StylesheetJson;
}
