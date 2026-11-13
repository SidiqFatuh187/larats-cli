import type { StackGraph, StackNode } from '../stack-graph.js';
import { localeIndependentCompare } from '../scanner.js';

export function escapeGraphHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function markdownText(value: string): string {
  return escapeGraphHtml(value.replace(/[\r\n\u0000-\u001f]+/g, ' '))
    .replace(/[\\`*_{}\[\]()#+.!|~-]/g, '\\$&');
}

function mermaidText(value: string): string {
  // Encode syntax characters once; raw entity syntax must not become Mermaid directives.
  return Array.from(value.replace(/[\r\n\u0000-\u001f]+/g, ' ').replace(/</g, '‹').replace(/>/g, '›'), (character) =>
    /[\p{L}\p{N} /:._-]/u.test(character) ? character : `#${character.codePointAt(0)};`).join('');
}

const roles: StackNode['role'][] = ['frontend', 'module', 'backend', 'data', 'external', 'tools'];
const roleLabels: Record<StackNode['role'], string> = {
  frontend: 'Frontend', module: 'Source modules', backend: 'Backend', data: 'Data', external: 'External services', tools: 'Build & development tools',
};

function orderedGraph(graph: StackGraph): StackGraph {
  const nodes = [...graph.nodes].sort((a, b) => localeIndependentCompare(a.scope, b.scope)
    || roles.indexOf(a.role) - roles.indexOf(b.role) || localeIndependentCompare(a.label, b.label)
    || localeIndependentCompare(a.id, b.id));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)).map((edge) => ({
    ...edge,
    evidence: [...edge.evidence].sort((a, b) => localeIndependentCompare(a.file, b.file)
      || a.line - b.line || localeIndependentCompare(a.kind, b.kind) || localeIndependentCompare(a.detail, b.detail)),
  })).sort((a, b) => localeIndependentCompare(a.from, b.from) || localeIndependentCompare(a.to, b.to)
    || localeIndependentCompare(a.label, b.label));
  return { nodes, edges, warnings: [...graph.warnings].sort(localeIndependentCompare) };
}

function nodeDescription(node: StackNode): string {
  return `${node.label} (${node.scope || '.'}; ${node.role})`;
}

export function generateStackGraphMermaid(graph: StackGraph): string {
  const { nodes, edges } = orderedGraph(graph);
  const ids = new Map(nodes.map((node, index) => [node.id, `n${index}`]));
  const connected = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const lines = ['flowchart LR'];
  const scopes = [...new Set(nodes.map((node) => node.scope))];
  for (const [index, scope] of scopes.entries()) {
    lines.push(`  subgraph s${index}["${mermaidText(scope || '.')}"]`);
    for (const node of nodes.filter((item) => item.scope === scope)) {
      const state = connected.has(node.id) ? '' : '; no relationship evidence';
      lines.push(`    ${ids.get(node.id)}["${mermaidText(`${node.label} (${node.role}${state})`)}"]`);
    }
    lines.push('  end');
  }
  for (const [index, edge] of edges.entries()) {
    lines.push(`  ${ids.get(edge.from)} -->|"${mermaidText(`${index + 1}. ${edge.label}`)}"| ${ids.get(edge.to)}`);
  }
  return lines.join('\n');
}

