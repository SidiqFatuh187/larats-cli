import test from 'node:test';
import assert from 'node:assert/strict';
import type { StackGraph } from '../src/stack-graph.js';
import { generateStackGraphHtml, generateStackGraphMarkdown, generateStackGraphMermaid } from '../src/generator/stack-diagram.js';

function graph(): StackGraph {
  return {
    nodes: [
      { id: 'client', label: 'Client module', role: 'module', scope: 'apps/web' },
      { id: 'api', label: 'Server module', role: 'backend', scope: 'apps/api' },
      { id: 'db', label: 'PostgreSQL', role: 'data', scope: 'apps/api', techId: 'postgresql' },
      { id: 'tool', label: 'Vite', role: 'tools', scope: 'apps/web', techId: 'vite' },
    ],
    edges: [
      { from: 'client', to: 'api', label: 'requests route', evidence: [
        { file: 'apps/web/client.ts', line: 8, kind: 'request', detail: 'Matches a declared route' },
        { file: 'apps/api/server.ts', line: 4, kind: 'route', detail: 'Declares the matching route' },
      ] },
      { from: 'api', to: 'db', label: 'provider', evidence: [
        { file: 'apps/api/prisma/schema.prisma', line: 3, kind: 'provider', detail: 'Declares PostgreSQL provider' },
      ] },
    ],
    warnings: ['An unsupported source file was skipped.'],
  };
}

test('Mermaid preserves evidence direction with index-only identifiers, scopes, roles and unconnected nodes', () => {
  const source = generateStackGraphMermaid(graph());
  assert.match(source, /^flowchart LR\n/);
  assert.match(source, /subgraph s0\["apps\/api"\]/);
  assert.match(source, /n0\["Server module/);
  assert.match(source, /n1\["PostgreSQL/);
  assert.match(source, /n2\["Client module/);
  assert.match(source, /n0 -->\|"1\. provider"\| n1/);
  assert.match(source, /n2 -->\|"2\. requests route"\| n0/);
  assert.match(source, /Vite .*tools.*no relationship evidence/);
  assert.equal((source.match(/ -->/g) ?? []).length, 2);
});

test('SVG relationships link to numbered accessible source evidence and keep tools separate', () => {
  const html = generateStackGraphHtml(graph());
  assert.equal((html.match(/marker-end="url\(#stack-arrow\)"/g) ?? []).length, 2);
  for (const number of [1, 2]) {
    assert.match(html, new RegExp(`href="#stack-evidence-${number}"`));
    assert.match(html, new RegExp(`id="stack-evidence-${number}"`));
  }
  assert.match(html, /apps\/api\/prisma\/schema\.prisma:3/);
  assert.match(html, /Declares PostgreSQL provider/);
  assert.match(html, /Build &amp; development tools/);
  assert.match(html, /tool-node/);
  assert.match(html, /Vite \(apps\/web; tools\): no relationship evidence/);
  assert.match(html, /tabindex="0" role="region"/);
  assert.match(html, /<summary>All graph nodes, scopes and roles<\/summary>/);
  assert.match(html, /An unsupported source file was skipped\./);
  assert.doesNotMatch(html, /<script|<foreignObject|cdn\./);
});

test('all graph outputs are deterministic without mutating nodes, edges or evidence', () => {
  const original = graph();
  const before = JSON.stringify(original);
  const reversed: StackGraph = {
    nodes: [...original.nodes].reverse(),
    edges: [...original.edges].reverse().map((edge) => ({ ...edge, evidence: [...edge.evidence].reverse() })),
    warnings: [...original.warnings].reverse(),
  };
  for (const render of [generateStackGraphMermaid, generateStackGraphHtml, generateStackGraphMarkdown]) {
    assert.equal(render(original), render(reversed));
  }
  assert.equal(JSON.stringify(original), before);
});

test('hostile labels, identifiers, evidence and warnings cannot become SVG or Mermaid syntax', () => {
  const attack = '\"]\nclick n0 \"javascript:alert(1)\"\n%%{init: {securityLevel: \"loose\"}}%%\n</textarea><script>alert(1)</script>```&#60;';
  const unsafe: StackGraph = {
    nodes: [{ id: attack, label: attack, role: 'module', scope: attack }],
    edges: [{ from: attack, to: attack, label: attack, evidence: [{ file: attack, line: 9, kind: 'import', detail: attack }] }],
    warnings: [attack],
  };
  const mermaid = generateStackGraphMermaid(unsafe);
  assert.equal(mermaid.split('\n').length, 5);
  assert.match(mermaid, /n0 -->\|/);
  assert.doesNotMatch(mermaid.replace(/-->/g, ''), /<|>|```|%%|&#60;|\nclick/);
  // Only the renderer's arrow is allowed to contain a raw greater-than sign.
  assert.equal((mermaid.match(/-->/g) ?? []).length, 1);
  const html = generateStackGraphHtml(unsafe);
  assert.doesNotMatch(html, /<script|<\/textarea>|href="javascript:|onclick=/);
  assert.match(html, /&lt;script&gt;/);
  const markdown = generateStackGraphMarkdown(unsafe);
  assert.equal((markdown.match(/^```/gm) ?? []).length, 2);
  assert.doesNotMatch(markdown, /<script|<\/textarea>|\nclick/);
});

test('empty and disconnected scans state the lack of evidence without inventing arrows', () => {
  const empty: StackGraph = { nodes: [], edges: [], warnings: ['The source scan could not read one file.'] };
  for (const output of [generateStackGraphHtml(empty), generateStackGraphMarkdown(empty)]) {
    assert.match(output, /No graph nodes/);
    assert.match(output, /No relationship evidence/);
    assert.match(output, /source scan could not read one file/);
  }
  const disconnected = { ...graph(), edges: [] };
  assert.doesNotMatch(generateStackGraphMermaid(disconnected), /-->/);
  assert.match(generateStackGraphHtml(disconnected), /No relationship evidence found/);
});

test('large graphs retain every node and evidence item without truncation', () => {
  const large: StackGraph = { nodes: [], edges: [], warnings: [] };
  for (let index = 0; index < 120; index++) {
    large.nodes.push({ id: `node-${index}`, label: `Module ${index}`, role: 'module', scope: 'packages/app' });
    if (index) large.edges.push({ from: 'node-0', to: `node-${index}`, label: 'imports', evidence: [{ file: `src/module-${index}.ts`, line: index, kind: 'import', detail: 'Imports local module' }] });
  }
  const html = generateStackGraphHtml(large);
  assert.equal((html.match(/id="stack-evidence-\d+"/g) ?? []).length, 119);
  assert.equal((html.match(/class="graph-node"/g) ?? []).length, 120);
  assert.match(html, /src\/module-119\.ts:119/);
  assert.equal((generateStackGraphMermaid(large).match(/ -->/g) ?? []).length, 119);
});
