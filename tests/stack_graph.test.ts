import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProjectInfo } from '../src/detector.js';
import { analyzeStackGraph } from '../src/stack-graph.js';
import { TECH_REGISTRY } from '../src/generator/techstack.js';

function fixture(t: TestContext, files: Record<string, string | object>): ProjectInfo {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-graph-'));
  t.after(() => fs.rmSync(rootPath, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(rootPath, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return { rootPath, name: 'fixture', type: 'unknown', summary: 'Graph fixture' };
}

test('connects React, direct Express routes, relative modules and a literal Prisma provider with safe evidence', async (t) => {
  const project = fixture(t, {
    'package.json': { dependencies: { react: '1', express: '1', '@prisma/client': '1' } },
    'src/App.tsx': "import React from 'react';\nimport { value } from './value.js';\nfetch('/api/orders');\nexport const App = () => <div>{value}</div>;",
    'src/value.ts': 'export const value = 1;',
    'src/server.ts': "import express from 'express';\nimport { PrismaClient } from '@prisma/client';\nconst app = express();\napp.get('/api/orders', (_req, res) => res.json([]));",
    'prisma/schema.prisma': 'datasource db {\n provider = "postgresql"\n url = "postgresql://admin:PRIVATE_PASSWORD@host/db"\n}',
    '.env': 'DATABASE_URL=PRIVATE_ENV_VALUE',
  });
  const graph = await analyzeStackGraph(project, TECH_REGISTRY);
  assert.ok(graph.nodes.some((node) => node.techId === 'postgresql'));
  assert.equal(graph.nodes.find((node) => node.id === 'source:src/App.tsx')?.role, 'frontend');
  assert.equal(graph.nodes.find((node) => node.id === 'source:src/server.ts')?.role, 'backend');
  assert.ok(graph.edges.some((edge) => edge.from === 'source:src/App.tsx' && edge.to === 'source:src/value.ts'));
  const http = graph.edges.find((edge) => edge.label === 'requests matched route');
  assert.deepEqual(http?.evidence.map(({ file, line, kind }) => ({ file, line, kind })), [
    { file: 'src/App.tsx', line: 3, kind: 'request' },
    { file: 'src/server.ts', line: 4, kind: 'route' },
  ]);
  assert.equal(graph.edges.find((edge) => edge.label === 'provider')?.evidence[0].line, 2);
  assert.doesNotMatch(JSON.stringify(graph), /PRIVATE_PASSWORD|PRIVATE_ENV_VALUE|postgresql:\/\/|\/api\/orders/);
  assert.deepEqual(await analyzeStackGraph(project, TECH_REGISTRY), graph);
});

test('Laravel namespace and explicit DB evidence never invent a database vendor', async (t) => {
  const project = fixture(t, {
    'composer.json': { require: { 'laravel/framework': '1', 'livewire/livewire': '1' } },
    'app/Orders.php': '<?php\nuse Illuminate\\Support\\Facades\\DB as Database;\nuse Livewire\\Component;\nDatabase::table("private_table");\n',
    'app/Noise.php': '<?php\n// use Filament\\Forms\\Form;\n$text = "use Doctrine\\ORM\\EntityManager; DB::table(123);";\n$body = <<<\'TEXT\'\nuse Symfony\\Component\\Console;\nDB::select(1);\nTEXT;\n',
  });
  const graph = await analyzeStackGraph(project, TECH_REGISTRY);
  assert.ok(graph.edges.some((edge) => edge.to.endsWith(':laravel')));
  assert.ok(graph.edges.some((edge) => edge.to.endsWith(':livewire')));
  assert.ok(graph.edges.some((edge) => edge.label === 'uses database facade'));
  assert.ok(!graph.nodes.some((node) => ['mysql', 'postgresql', 'sqlite', 'filament', 'doctrine', 'symfony'].includes(node.techId ?? '')));
  assert.ok(!graph.nodes.some((node) => node.id === 'source:app/Noise.php'));
  assert.doesNotMatch(JSON.stringify(graph), /private_table/);
});

test('keeps nested manifest scopes separate and manifest-only technologies disconnected', async (t) => {
  const project = fixture(t, {
    'package.json': { dependencies: { redis: '1' } },
    'packages/web/package.json': { dependencies: { react: '1' } },
    'packages/web/main.tsx': "import React from 'react'; fetch('/orders');",
    'packages/api/package.json': { dependencies: { react: '1', express: '1' } },
    'packages/api/server.ts': "import React from 'react'; import express from 'express'; const app = express(); app.get('/orders', () => {});",
  });
  const graph = await analyzeStackGraph(project, TECH_REGISTRY);
  assert.deepEqual(graph.nodes.filter((node) => node.techId === 'react').map((node) => node.scope), ['packages/api', 'packages/web']);
  assert.ok(!graph.edges.some((edge) => edge.label === 'requests matched route'));
  assert.ok(!graph.edges.some((edge) => edge.to === 'tech:.:redis'));
  assert.match(graph.warnings.join('\n'), /no unique same-scope/);
});

test('AST import analysis rejects comments, strings and guessed package namespaces; configs are tools', async (t) => {
  const project = fixture(t, {
    'package.json': {},
    'src/main.ts': '// import React from "react";\nconst sample = "require(\'express\')";\nconst pattern = /require("mysql")/;\nimport { Injectable } from "@nestjs/common";\nimport type { PrismaClient } from "@prisma/client";\nexport { createClient } from "redis";\nimport("vue");\n',
    'vite.config.ts': "import express from 'express'; import { defineConfig } from 'vite';",
    'tests/example.ts': "import mysql from 'mysql';",
    'src/generated/client.ts': "import mysql from 'mysql';",
  });
  const graph = await analyzeStackGraph(project, TECH_REGISTRY);
  assert.ok(!graph.nodes.some((node) => ['react', 'mysql', 'nestjs'].includes(node.techId ?? '')));
  assert.ok(graph.edges.some((edge) => edge.label === 'imports types' && edge.to.endsWith(':prisma')));
  assert.ok(graph.nodes.some((node) => node.techId === 'redis'));
  assert.ok(graph.nodes.some((node) => node.techId === 'vue'));
  assert.equal(graph.nodes.find((node) => node.id === 'source:vite.config.ts')?.role, 'tools');
  assert.ok(graph.edges.every((edge) => edge.evidence.every((proof) => proof.line > 0 && !proof.detail.includes('require('))));
});

test('extracts Vue and Svelte script imports with original line numbers', async (t) => {
  const project = fixture(t, {
    'package.json': {},
    'src/View.vue': '<!-- <script>import express from "express";</script> -->\n<template>import mysql from "mysql";</template>\n<script setup lang="ts">\nimport { ref } from "vue";\n</script>',
    'src/View.svelte': '<script lang="ts">\nimport { onMount } from "svelte";\n</script>\n<p>hello</p>',
  });
  const graph = await analyzeStackGraph(project, TECH_REGISTRY);
  assert.deepEqual(graph.nodes.filter((node) => node.techId).map((node) => node.techId), ['svelte', 'vue']);
  assert.equal(graph.edges.find((edge) => edge.to.endsWith(':vue'))?.evidence[0].line, 4);
});

test('ambiguous, dynamic, external, shadowed and middleware-dependent requests do not become arrows', async (t) => {
  for (const server of [
    "app.get('/orders', () => {}); app.get('/orders', () => {});",
    "app.get('/orders/:id', () => {});",
    "app.get('/orders', () => {}); app.use('/api', router);",
    "app = other; app.get('/orders', () => {});",
  ]) {
    const project = fixture(t, {
      'package.json': {},
      'server.ts': `import express from 'express'; let app = express(); ${server}`,
      'client.ts': "fetch('/orders'); fetch('https://example.test/PRIVATE_TOKEN'); fetch(`/orders/${id}`);",
      'shadow.ts': "function load(fetch: Function) { fetch('/orders'); }",
    });
    const graph = await analyzeStackGraph(project, TECH_REGISTRY);
    assert.ok(!graph.edges.some((edge) => edge.label === 'requests matched route'));
    assert.match(graph.warnings.join('\n'), /HTTP/);
    assert.doesNotMatch(JSON.stringify(graph), /PRIVATE_TOKEN|example\.test/);
  }
});

test('honors secret exclusions, symlinks, generated outputs and oversized sources', async (t) => {
  const project = fixture(t, {
    'package.json': {},
    '.env.local/package.json': { dependencies: { mysql: '1' } },
    'secrets/private.ts': "import redis from 'redis';",
    'credentials.js': "import redis from 'redis';",
    'node_modules/example/index.js': "import mysql from 'mysql';",
    'dist/index.js': "import mysql from 'mysql';",
    'src/oversized.ts': ' '.repeat(512 * 1024 + 1) + "import mysql from 'mysql';",
  });
  const outside = fixture(t, { 'payload.ts': "import React from 'react';", 'package.json': { dependencies: { react: '1' } } });
  fs.symlinkSync(outside.rootPath, path.join(project.rootPath, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const graph = await analyzeStackGraph(project, TECH_REGISTRY);
  assert.deepEqual(graph.nodes, []);
  assert.deepEqual(graph.edges, []);
  assert.match(graph.warnings.join('\n'), /512 KiB/);
});

test('does not infer provider declarations from Prisma strings or comments', async (t) => {
  const project = fixture(t, {
    'schema.prisma': '// datasource fake { provider = "mysql" }\ndatasource db {\nprovider = env("DATABASE_PROVIDER")\nurl = "datasource fake { provider = \\"sqlite\\" }"\n}',
  });
  const graph = await analyzeStackGraph(project, TECH_REGISTRY);
  assert.deepEqual(graph.nodes, []);
  assert.deepEqual(graph.edges, []);
  assert.match(graph.warnings.join('\n'), /Nonliteral or unsupported/);
});

test('rejects home and filesystem root scanning before reading files', async () => {
  for (const rootPath of [os.homedir(), path.parse(process.cwd()).root]) {
    await assert.rejects(analyzeStackGraph({ rootPath, name: 'unsafe', type: 'unknown', summary: '' }, TECH_REGISTRY), /Refusing to analyze/);
  }
});

test('deduplicates equal evidence and keeps named type-only imports truthful', async (t) => {
  const project = fixture(t, {
    'package.json': {},
    'source.ts': "import 'react'; import 'react';\nimport { type PrismaClient } from '@prisma/client';\nexport { type PrismaClient as Client } from '@prisma/client';\nconst local = function require() { require('mysql'); };\nimport './missing';",
  });
  const graph = await analyzeStackGraph(project, TECH_REGISTRY);
  assert.equal(graph.edges.filter((edge) => edge.to.endsWith(':react')).length, 1);
  assert.equal(graph.edges.find((edge) => edge.to.endsWith(':react'))?.evidence.length, 1);
  assert.equal(graph.edges.find((edge) => edge.to.endsWith(':prisma'))?.label, 'imports types');
  assert.equal(graph.edges.find((edge) => edge.to.endsWith(':prisma'))?.evidence.length, 2);
  assert.ok(!graph.nodes.some((node) => node.techId === 'mysql'));
  assert.match(graph.warnings.join('\n'), /Unresolved or ambiguous relative import omitted: source.ts:5/);
});