export function generateStackGraphMarkdown(graph: StackGraph): string {
  const { nodes, edges, warnings } = orderedGraph(graph);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lines = ['## Architecture relationships', '', 'Static source evidence only. Arrows describe references, not runtime traffic or deployment.', ''];
  if (nodes.length) lines.push('```mermaid', generateStackGraphMermaid(graph), '```', '');
  else lines.push('No graph nodes were found in the selected source evidence.', '');
  if (!edges.length) lines.push('No relationship evidence found. Detected technologies may still be listed without connections.', '');
  if (edges.length) lines.push('## Relationship evidence', '');
  for (const [index, edge] of edges.entries()) {
    lines.push(`${index + 1}. ${markdownText(nodeDescription(byId.get(edge.from)!))} → ${markdownText(nodeDescription(byId.get(edge.to)!))}: ${markdownText(edge.label)}`);
    for (const evidence of edge.evidence) {
      lines.push(`   - <code>${escapeGraphHtml(evidence.file.replace(/[\r\n\u0000-\u001f]+/g, ' '))}:${evidence.line}</code> (${markdownText(evidence.kind)}): ${markdownText(evidence.detail)}`);
    }
    if (!edge.evidence.length) lines.push('   - No source location supplied.');
  }
  if (warnings.length) lines.push('', '## Scan warnings', '', ...warnings.map((warning) => `- ${markdownText(warning)}`));
  return lines.join('\n') + '\n';
}

