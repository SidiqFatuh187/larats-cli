import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { generateAiContext, mergeAiRules, AI_RULES_START_TAG, AI_RULES_END_TAG } from '../src/generator/ai-context.js';
import { checkAndPromptStar } from '../src/index.js';
import type { ScanResult } from '../src/scanner.js';

const CLI_PATH = path.resolve('dist/index.js');

test('generateAiContext formats Laravel rules correctly', () => {
  const scanResult: ScanResult = {
    projectInfo: {
      type: 'laravel',
      name: 'ecommerce-core',
      rootPath: '/dummy',
      summary: 'Laravel 11.0 (Filament, Modular Architecture)',
      laravel: {
        hasFilament: true,
        hasLivewire: false,
        hasInertia: false,
        hasSanctum: true,
        isModular: true,
        modulesDir: 'app/Modules',
      },
    },
    totalFilesScanned: 40,
    components: {},
    modules: ['Order', 'Payment'],
    directoryTree: '',
    scanDurationMs: 10,
  };

  const context = generateAiContext(scanResult);

  assert.match(context, /# Codebase Architecture Rules/);
  assert.match(context, /Modular Domain Architecture/);
  assert.match(context, /app\/Modules\/<FeatureName>\/Controllers/);
  assert.match(context, /app\/Modules\/<FeatureName>\/Services/);
  assert.match(context, /Filament Resources live in/);
  assert.match(context, /Active Feature Modules \(2\)/);
  assert.match(context, /`Order`, `Payment`/);
  assert.match(context, /NEVER place raw queries or database transactions inside Controller files/);
});

test('generateAiContext formats TypeScript rules with ORM and feature modules', () => {
  const scanResult: ScanResult = {
    projectInfo: {
      type: 'typescript',
      name: 'fintech-service',
      rootPath: '/dummy',
      summary: 'TypeScript (express, Prisma, Modular)',
      typescript: {
        framework: 'express',
        hasPrisma: true,
        hasTypeORM: false,
        hasDrizzle: false,
        isMonorepo: false,
        isModular: true,
        srcDir: 'src',
      },
    },
    totalFilesScanned: 25,
    components: {},
    modules: ['billing', 'auth'],
    directoryTree: '',
    scanDurationMs: 8,
  };

  const context = generateAiContext(scanResult);

  assert.match(context, /Feature Module Architecture/);
  assert.match(context, /src\/modules\/<feature>\/<feature>\.controller\.ts/);
  assert.match(context, /src\/modules\/<feature>\/<feature>\.service\.ts/);
  assert.match(context, /Prisma is used for data persistence/);
  assert.match(context, /`billing`, `auth`/);
});

test('mergeAiRules creates and replaces tagged block without touching custom user rules', () => {
  const initialRules = '## Custom User Instructions\nAlways use tabs instead of spaces.\n';
  const aiRules = '# Generated Architecture\nRule 1: Thin controllers.';

  // 1. Initial merge
  const merged = mergeAiRules(initialRules, aiRules);
  assert.match(merged, /## Custom User Instructions/);
  assert.match(merged, /Always use tabs instead of spaces\./);
  assert.match(merged, new RegExp(AI_RULES_START_TAG));
  assert.match(merged, /Rule 1: Thin controllers\./);
  assert.match(merged, new RegExp(AI_RULES_END_TAG));

  // 2. Update existing block with new content
  const updatedAiRules = '# Generated Architecture\nRule 2: Updated services rule.';
  const reMerged = mergeAiRules(merged, updatedAiRules);

  assert.match(reMerged, /## Custom User Instructions/);
  assert.match(reMerged, /Rule 2: Updated services rule\./);
  assert.doesNotMatch(reMerged, /Rule 1: Thin controllers\./);
});

test('checkAndPromptStar triggers once on 3rd run and persists flag', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-star-test-'));
  const statsFile = path.join(tempDir, 'stats.json');

  try {
    // Run 1: runs = 1, no prompt
    await checkAndPromptStar(statsFile, false);
    let stats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
    assert.equal(stats.runs, 1);
    assert.equal(stats.hasPromptedStar, undefined);

    // Run 2: runs = 2, no prompt
    await checkAndPromptStar(statsFile, false);
    stats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
    assert.equal(stats.runs, 2);
    assert.equal(stats.hasPromptedStar, undefined);

    // Run 3: runs = 3, prompts star (user says yes), sets hasPromptedStar = true
    await checkAndPromptStar(statsFile, true);
    stats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
    assert.equal(stats.runs, 3);
    assert.equal(stats.hasPromptedStar, true);

    // Run 4: runs = 4, hasPromptedStar remains true (never prompts again)
    await checkAndPromptStar(statsFile, false);
    stats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
    assert.equal(stats.runs, 4);
    assert.equal(stats.hasPromptedStar, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI: larats ai prints prompt and supports --cursor and --claude injection', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-cli-ai-'));

  try {
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name": "ai-test-app"}');

    // Test --cursor and --claude
    execFileSync(
      process.execPath,
      [CLI_PATH, 'ai', '--cursor', '--claude'],
      { cwd: tempDir, encoding: 'utf-8' }
    );

    assert.ok(fs.existsSync(path.join(tempDir, '.cursorrules')));
    assert.ok(fs.existsSync(path.join(tempDir, 'CLAUDE.md')));

    const cursorContent = fs.readFileSync(path.join(tempDir, '.cursorrules'), 'utf-8');
    assert.match(cursorContent, /# Codebase Architecture Rules/);
    assert.match(cursorContent, /ai-test-app/);

    const claudeContent = fs.readFileSync(path.join(tempDir, 'CLAUDE.md'), 'utf-8');
    assert.match(claudeContent, /# Codebase Architecture Rules/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
