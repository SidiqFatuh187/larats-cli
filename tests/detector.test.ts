import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectProjectType } from '../src/detector.js';

test('detectProjectType identifies Laravel project with Filament and Livewire', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-laravel-'));

  try {
    // Create artisan file
    fs.writeFileSync(path.join(tempDir, 'artisan'), '#!/usr/bin/env php\n<?php\n');

    // Create composer.json
    fs.writeFileSync(
      path.join(tempDir, 'composer.json'),
      JSON.stringify({
        name: 'laravel/sample-app',
        require: {
          'laravel/framework': '^11.0',
          'filament/filament': '^3.2',
          'livewire/livewire': '^3.0',
          'laravel/sanctum': '^4.0',
        },
      })
    );

    const projectInfo = await detectProjectType(tempDir);

    assert.equal(projectInfo.type, 'laravel');
    assert.equal(projectInfo.name, 'sample-app');
    assert.equal(projectInfo.laravel?.hasFilament, true);
    assert.equal(projectInfo.laravel?.hasLivewire, true);
    assert.equal(projectInfo.laravel?.hasSanctum, true);
    assert.match(projectInfo.summary, /Laravel 11\.0/);
    assert.match(projectInfo.summary, /Filament/);
    assert.match(projectInfo.summary, /Livewire/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('detectProjectType identifies TypeScript project with Express and Prisma', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-ts-'));

  try {
    // Create tsconfig.json
    fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');

    // Create package.json
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'sample-backend',
        dependencies: {
          express: '^4.19.2',
          '@prisma/client': '^5.12.0',
        },
        devDependencies: {
          prisma: '^5.12.0',
        },
      })
    );

    // Create src/modules folder
    fs.mkdirSync(path.join(tempDir, 'src', 'modules'), { recursive: true });

    const projectInfo = await detectProjectType(tempDir);

    assert.equal(projectInfo.type, 'typescript');
    assert.equal(projectInfo.name, 'sample-backend');
    assert.equal(projectInfo.typescript?.framework, 'express');
    assert.equal(projectInfo.typescript?.hasPrisma, true);
    assert.equal(projectInfo.typescript?.isModular, true);
    assert.match(projectInfo.summary, /express/);
    assert.match(projectInfo.summary, /Prisma/);
    assert.match(projectInfo.summary, /Modular/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('detectProjectType identifies JavaScript/Node.js project without tsconfig', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-js-'));

  try {
    // Create package.json with fastify and drizzle (no tsconfig)
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'js-fastify-api',
        dependencies: {
          fastify: '^4.26.0',
          'drizzle-orm': '^0.30.0',
        },
      })
    );

    const projectInfo = await detectProjectType(tempDir);

    assert.equal(projectInfo.type, 'typescript');
    assert.equal(projectInfo.name, 'js-fastify-api');
    assert.equal(projectInfo.typescript?.framework, 'fastify');
    assert.equal(projectInfo.typescript?.hasDrizzle, true);
    assert.equal(projectInfo.typescript?.isTypeScript, false);
    assert.match(projectInfo.summary, /JavaScript \/ Node\.js/);
    assert.match(projectInfo.summary, /fastify/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('detectProjectType falls back to unknown for generic folder', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larats-unknown-'));

  try {
    fs.writeFileSync(path.join(tempDir, 'random.txt'), 'hello');

    const projectInfo = await detectProjectType(tempDir);

    assert.equal(projectInfo.type, 'unknown');
    assert.equal(projectInfo.summary, 'Generic / Unknown Project');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