function wrapNodeLabel(label: string, maxWidth = 26): string[] {
  const clean = label.replace(/[\r\n\u0000-\u001f]+/g, ' ').trim();
  if (clean.length <= maxWidth) return [clean];

  if (clean.includes('/')) {
    const segments = clean.split('/');
    const lines: string[] = [];
    let current = '';
    for (let i = 0; i < segments.length; i++) {
      const isLast = i === segments.length - 1;
      const part = segments[i] + (isLast ? '' : '/');
      if (!current) {
        current = part;
      } else if ((current + part).length <= maxWidth) {
        current += part;
      } else {
        lines.push(current);
        current = part;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [clean];
  }

  const words = clean.split(/([ -])/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + word).length <= maxWidth) {
      current += word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [clean];
}

interface PositionedNode {
  node: StackNode;
  x: number;
  y: number;
  width: number;
  height: number;
  labelLines: string[];
  subLines: string[];
}

export function generateStackGraphHtml(graph: StackGraph, badges: ReadonlyMap<string, string> = new Map()): string {
  const { nodes, edges, warnings } = orderedGraph(graph);
  const connected = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const warningHtml = warnings.length ? `<aside aria-labelledby="scan-warnings"><h3 id="scan-warnings">Scan warnings</h3><ul>${warnings.map((warning) => `<li>${escapeGraphHtml(warning)}</li>`).join('')}</ul></aside>` : '';
  if (!nodes.length) return `<p>No graph nodes were found in the selected source evidence.</p><p>No relationship evidence found.</p>${warningHtml}`;

  const activeRoles = roles.filter((role) => nodes.some((node) => node.role === role));
  const nodeWidth = 260;
  const colGap = 180;
  const rowGap = 34;
  const positioned = new Map<string, PositionedNode>();
  const groups: string[] = [];
  let top = 72;
  let maxDiagramX = 700;

  const roleBase: Record<StackNode['role'], number> = {
    frontend: 0,
    module: 10,
    backend: 20,
    data: 30,
    external: 40,
    tools: 50,
  };

  const roleStartXs = new Map<StackNode['role'], number>();

  for (const scope of new Set(nodes.map((node) => node.scope))) {
    const scopeNodes = nodes.filter((node) => node.scope === scope);
    const scopeNodeIds = new Set(scopeNodes.map((n) => n.id));
    const scopeEdges = edges.filter((e) => scopeNodeIds.has(e.from) && scopeNodeIds.has(e.to));
    const outgoingInScope = new Map<string, number>();
    scopeEdges.forEach((e) => outgoingInScope.set(e.from, (outgoingInScope.get(e.from) ?? 0) + 1));

    const depth = new Map<string, number>();
    scopeNodes.forEach((n) => depth.set(n.id, 0));

    for (let iter = 0; iter < Math.min(scopeNodes.length, 12); iter++) {
      for (const e of scopeEdges) {
        const fromD = depth.get(e.from) ?? 0;
        const toD = depth.get(e.to) ?? 0;
        if (toD <= fromD && fromD < 12) {
          depth.set(e.to, fromD + 1);
        }
      }
    }

    const nodeRank = (node: StackNode) => {
      if (node.role === 'tools' && (outgoingInScope.get(node.id) ?? 0) > 0) {
        return depth.get(node.id) ?? 0;
      }
      return (roleBase[node.role] ?? 10) * 10 + (depth.get(node.id) ?? 0);
    };
    const distinctRanks = [...new Set(scopeNodes.map(nodeRank))].sort((a, b) => a - b);

    const groupTop = top;
    top += 34;
    let groupBottom = top;
    let groupMaxX = 32 + nodeWidth;

    for (const [colIdx, rank] of distinctRanks.entries()) {
      const colNodes = scopeNodes.filter((n) => nodeRank(n) === rank);
      colNodes.sort((a, b) => localeIndependentCompare(a.label, b.label) || localeIndependentCompare(a.id, b.id));

      const x = 32 + colIdx * (nodeWidth + colGap);
      groupMaxX = Math.max(groupMaxX, x + nodeWidth);
      maxDiagramX = Math.max(maxDiagramX, x + nodeWidth);

      let y = top;
      for (const node of colNodes) {
        if (!roleStartXs.has(node.role)) {
          roleStartXs.set(node.role, x);
        }
        const labelLines = wrapNodeLabel(node.label, 26);
        const subText = `${node.role}${connected.has(node.id) ? '' : ' · no relationship evidence'}`;
        const subLines = wrapNodeLabel(subText, 32);
        const hasBadge = !!(node.techId && badges.has(node.techId));
        const height = Math.max(76, 32 + labelLines.length * 18 + subLines.length * 15 + (hasBadge ? 28 : 0));

        positioned.set(node.id, {
          node,
          x,
          y,
          width: nodeWidth,
          height,
          labelLines,
          subLines,
        });
        y += height + rowGap;
      }
      groupBottom = Math.max(groupBottom, y);
    }

    const scopeLabelText = scope || '.';
    groups.push(`<rect class="scope-box" x="16" y="${groupTop}" width="${groupMaxX + 8}" height="${groupBottom - groupTop}" rx="8"/>
      <text class="scope-label" x="32" y="${groupTop + 22}">${escapeGraphHtml(scopeLabelText)}</text>`);
    top = groupBottom + 36;
  }

  const links: string[] = [];
  const labels: string[] = [];

  const outgoingCount = new Map<string, number>();
  const incomingCount = new Map<string, number>();
  edges.forEach((e) => {
    outgoingCount.set(e.from, (outgoingCount.get(e.from) ?? 0) + 1);
    incomingCount.set(e.to, (incomingCount.get(e.to) ?? 0) + 1);
  });
  const outgoingIndex = new Map<string, number>();
  const incomingIndex = new Map<string, number>();

  for (const [index, edge] of edges.entries()) {
    const from = positioned.get(edge.from)!;
    const to = positioned.get(edge.to)!;
    const outIdx = outgoingIndex.get(edge.from) ?? 0;
    outgoingIndex.set(edge.from, outIdx + 1);
    const inIdx = incomingIndex.get(edge.to) ?? 0;
    incomingIndex.set(edge.to, inIdx + 1);

    const totalOut = outgoingCount.get(edge.from) ?? 1;
    const totalIn = incomingCount.get(edge.to) ?? 1;

    let path = '';
    let mx = 0;
    let my = 0;

    if (to.x > from.x) {
      const sx = from.x + from.width;
      const sy = from.y + from.height * (totalOut === 1 ? 0.5 : 0.2 + 0.6 * (outIdx / Math.max(1, totalOut - 1)));
      const tx = to.x;
      const ty = to.y + to.height * (totalIn === 1 ? 0.5 : 0.2 + 0.6 * (inIdx / Math.max(1, totalIn - 1)));
      const dx = Math.max(45, (tx - sx) * 0.45);
      path = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
      const isAdjacent = (to.x - from.x) <= (from.width + colGap + 40);
      const t = isAdjacent
        ? (totalOut === 1 ? 0.5 : 0.22 + 0.56 * (outIdx / Math.max(1, totalOut - 1)))
        : (0.16 + 0.12 * (outIdx % 3));
      const cx1 = sx + dx;
      const cy1 = sy;
      const cx2 = tx - dx;
      const cy2 = ty;
      const mt = 1 - t;
      mx = mt * mt * mt * sx + 3 * mt * mt * t * cx1 + 3 * mt * t * t * cx2 + t * t * t * tx;
      my = mt * mt * mt * sy + 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t * t * t * ty;
    } else if (to.x === from.x) {
      const sx = from.x + from.width;
      const sy = from.y + from.height * (totalOut === 1 ? 0.5 : 0.2 + 0.6 * (outIdx / Math.max(1, totalOut - 1)));
      const tx = to.x + to.width;
      const ty = to.y + to.height * (totalIn === 1 ? 0.5 : 0.2 + 0.6 * (inIdx / Math.max(1, totalIn - 1)));
      const dist = Math.abs(ty - sy);
      const arc = 45 + Math.min(80, dist * 0.15) + (outIdx % 4) * 20;
      path = `M ${sx} ${sy} C ${sx + arc} ${sy}, ${sx + arc} ${ty}, ${tx} ${ty}`;
      mx = sx + arc;
      my = (sy + ty) / 2;
    } else {
      const sx = from.x;
      const sy = from.y + from.height * 0.75;
      const tx = to.x + to.width;
      const ty = to.y + to.height * 0.75;
      const bottom = Math.max(from.y + from.height, to.y + to.height) + 32 + (index % 3) * 16;
      path = `M ${sx} ${sy} C ${sx - 35} ${bottom}, ${tx + 35} ${bottom}, ${tx} ${ty}`;
      mx = (sx + tx) / 2;
      my = bottom;
    }

    const labelText = `${index + 1}. ${edge.label}`;
    const pillW = Math.max(48, Math.min(180, labelText.length * 6.8 + 20));
    const pillH = 22;

    links.push(`<path class="relationship" data-from="${escapeGraphHtml(edge.from)}" data-to="${escapeGraphHtml(edge.to)}" data-edge-idx="${index}" data-out-idx="${outIdx}" data-total-out="${totalOut}" data-in-idx="${inIdx}" data-total-in="${totalIn}" d="${path}" marker-end="url(#stack-arrow)"/>`);
    labels.push(`<a class="edge-label-link" data-edge-idx="${index}" data-from="${escapeGraphHtml(edge.from)}" data-to="${escapeGraphHtml(edge.to)}" href="#stack-evidence-${index + 1}" aria-label="${escapeGraphHtml(`Relationship ${index + 1}: ${nodeDescription(from.node)} ${edge.label} ${nodeDescription(to.node)}. View evidence.`)}">
      <rect class="edge-label-box" x="${mx - pillW / 2}" y="${my - pillH / 2}" width="${pillW}" height="${pillH}" rx="11"/>
      <text class="edge-label" x="${mx}" y="${my + 4}" text-anchor="middle">${escapeGraphHtml(labelText)}</text>
    </a>`);
  }

  const nodeHtml = [...positioned.values()].map(({ node, x, y, width, height, labelLines, subLines }) => {
    const badge = node.techId ? badges.get(node.techId) : undefined;
    return `<g class="graph-node-group" data-id="${escapeGraphHtml(node.id)}" data-x="${x}" data-y="${y}" data-w="${width}" data-h="${height}" style="cursor: grab;">
      <title>${escapeGraphHtml(nodeDescription(node))}</title>
      <rect class="graph-node${node.role === 'tools' ? ' tool-node' : ''}" x="${x}" y="${y}" width="${width}" height="${height}" rx="6"/>
      ${labelLines.map((line, index) => `<text class="node-label" x="${x + 14}" y="${y + 24 + index * 18}">${escapeGraphHtml(line)}</text>`).join('')}
      ${subLines.map((line, index) => `<text class="node-meta" x="${x + 14}" y="${y + 24 + labelLines.length * 18 + index * 15}">${escapeGraphHtml(line)}</text>`).join('')}
      ${badge ? `<image href="${escapeGraphHtml(badge)}" x="${x + 14}" y="${y + height - 26}" width="160" height="20" preserveAspectRatio="xMinYMid meet" aria-hidden="true"/>` : ''}
    </g>`;
  }).join('');

  const width = Math.max(800, maxDiagramX + 48);
  const laneHeaders = activeRoles.map((role) => {
    const x = roleStartXs.get(role) ?? 32;
    return `<text class="lane-label" x="${x}" y="36">${escapeGraphHtml(roleLabels[role])}</text>`;
  }).join('');

  const svg = `<div class="diagram-container">
    <input type="radio" name="diag-zoom" id="zoom-80" class="sr-only">
    <input type="radio" name="diag-zoom" id="zoom-100" class="sr-only" checked>
    <input type="radio" name="diag-zoom" id="zoom-125" class="sr-only">
    <input type="radio" name="diag-zoom" id="zoom-150" class="sr-only">
    <input type="checkbox" id="diag-expand" class="sr-only">
    <div class="diagram-toolbar">
      <div class="toolbar-group">
        <span class="toolbar-label">Zoom:</span>
        <label for="zoom-80" class="tool-btn">80%</label>
        <label for="zoom-100" class="tool-btn">100%</label>
        <label for="zoom-125" class="tool-btn">125%</label>
        <label for="zoom-150" class="tool-btn">150%</label>
      </div>
      <div class="toolbar-group">
        <button type="button" class="tool-btn" id="reset-layout-btn" title="Reset all moved cards and labels to default">Reset Layout</button>
        <label for="diag-expand" class="tool-btn expand-btn">
          <span class="expand-icon-open">Expand View</span>
          <span class="expand-icon-close">Close Full View</span>
        </label>
      </div>
    </div>
    <div class="diagram-scroll" tabindex="0" role="region" aria-label="Scrollable architecture diagram" aria-describedby="diagram-help">
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${top}" viewBox="0 0 ${width} ${top}" role="group" aria-labelledby="stack-diagram-title stack-diagram-desc">
        <title id="stack-diagram-title">Source-evidence architecture graph</title>
        <desc id="stack-diagram-desc">Nodes grouped by package scope and role. Numbered directed relationships link to source evidence below. Build and development tools have their own lane.</desc>
        <defs><marker id="stack-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0f766e"/></marker></defs>
        ${laneHeaders}
        ${groups.join('')}${links.join('')}${nodeHtml}${labels.join('')}
      </svg>
    </div>
  </div>`;

  const evidence = edges.length ? `<h3 id="relationship-evidence">Relationship evidence</h3><ol class="evidence-list">${edges.map((edge, index) => `<li id="stack-evidence-${index + 1}" tabindex="-1"><p><strong>${escapeGraphHtml(nodeDescription(byId.get(edge.from)!))}</strong> → <strong>${escapeGraphHtml(nodeDescription(byId.get(edge.to)!))}</strong>: ${escapeGraphHtml(edge.label)}</p><ul>${edge.evidence.map((item) => `<li><code>${escapeGraphHtml(item.file)}:${item.line}</code> <span>(${escapeGraphHtml(item.kind)}) ${escapeGraphHtml(item.detail)}</span></li>`).join('') || '<li>No source location supplied.</li>'}</ul></li>`).join('')}</ol>` : '<p>No relationship evidence found. Detected technologies are shown without inferred connections.</p>';
  const inventory = `<details><summary>All graph nodes, scopes and roles</summary><ul>${nodes.map((node) => `<li>${escapeGraphHtml(nodeDescription(node))}${connected.has(node.id) ? '' : ': no relationship evidence'}</li>`).join('')}</ul></details>`;
  return `<p id="diagram-help">Arrows show source references, not runtime traffic. Follow a numbered label to its evidence. Scroll the diagram to see every node; a text list is available below.</p>${svg}${warningHtml}${evidence}${inventory}`;
}
