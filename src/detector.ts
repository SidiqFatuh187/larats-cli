import fs from 'node:fs';
import path from 'node:path';

export type ProjectType = 'laravel' | 'typescript' | 'unknown';

export interface LaravelDetails {
  version?: string;
  hasFilament: boolean;
  hasLivewire: boolean;
  hasInertia: boolean;
  hasSanctum: boolean;
  isModular: boolean;
  modulesDir?: string;
}

export interface TypeScriptDetails {
  framework: 'express' | 'nest' | 'fastify' | 'hono' | 'react' | 'next' | 'vue' | 'node-vanilla' | 'unknown';
  hasPrisma: boolean;
  hasTypeORM: boolean;
  hasDrizzle: boolean;
  isMonorepo: boolean;
  isModular: boolean;
  srcDir: string;
  isTypeScript?: boolean;
}

export interface ProjectInfo {
  type: ProjectType;
  name: string;
  rootPath: string;
  laravel?: LaravelDetails;
  typescript?: TypeScriptDetails;
  summary: string;
}

/**
 * Safely parse a JSON file without throwing errors.
 */
function readJsonSafe<T = unknown>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Detect the project type and architectural characteristics of the target directory.
 */
export async function detectProjectType(targetDir: string = process.cwd()): Promise<ProjectInfo> {
  const resolvedDir = path.resolve(targetDir);
  const dirName = path.basename(resolvedDir);

  const hasArtisan = fs.existsSync(path.join(resolvedDir, 'artisan'));
  const composerPath = path.join(resolvedDir, 'composer.json');
  const hasComposer = fs.existsSync(composerPath);

  const tsconfigPath = path.join(resolvedDir, 'tsconfig.json');
  const hasTsConfig = fs.existsSync(tsconfigPath);
  const packageJsonPath = path.join(resolvedDir, 'package.json');
  const hasPackageJson = fs.existsSync(packageJsonPath);

  // 1. Check for Laravel Project
  if (hasArtisan && hasComposer) {
    const composerData = readJsonSafe<{
      name?: string;
      require?: Record<string, string>;
      'require-dev'?: Record<string, string>;
    }>(composerPath);

    const allDeps = {
      ...(composerData?.require || {}),
      ...(composerData?.['require-dev'] || {}),
    };

    const hasFilament = Object.keys(allDeps).some((dep) => dep.startsWith('filament/'));
    const hasLivewire = 'livewire/livewire' in allDeps;
    const hasInertia = 'inertiajs/inertia-laravel' in allDeps;
    const hasSanctum = 'laravel/sanctum' in allDeps;

    const rawVersion = allDeps['laravel/framework'] || '';
    const versionMatch = rawVersion.match(/\d+(?:\.\d+)*/);
    const cleanVersion = versionMatch ? versionMatch[0] : '';

    // Check for modular architecture
    const appModulesDir = path.join(resolvedDir, 'app', 'Modules');
    const rootModulesDir = path.join(resolvedDir, 'modules');
    const rootModulesCapDir = path.join(resolvedDir, 'Modules');
    const isModular =
      fs.existsSync(appModulesDir) ||
      fs.existsSync(rootModulesDir) ||
      fs.existsSync(rootModulesCapDir);
    const modulesDir = fs.existsSync(appModulesDir)
      ? 'app/Modules'
      : fs.existsSync(rootModulesDir)
        ? 'modules'
        : fs.existsSync(rootModulesCapDir)
          ? 'Modules'
          : undefined;

    const extras: string[] = [];
    if (hasFilament) extras.push('Filament');
    if (hasLivewire) extras.push('Livewire');
    if (hasInertia) extras.push('Inertia');
    if (isModular) extras.push('Modular Architecture');

    const summary = `Laravel ${cleanVersion || ''}${extras.length > 0 ? ` (${extras.join(', ')})` : ''}`.trim();

    return {
      type: 'laravel',
      name: composerData?.name?.split('/')[1] || dirName,
      rootPath: resolvedDir,
      laravel: {
        version: cleanVersion || undefined,
        hasFilament,
        hasLivewire,
        hasInertia,
        hasSanctum,
        isModular,
        modulesDir,
      },
      summary,
    };
  }

  // 2. Check for TypeScript or JavaScript (Node.js) Project
  if (hasPackageJson) {
    const pkg = readJsonSafe<{
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      workspaces?: unknown;
    }>(packageJsonPath);

    const allDeps = {
      ...(pkg?.dependencies || {}),
      ...(pkg?.devDependencies || {}),
    };

    let framework: TypeScriptDetails['framework'] = 'unknown';
    if ('@nestjs/core' in allDeps) framework = 'nest';
    else if ('next' in allDeps) framework = 'next';
    else if ('express' in allDeps) framework = 'express';
    else if ('fastify' in allDeps) framework = 'fastify';
    else if ('hono' in allDeps) framework = 'hono';
    else if ('react' in allDeps) framework = 'react';
    else if ('vue' in allDeps) framework = 'vue';
    else framework = 'node-vanilla';

    const hasPrisma = 'prisma' in allDeps || '@prisma/client' in allDeps || fs.existsSync(path.join(resolvedDir, 'prisma'));
    const hasTypeORM = 'typeorm' in allDeps;
    const hasDrizzle = 'drizzle-orm' in allDeps;

    const isMonorepo =
      Boolean(pkg?.workspaces) ||
      fs.existsSync(path.join(resolvedDir, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(resolvedDir, 'turbo.json')) ||
      fs.existsSync(path.join(resolvedDir, 'lerna.json'));

    const hasSrc = fs.existsSync(path.join(resolvedDir, 'src'));
    const srcDir = hasSrc ? 'src' : '.';
    const isModular =
      fs.existsSync(path.join(resolvedDir, srcDir, 'modules')) ||
      fs.existsSync(path.join(resolvedDir, 'modules'));

    const isTypeScript = hasTsConfig || 'typescript' in allDeps;
    const stackLabel = isTypeScript ? 'TypeScript' : 'JavaScript / Node.js';

    const extras: string[] = [framework !== 'node-vanilla' ? framework : stackLabel];
    if (hasPrisma) extras.push('Prisma');
    if (hasTypeORM) extras.push('TypeORM');
    if (hasDrizzle) extras.push('Drizzle');
    if (isMonorepo) extras.push('Monorepo');
    if (isModular) extras.push('Modular');

    const summary = isTypeScript
      ? `TypeScript (${extras.join(', ')})`
      : `JavaScript / Node.js (${extras.join(', ')})`;

    return {
      type: 'typescript',
      name: pkg?.name || dirName,
      rootPath: resolvedDir,
      typescript: {
        framework,
        hasPrisma,
        hasTypeORM,
        hasDrizzle,
        isMonorepo,
        isModular,
        srcDir,
        isTypeScript,
      },
      summary,
    };
  }

  // 3. Fallback / Unknown Project
  let fallbackName = dirName;
  if (hasPackageJson) {
    const pkg = readJsonSafe<{ name?: string }>(packageJsonPath);
    if (pkg?.name) fallbackName = pkg.name;
  }

  return {
    type: 'unknown',
    name: fallbackName,
    rootPath: resolvedDir,
    summary: 'Generic / Unknown Project',
  };
}
