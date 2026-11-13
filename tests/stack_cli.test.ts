import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const CLI_PATH = path.resolve('dist/index.js');

function project(t: TestContext) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-stack-cli-'));
  const root = path.join(temporary, 'project');
  const home = path.join(temporary, 'home');
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(home, '.larats'), { recursive: true });
  const statsPath = path.join(home, '.larats', 'stats.json');
  const stats = '{"runs":2,"hasPromptedStar":false}';
  fs.writeFileSync(statsPath, stats);
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));

  function run(args: string[] = []) {
    try {
      return execFileSync(process.execPath, [CLI_PATH, 'stack', ...args], {
        cwd: root,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
      });
    } finally {
      assert.equal(fs.readFileSync(statsPath, 'utf-8'), stats, 'stack must not update usage statistics');
    }
  }

  return { root, temporary, run };
}

function fails(run: () => string, message: RegExp) {
  assert.throws(run, (error: unknown) => {
    const failure = error as Error & { status: number; stdout: string; stderr: string };
    assert.equal(failure.status, 1);
    assert.equal(failure.stdout, '', 'errors must not contaminate Markdown stdout');
    assert.match(failure.stderr, message);
    return true;
  });
}

test('CLI stack: empty non-TTY output is pure Markdown and creates no files', (t) => {
  const { root, run } = project(t);
  const markdown = run();
  assert.match(markdown, /^## Tech Stack\r?\n/);
  assert.match(markdown, /No technologies detected\./);
  assert.doesNotMatch(markdown, /Scanning|Enjoying LaraTS|\u001b\[/);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('CLI stack: detects technologies automatically and --flat omits category headings', (t) => {
  const { root, run } = project(t);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'stack-test',
    dependencies: { react: '^19.0.0' },
    devDependencies: { typescript: '^5.0.0' },
  }));
  const grouped = run();
  assert.match(grouped, /^## Tech Stack\r?\n/);
  assert.match(grouped, /### Language/);
  assert.match(grouped, /### Frontend/);
  assert.match(grouped, /React/);
  assert.match(grouped, /TypeScript/);
  const flat = run(['--flat']);
  assert.match(flat, /^## Tech Stack\r?\n/);
  assert.doesNotMatch(flat, /^### /m);
  assert.match(flat, /React/);
  assert.match(flat, /TypeScript/);
  assert.equal(fs.existsSync(path.join(root, 'ARCHITECTURE.md')), false);
});

test('CLI stack: exports source relationships and provider-derived databases without connection secrets', (t) => {
  const { root, run } = project(t);
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'prisma'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    dependencies: { express: '^5', '@prisma/client': '^6' },
  }));
  fs.writeFileSync(path.join(root, 'src/server.ts'),
    "import express from 'express';\nimport { PrismaClient } from '@prisma/client';\nconst app = express();\nconst db = new PrismaClient();\n");
  fs.writeFileSync(path.join(root, 'prisma/schema.prisma'),
    'datasource db {\n  provider = "postgresql"\n  url = "postgresql://private:password@localhost/private"\n}\n');
  fs.writeFileSync(path.join(root, '.env'), 'PRIVATE_TOKEN=never-output-this');
  const markdown = run();
  assert.match(markdown, /```mermaid/);
  assert.match(markdown, /src\/server\.ts/);
  assert.match(markdown, /prisma\/schema\.prisma/);
  assert.match(markdown, /!\[PostgreSQL\]/);
  assert.doesNotMatch(markdown, /private:password|never-output-this/);
});

test('CLI stack: --output creates nested directories without changing README', (t) => {
  const { root, run } = project(t);
  const readme = '# Existing project\n\nKeep this content.\n';
  fs.writeFileSync(path.join(root, 'README.md'), readme);
  assert.equal(run(['--output', 'docs/generated/STACK.md']), '');
  const markdown = fs.readFileSync(path.join(root, 'docs/generated/STACK.md'), 'utf-8');
  assert.match(markdown, /^## Tech Stack\r?\n/);
  assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf-8'), readme);
  assert.equal(fs.existsSync(path.join(root, 'ARCHITECTURE.md')), false);
});

test('CLI stack: refuses existing user and generated files without --force', (t) => {
  const { root, run } = project(t);
  const destination = path.join(root, 'STACK.md');
  fs.writeFileSync(destination, 'Keep me\n');
  fails(() => run(['-o', 'STACK.md']), /already exists.*--force/);
  assert.equal(fs.readFileSync(destination, 'utf-8'), 'Keep me\n');
  run(['-o', 'STACK.md', '--force']);
  const generated = fs.readFileSync(destination, 'utf-8');
  assert.match(generated, /^## Tech Stack\r?\n/);
  fails(() => run(['-o', 'STACK.md']), /already exists.*--force/);
  assert.equal(fs.readFileSync(destination, 'utf-8'), generated);
});

test('CLI stack: --dry-run previews without creating directories, overwriting, or copying', (t) => {
  const { root, run } = project(t);
  fs.writeFileSync(path.join(root, 'STACK.md'), 'Keep me');
  const preview = run(['--dry-run', '--copy', '-o', 'new/nested/STACK.md']);
  assert.match(preview, /^## Tech Stack\r?\n/);
  assert.equal(fs.existsSync(path.join(root, 'new')), false);
  assert.equal(run(['--dry-run', '-o', 'STACK.md', '--force']), preview);
  assert.equal(fs.readFileSync(path.join(root, 'STACK.md'), 'utf-8'), 'Keep me');
});

test('CLI stack: rejects relative and absolute destinations outside the root', (t) => {
  const { root, temporary, run } = project(t);
  const outside = path.join(temporary, 'outside.md');
  fs.writeFileSync(outside, 'Keep outside');
  fails(() => run(['-o', '../outside.md', '--force']), /inside the project root/);
  fails(() => run(['-o', outside, '--force']), /inside the project root/);
  assert.equal(fs.readFileSync(outside, 'utf-8'), 'Keep outside');
  fails(() => run(['-o', root, '--force']), /inside the project root/);
});

test('CLI stack: rejects directory symlink escapes before creating nested files', (t) => {
  const { root, temporary, run } = project(t);
  const outside = path.join(temporary, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  fails(() => run(['-o', 'linked/nested/STACK.md', '--force']), /symlink/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('CLI stack: refuses symlink targets even with --force', (t) => {
  const { root, temporary, run } = project(t);
  const original = path.join(temporary, 'original.md');
  fs.writeFileSync(original, 'Keep original');
  try {
    fs.symlinkSync(original, path.join(root, 'STACK.md'), 'file');
  } catch (error) {
    if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') {
      t.skip('File symlinks require Windows Developer Mode or administrator privileges');
      return;
    }
    throw error;
  }
  fails(() => run(['-o', 'STACK.md', '--force']), /symlink/);
  assert.equal(fs.readFileSync(original, 'utf-8'), 'Keep original');
});

test('CLI stack: invalid manifests fail actionably without writing output', (t) => {
  const { root, run } = project(t);
  for (const manifest of ['package.json', 'composer.json']) {
    fs.writeFileSync(path.join(root, manifest), '{invalid json');
    fails(() => run(['-o', 'STACK.md']), new RegExp(manifest.replace('.', '\\.')));
    assert.equal(fs.existsSync(path.join(root, 'STACK.md')), false);
    fs.unlinkSync(path.join(root, manifest));
  }
});
