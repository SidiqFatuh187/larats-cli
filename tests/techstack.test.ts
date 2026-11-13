import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProjectInfo } from '../src/detector.js';
import { detectTechStack, generateTechStackHtml, generateTechStackMarkdown, TECH_REGISTRY, type TechEntry } from '../src/generator/techstack.js';
import type { StackGraph } from '../src/stack-graph.js';

function fixture(t: TestContext, files: Record<string, string | object> = {}): ProjectInfo {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-stack-'));
  t.after(() => fs.rmSync(rootPath, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(rootPath, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return { rootPath, name: 'fixture', type: 'unknown', summary: 'Test fixture' };
}

function ids(techs: TechEntry[]): string[] {
  return techs.map((tech) => tech.id);
}

function registered(id: string): TechEntry {
  const entry = TECH_REGISTRY.find((tech) => tech.id === id);
  assert.ok(entry, `Missing technology ${id}`);
  return entry;
}

test('detects Composer and frontend dependencies together even for Laravel projects', async (t) => {
  const project = fixture(t, {
    artisan: '',
    'composer.json': {
      require: {
        php: '^8.3',
        'laravel/framework': '^12',
        'filament/forms': '^4',
        'livewire/livewire': '^3',
        'inertiajs/inertia-laravel': '^2',
        'laravel/sanctum': '^4',
      },
      'require-dev': { 'pestphp/pest': '^3', 'phpunit/phpunit': '^11' },
    },
    'package.json': {
      dependencies: { react: '^19', '@inertiajs/react': '^2', alpinejs: '^3' },
      devDependencies: { vite: '^6', tailwindcss: '^4', vitest: '^3' },
      optionalDependencies: { mysql2: '^3' },
      peerDependencies: { angular: '^1' },
    },
  });
  project.type = 'laravel';
  const detected = ids(await detectTechStack(project));
  for (const id of ['php', 'laravel', 'filament', 'livewire', 'sanctum', 'inertia', 'react', 'alpinejs', 'vite', 'tailwindcss', 'pest', 'phpunit', 'vitest', 'mysql']) {
    assert.ok(detected.includes(id), `Expected ${id}`);
  }
  assert.equal(detected.filter((id) => id === 'inertia').length, 1);
  assert.ok(!detected.includes('typescript'));
});

test('infers JavaScript and TypeScript from source, compiler dependency, and tsconfig rather than historical project type', async (t) => {
  for (const [files, expected] of [
    [{ 'src/main.js': '', 'package.json': { devDependencies: { typescript: '^5' } } }, ['javascript', 'typescript']],
    [{ 'src/main.tsx': '', 'package.json': {} }, ['typescript']],
    [{ 'tsconfig.app.json': '{}' }, ['typescript']],
    [{ 'src/main.cjs': '', 'src/api.mts': '' }, ['javascript', 'typescript']],
    [{ 'package.json': {} }, []],
  ] as [Record<string, string | object>, string[]][]) {
    const project = fixture(t, files);
    project.type = 'typescript';
    const detected = ids(await detectTechStack(project));
    assert.deepEqual(detected.filter((id) => id === 'javascript' || id === 'typescript'), expected);
  }
});

test('detects Docker, Git worktree files, and dot-directory GitHub Actions filenames', async (t) => {
  const project = fixture(t, {
    '.git': 'gitdir: /not-read-or-followed',
    '.github/workflows/ci.yml': 'not parsed',
    Dockerfile: 'not parsed',
    'compose.production.yaml': 'not parsed',
  });
  assert.deepEqual(ids(await detectTechStack(project)), ['docker', 'docker-compose', 'git', 'github-actions']);
});

test('detects build and deployment tools from configuration filenames without parsing them', async (t) => {
  const project = fixture(t, {
    Makefile: 'not parsed',
    'nginx.conf': 'not parsed',
    'tailwind.config.ts': 'not parsed',
    'webpack.config.cjs': 'not parsed',
  });
  assert.deepEqual(ids(await detectTechStack(project)),
    ['javascript', 'typescript', 'tailwindcss', 'make', 'nginx', 'webpack']);
});

test('detects Git directories without scanning their contents', async (t) => {
  const project = fixture(t, { '.git/package.json': '{ invalid JSON', '.git/hooks/example.py': '' });
  assert.deepEqual(ids(await detectTechStack(project)), ['git']);
});

test('excludes secrets, dependencies, generated files, lockfiles, and private dot-directories', async (t) => {
  const project = fixture(t, {
    'vendor/example/composer.json': '{ malformed',
    'node_modules/example/package.json': '{ malformed',
    'secrets/package.json': '{ malformed',
    '.env/package.json': '{ malformed',
    '.aws/package.json': '{ malformed',
    '.ssh/example.py': '',
    'dist/generated.ts': '',
    'storage/example.php': '',
    'build/generated.rs': '',
    '.next/generated.js': '',
    'coverage/generated.go': '',
    'credentials.json': '{ malformed',
    'composer.lock': JSON.stringify({ packages: [{ name: 'laravel/framework' }] }),
    'package-lock.json': JSON.stringify({ packages: { 'node_modules/react': {} } }),
    'pnpm-lock.yaml': 'vite: 6',
    '.env.local': 'DB_CONNECTION=mysql',
  });
  assert.deepEqual(await detectTechStack(project), []);
});

test('does not follow symlinked directories outside the project', async (t) => {
  const project = fixture(t);
  const outside = fixture(t, { 'package.json': '{ malformed', 'example.py': '' });
  try {
    fs.symlinkSync(outside.rootPath, path.join(project.rootPath, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      t.skip('Directory symlinks are unavailable on this system');
      return;
    }
    throw error;
  }
  assert.deepEqual(await detectTechStack(project), []);
});

test('does not read a symlinked root manifest or source file', async (t) => {
  const project = fixture(t);
  const outside = fixture(t, { 'package.json': '{ malformed', 'example.py': '' });
  try {
    fs.symlinkSync(path.join(outside.rootPath, 'package.json'), path.join(project.rootPath, 'package.json'), 'file');
    fs.symlinkSync(path.join(outside.rootPath, 'example.py'), path.join(project.rootPath, 'example.py'), 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      t.skip('File symlinks are unavailable on this system');
      return;
    }
    throw error;
  }
  assert.deepEqual(await detectTechStack(project), []);
});

test('detects polyglot sources and nested npm and Composer manifests in a monorepo', async (t) => {
  const project = fixture(t, {
    'package.json': { workspaces: ['packages/*'], dependencies: { react: '^19' } },
    'packages/web/package.json': { dependencies: { react: '^19', next: '^15', '@prisma/client': '^6', pg: '^8' } },
    'services/api/composer.json': { require: { php: '^8', 'symfony/framework-bundle': '^7', 'doctrine/orm': '^3' } },
    'services/worker/main.py': '',
    'services/worker/lib.rs': '',
    'native/main.cpp': '',
    'native/program.cs': '',
    'mobile/App.swift': '',
    'mobile/main.kt': '',
    'tools/main.go': '',
    'tools/task.ex': '',
    'lib/main.rb': '',
    'lib/App.java': '',
    'mobile/main.dart': '',
  });
  const detected = ids(await detectTechStack(project));
  for (const id of ['react', 'nextjs', 'prisma', 'postgresql', 'php', 'symfony', 'doctrine', 'python', 'rust', 'cpp', 'csharp', 'swift', 'kotlin', 'go', 'elixir', 'ruby', 'java', 'dart']) {
    assert.ok(detected.includes(id), `Expected ${id}`);
  }
  assert.equal(detected.filter((id) => id === 'react').length, 1);
  assert.deepEqual(detected, ids(TECH_REGISTRY).filter((id) => detected.includes(id)));
});

test('does not guess databases from Laravel or ORM dependencies and ignores peer dependencies', async (t) => {
  const project = fixture(t, {
    'composer.json': { require: { 'laravel/framework': '^12', 'doctrine/orm': '^3' } },
    'package.json': {
      dependencies: { prisma: '^6', '@prisma/client': '^6', typeorm: '^0.3', 'drizzle-orm': '^0.4' },
      peerDependencies: { mysql2: '^3', react: '^19' },
    },
  });
  const detected = ids(await detectTechStack(project));
  for (const id of ['mysql', 'mariadb', 'postgresql', 'sqlite', 'mongodb', 'redis', 'react']) {
    assert.ok(!detected.includes(id), `Unexpected ${id}`);
  }
  for (const id of ['laravel', 'doctrine', 'prisma', 'typeorm', 'drizzle']) assert.ok(detected.includes(id));
});

test('accepts BOM-prefixed manifests and Composer database-driver requirements', async (t) => {
  const project = fixture(t, {
    'composer.json': '\uFEFF' + JSON.stringify({ require: { php: '^8', 'ext-pdo_sqlite': '*', 'ext-redis': '*' } }),
  });
  const detected = ids(await detectTechStack(project));
  for (const id of ['php', 'sqlite', 'redis']) assert.ok(detected.includes(id));
});

test('malformed manifests produce actionable errors at the JSON and dependency-section boundaries', async (t) => {
  const cases: [string, string | object, RegExp][] = [
    ['package.json', '{ broken', /Invalid JSON in package\.json.*Fix the manifest/],
    ['composer.json', 'null', /composer\.json.*JSON object/],
    ['package.json', '[]', /package\.json.*JSON object/],
    ['package.json', { dependencies: [] }, /package\.json.*dependencies.*object/],
    ['package.json', { devDependencies: { react: 19 } }, /package\.json.*devDependencies.*version strings/],
    ['package.json', { optionalDependencies: null }, /package\.json.*optionalDependencies.*object/],
    ['composer.json', { require: 'laravel/framework' }, /composer\.json.*require.*object/],
    ['composer.json', { 'require-dev': { 'pestphp/pest': true } }, /composer\.json.*require-dev.*version strings/],
    ['packages/broken/package.json', '{ broken', /packages\/broken\/package\.json/],
  ];
  for (const [filename, content, expected] of cases) {
    const project = fixture(t, { [filename]: content });
    await assert.rejects(detectTechStack(project), expected);
  }
});

test('refuses drive and home roots before scanning', async () => {
  for (const rootPath of [path.parse(process.cwd()).root, os.homedir()]) {
    await assert.rejects(detectTechStack({ rootPath, type: 'unknown', name: 'unsafe', summary: '' }), /Refusing to scan.*root directly/);
  }
});

test('markdown deduplicates and sorts badges into category groups without changing input', () => {
  const entries = [registered('vitest'), registered('react'), registered('php'), registered('react'), registered('laravel')];
  const before = [...entries];
  const markdown = generateTechStackMarkdown(entries);
  assert.match(markdown, /^## Tech Stack\n/);
  assert.match(markdown, /<!-- .*external requests to shields\.io.* -->/);
  assert.deepEqual([...markdown.matchAll(/^### (.+)$/gm)].map((match) => match[1]), ['Language', 'Backend', 'Frontend', 'Testing']);
  assert.equal((markdown.match(/!\[React\]/g) ?? []).length, 1);
  assert.deepEqual(entries, before);
  assert.equal(markdown, generateTechStackMarkdown([...entries].reverse()));
});

test('flat markdown keeps a single badge row and empty output explains the absence of signals', () => {
  const flat = generateTechStackMarkdown([registered('react'), registered('typescript')], true);
  assert.doesNotMatch(flat, /^### /m);
  assert.equal(flat.split('\n').filter((line) => line.startsWith('![')).length, 1);
  assert.ok(flat.indexOf('![TypeScript]') < flat.indexOf('![React]'));
  for (const empty of [generateTechStackMarkdown([]), generateTechStackMarkdown([], true)]) {
    assert.match(empty, /^## Tech Stack\n/);
    assert.match(empty, /No technologies detected\./);
    assert.doesNotMatch(empty, /!\[/);
  }
});

test('Shields labels encode special characters and keep readable text and logos on a dark label', () => {
  const custom: TechEntry = {
    id: 'special', name: 'A_B-C / [x](y)! <tag> &', category: 'Language', color: 'ABCDEF', logo: '',
  };
  const markdown = generateTechStackMarkdown([registered('cpp'), registered('csharp'), registered('javascript'), custom], true);
  assert.match(markdown, /\/badge\/C%2B%2B-%20-00599C\?labelColor=333333&logo=cplusplus&logoColor=white/);
  assert.match(markdown, /\/badge\/C%23-%20-512BD4/);
  assert.match(markdown, /\/badge\/A__B--C%20%2F%20%5Bx%5D%28y%29%21%20%3Ctag%3E%20%26-%20-ABCDEF/);
  assert.ok(markdown.includes('![A_B-C / \\[x\\](y)! &lt;tag&gt; &amp;]'));
  const urls = [...markdown.matchAll(/\]\((https:[^\s)]+)\)/g)].map((match) => match[1]);
  assert.equal(urls.length, 4);
  for (const value of urls) {
    const url = new URL(value);
    assert.equal(url.hostname, 'img.shields.io');
    assert.doesNotMatch(url.pathname, /[\s#\[\]()!]/);
  }
});

function decodeHtml(value: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
  return value.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity: string) => entities[entity]);
}

function previewMarkdown(html: string): string {
  const textarea = html.match(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/);
  assert.ok(textarea, 'Missing Markdown field');
  return decodeHtml(textarea[1]);
}

test('HTML preview groups actual badges, keeps offline labels, and embeds the generated Markdown', () => {
  const entries = [registered('vitest'), registered('react'), registered('php'), registered('react'), registered('laravel')];
  const before = [...entries];
  const html = generateTechStackHtml(entries);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"/);
  assert.deepEqual([...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((match) => match[1]), ['Language', 'Backend', 'Frontend', 'Testing']);
  assert.equal((html.match(/<img /g) ?? []).length, 4);
  assert.equal((html.match(/<span>React<\/span>/g) ?? []).length, 1);
  assert.match(html, /<label for="markdown">Generated Markdown<\/label>/);
  assert.match(html, /<textarea id="markdown" readonly[^>]*aria-describedby="copy-help"/);
  assert.equal(previewMarkdown(html), generateTechStackMarkdown(entries));
  const badgeUrls = [...html.matchAll(/<img src="([^"]+)"/g)].map((match) => decodeHtml(match[1]));
  const markdownUrls = [...generateTechStackMarkdown(entries).matchAll(/\]\((https:[^\s)]+)\)/g)].map((match) => match[1]);
  assert.deepEqual(badgeUrls, markdownUrls);
  assert.deepEqual(entries, before);
  assert.equal(html, generateTechStackHtml([...entries].reverse()));
});

test('flat and empty HTML previews mirror their Markdown without empty category sections', () => {
  const entries = [registered('react'), registered('typescript')];
  const html = generateTechStackHtml(entries, true);
  assert.doesNotMatch(html, /<h3>/);
  assert.equal((html.match(/<ul class="badges">/g) ?? []).length, 1);
  assert.ok(html.indexOf('<span>TypeScript</span>') < html.indexOf('<span>React</span>'));
  assert.equal(previewMarkdown(html), generateTechStackMarkdown(entries, true));
  for (const flat of [false, true]) {
    const empty = generateTechStackHtml([], flat);
    assert.match(empty, /No technologies detected\. Run larats stack again/);
    assert.doesNotMatch(empty, /<img |<h3>|<ul /);
    assert.equal(previewMarkdown(empty), generateTechStackMarkdown([], flat));
  }
});

test('HTML preview escapes text, image attributes, and textarea closing tags without altering the snippet', () => {
  const custom: TechEntry = {
    id: 'unsafe',
    name: '</textarea><script>alert("x")</script><img src=x onerror="bad"> & \'',
    category: 'Language',
    color: 'ABCDEF" onerror="bad',
    logo: 'x"><script>bad</script>',
  };
  const html = generateTechStackHtml([custom]);
  assert.doesNotMatch(html, /<script>|onerror="bad"|<img src=x/);
  assert.equal((html.match(/<\/textarea>/g) ?? []).length, 1);
  assert.match(html, /<span>&lt;\/textarea&gt;&lt;script&gt;alert\(&quot;x&quot;\)/);
  assert.match(html, /&amp; &#39;<\/span>/);
  assert.match(html, /&amp;logo=x%22%3E%3Cscript%3Ebad%3C%2Fscript%3E/);
  const imageUrl = html.match(/<img src="([^"]+)"/);
  assert.ok(imageUrl);
  assert.equal(new URL(decodeHtml(imageUrl[1])).hostname, 'img.shields.io');
  assert.equal(previewMarkdown(html), generateTechStackMarkdown([custom]));
});

test('graph previews use the same Markdown and preserve flat badge grouping', () => {
  const graph: StackGraph = {
    nodes: [
      { id: 'client', label: 'Client module', role: 'module', scope: 'src/client' },
      { id: 'react', label: 'React', role: 'frontend', scope: '.', techId: 'react' },
    ],
    edges: [{ from: 'client', to: 'react', label: 'imports', evidence: [{ file: 'src/client/App.tsx', line: 7, kind: 'import', detail: 'Imports React' }] }],
    warnings: ['One unsupported file was skipped.'],
  };
  const entries = [registered('react')];
  for (const flat of [false, true]) {
    const markdown = generateTechStackMarkdown(entries, flat, graph);
    const html = generateTechStackHtml(entries, flat, graph);
    assert.equal(previewMarkdown(html), markdown);
    assert.match(markdown, /```mermaid\nflowchart LR/);
    assert.match(html, /<svg /);
    assert.match(html, /<image href="https:\/\/img\.shields\.io\/badge\/React/);
    assert.match(html, /src\/client\/App\.tsx:7/);
    assert.ok(html.indexOf('id="preview"') < html.indexOf('id="architecture"'));
    assert.doesNotMatch(html, /cdn\.jsdelivr|unpkg\.com/);
    if (flat) assert.doesNotMatch(markdown, /^### /m);
  }
});

test('graph data cannot close the snippet textarea or inject active HTML', () => {
  const attack = '</textarea><script>alert(1)</script><img src=x onerror="bad">';
  const graph: StackGraph = {
    nodes: [{ id: attack, label: attack, role: 'module', scope: attack }],
    edges: [{ from: attack, to: attack, label: attack, evidence: [{ file: attack, line: 3, kind: 'import', detail: attack }] }],
    warnings: [attack],
  };
  const html = generateTechStackHtml([], false, graph);
  assert.doesNotMatch(html, /<script>alert\(1\)|<img src=x|onerror="bad"/);
  assert.equal((html.match(/<\/textarea>/g) ?? []).length, 1);
  assert.equal(previewMarkdown(html), generateTechStackMarkdown([], false, graph));
});
