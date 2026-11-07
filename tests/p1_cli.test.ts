import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const CLI_PATH = path.resolve('dist/index.js');

test('CLI: --version outputs package version', () => {
  const output = execFileSync(process.execPath, [CLI_PATH, '--version'], { encoding: 'utf-8' });
  assert.match(output, /larats v\d+\.\d+\.\d+/);
});

test('CLI: unknown command exits with code 1 and error message', () => {
  assert.throws(
    () => {
      execFileSync(process.execPath, [CLI_PATH, 'foobar'], { encoding: 'utf-8', stdio: 'pipe' });
    },
    (err: any) => {
      assert.equal(err.status, 1);
      assert.match(err.stderr || err.stdout, /Unknown command "foobar"/);
      return true;
    }
  );
});

test('CLI: arg parsing supports flag before command (larats -o custom.md scan)', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-cli-order-'));

  try {
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export const a = 1;');

    const output = execFileSync(
      process.execPath,
      [CLI_PATH, '--output', 'custom.md', 'scan'],
      { cwd: tempDir, encoding: 'utf-8' }
    );

    assert.ok(fs.existsSync(path.join(tempDir, 'custom.md')));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI: scan --html generates both markdown and HTML architecture files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-cli-html-'));

  try {
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name": "test-html-app"}');

    execFileSync(
      process.execPath,
      [CLI_PATH, 'scan', '--html', '--tree'],
      { cwd: tempDir, encoding: 'utf-8' }
    );

    assert.ok(fs.existsSync(path.join(tempDir, 'ARCHITECTURE.md')));
    assert.ok(fs.existsSync(path.join(tempDir, 'ARCHITECTURE.html')));
    const html = fs.readFileSync(path.join(tempDir, 'ARCHITECTURE.html'), 'utf-8');
    assert.match(html, /LaraTS Architecture: test-html-app/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI: scan refuses to overwrite non-LaraTS files unless --force', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-cli-overwrite-'));

  try {
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name": "my-app"}');

    // Try to scan and overwrite package.json without force
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [CLI_PATH, 'scan', '-o', 'package.json'],
          { cwd: tempDir, encoding: 'utf-8', stdio: 'pipe' }
        );
      },
      (err: any) => {
        assert.equal(err.status, 1);
        // package.json must not have been overwritten
        const content = fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8');
        assert.match(content, /"my-app"/);
        return true;
      }
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI: scan rejects path traversal outside project root', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-cli-trav-'));

  try {
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export const a = 1;');

    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [CLI_PATH, 'scan', '-o', '../../evil.md'],
          { cwd: tempDir, encoding: 'utf-8', stdio: 'pipe' }
        );
      },
      (err: any) => {
        assert.equal(err.status, 1);
        return true;
      }
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI: scaffold in non-TTY without module name exits with code 1', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-cli-nontty-'));

  try {
    assert.throws(
      () => {
        // Run with stdio pipe to simulate non-TTY
        execFileSync(process.execPath, [CLI_PATH, 'scaffold'], {
          cwd: tempDir,
          encoding: 'utf-8',
          stdio: 'pipe',
        });
      },
      (err: any) => {
        assert.equal(err.status, 1);
        return true;
      }
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI: scaffold dry-run writes no files to disk', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-cli-dry-'));

  try {
    const output = execFileSync(
      process.execPath,
      [CLI_PATH, 'scaffold', 'Payment', '--dry-run', '--modular'],
      { cwd: tempDir, encoding: 'utf-8' }
    );

    assert.match(output, /Dry run/);
    assert.equal(fs.existsSync(path.join(tempDir, 'src')), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

