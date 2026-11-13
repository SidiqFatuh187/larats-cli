import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fg from 'fast-glob';
import type { ProjectInfo } from '../detector.js';
import { SAFE_IGNORE_LIST, localeIndependentCompare } from '../scanner.js';
import type { StackGraph } from '../stack-graph.js';
import { generateStackGraphHtml, generateStackGraphMarkdown } from './stack-diagram.js';

export type TechCategory = 'Language' | 'Backend' | 'Frontend' | 'Database/ORM' | 'DevOps/Tools' | 'Testing';

export interface TechEntry {
  id: string;
  name: string;
  category: TechCategory;
  color: string;
  logo: string;
}

interface TechDefinition extends TechEntry {
  npm?: string[];
  composer?: string[];
  extensions?: string[];
  markers?: RegExp;
}

const CATEGORIES: TechCategory[] = ['Language', 'Backend', 'Frontend', 'Database/ORM', 'DevOps/Tools', 'Testing'];

function compareTech(a: TechEntry, b: TechEntry): number {
  return CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category)
    || localeIndependentCompare(a.name, b.name)
    || localeIndependentCompare(a.id, b.id);
}

const definitions: TechDefinition[] = [
  { id: 'c', name: 'C', category: 'Language', color: 'A8B9CC', logo: 'c', extensions: ['.c', '.h'] },
  { id: 'cpp', name: 'C++', category: 'Language', color: '00599C', logo: 'cplusplus', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx'] },
  { id: 'csharp', name: 'C#', category: 'Language', color: '512BD4', logo: '', extensions: ['.cs'] },
  { id: 'css', name: 'CSS', category: 'Language', color: '663399', logo: 'css', extensions: ['.css'] },
  { id: 'dart', name: 'Dart', category: 'Language', color: '0175C2', logo: 'dart', extensions: ['.dart'] },
  { id: 'elixir', name: 'Elixir', category: 'Language', color: '4B275F', logo: 'elixir', extensions: ['.ex', '.exs'] },
  { id: 'go', name: 'Go', category: 'Language', color: '00ADD8', logo: 'go', extensions: ['.go'], markers: /(^|\/)go\.mod$/ },
  { id: 'html', name: 'HTML', category: 'Language', color: 'E34F26', logo: 'html5', extensions: ['.html', '.htm'] },
  { id: 'java', name: 'Java', category: 'Language', color: 'ED8B00', logo: '', extensions: ['.java'] },
  { id: 'javascript', name: 'JavaScript', category: 'Language', color: 'F7DF1E', logo: 'javascript', extensions: ['.js', '.jsx', '.mjs', '.cjs'] },
  { id: 'kotlin', name: 'Kotlin', category: 'Language', color: '7F52FF', logo: 'kotlin', extensions: ['.kt', '.kts'] },
  { id: 'php', name: 'PHP', category: 'Language', color: '777BB4', logo: 'php', composer: ['php'], extensions: ['.php'] },
  { id: 'python', name: 'Python', category: 'Language', color: '3776AB', logo: 'python', extensions: ['.py', '.pyi'] },
  { id: 'ruby', name: 'Ruby', category: 'Language', color: 'CC342D', logo: 'ruby', extensions: ['.rb'], markers: /(^|\/)Gemfile$/ },
  { id: 'rust', name: 'Rust', category: 'Language', color: '000000', logo: 'rust', extensions: ['.rs'], markers: /(^|\/)Cargo\.toml$/ },
  { id: 'swift', name: 'Swift', category: 'Language', color: 'F05138', logo: 'swift', extensions: ['.swift'] },
  { id: 'typescript', name: 'TypeScript', category: 'Language', color: '3178C6', logo: 'typescript', npm: ['typescript'], extensions: ['.ts', '.tsx', '.mts', '.cts'], markers: /(^|\/)tsconfig(?:\.[^/]+)?\.json$/ },
  { id: 'adonisjs', name: 'AdonisJS', category: 'Backend', color: '5A45FF', logo: 'adonisjs', npm: ['@adonisjs/core'] },
  { id: 'django', name: 'Django', category: 'Backend', color: '092E20', logo: 'django', markers: /(^|\/)manage\.py$/ },
  { id: 'express', name: 'Express', category: 'Backend', color: '000000', logo: 'express', npm: ['express'] },
  { id: 'fastify', name: 'Fastify', category: 'Backend', color: '000000', logo: 'fastify', npm: ['fastify'] },
  { id: 'filament', name: 'Filament', category: 'Backend', color: 'FDAE4B', logo: 'filament', composer: ['filament/*'] },
  { id: 'hono', name: 'Hono', category: 'Backend', color: 'E36002', logo: 'hono', npm: ['hono'] },
  { id: 'laravel', name: 'Laravel', category: 'Backend', color: 'FF2D20', logo: 'laravel', composer: ['laravel/framework'], markers: /(^|\/)artisan$/ },
  { id: 'livewire', name: 'Livewire', category: 'Backend', color: '4E56A6', logo: 'livewire', composer: ['livewire/livewire'] },
  { id: 'nestjs', name: 'NestJS', category: 'Backend', color: 'E0234E', logo: 'nestjs', npm: ['@nestjs/core'] },
  { id: 'nodejs', name: 'Node.js', category: 'Backend', color: '5FA04E', logo: 'nodedotjs', markers: /(^|\/)package\.json$/ },
  { id: 'sanctum', name: 'Sanctum', category: 'Backend', color: 'FF2D20', logo: 'laravel', composer: ['laravel/sanctum'] },
  { id: 'symfony', name: 'Symfony', category: 'Backend', color: '000000', logo: 'symfony', composer: ['symfony/framework-bundle'] },
  { id: 'alpinejs', name: 'Alpine.js', category: 'Frontend', color: '8BC0D0', logo: 'alpinedotjs', npm: ['alpinejs'] },
  { id: 'angular', name: 'Angular', category: 'Frontend', color: '0F0F11', logo: 'angular', npm: ['@angular/core'] },
  { id: 'astro', name: 'Astro', category: 'Frontend', color: 'BC52EE', logo: 'astro', npm: ['astro'], extensions: ['.astro'] },
  { id: 'bootstrap', name: 'Bootstrap', category: 'Frontend', color: '7952B3', logo: 'bootstrap', npm: ['bootstrap'] },
  { id: 'inertia', name: 'Inertia', category: 'Frontend', color: '9553E9', logo: 'inertia', npm: ['@inertiajs/react', '@inertiajs/vue3', '@inertiajs/svelte'], composer: ['inertiajs/inertia-laravel'] },
  { id: 'nextjs', name: 'Next.js', category: 'Frontend', color: '000000', logo: 'nextdotjs', npm: ['next'] },
  { id: 'nuxt', name: 'Nuxt', category: 'Frontend', color: '00DC82', logo: 'nuxt', npm: ['nuxt'] },
  { id: 'react', name: 'React', category: 'Frontend', color: '61DAFB', logo: 'react', npm: ['react'] },
  { id: 'solidjs', name: 'SolidJS', category: 'Frontend', color: '2C4F7C', logo: 'solid', npm: ['solid-js'] },
  { id: 'svelte', name: 'Svelte', category: 'Frontend', color: 'FF3E00', logo: 'svelte', npm: ['svelte'], extensions: ['.svelte'] },
  { id: 'sveltekit', name: 'SvelteKit', category: 'Frontend', color: 'FF3E00', logo: 'svelte', npm: ['@sveltejs/kit'] },
  { id: 'tailwindcss', name: 'Tailwind CSS', category: 'Frontend', color: '06B6D4', logo: 'tailwindcss', npm: ['tailwindcss', '@tailwindcss/vite', '@tailwindcss/postcss'], markers: /(^|\/)tailwind\.config\.[cm]?[jt]s$/ },
  { id: 'vue', name: 'Vue', category: 'Frontend', color: '4FC08D', logo: 'vuedotjs', npm: ['vue'], extensions: ['.vue'] },
  { id: 'doctrine', name: 'Doctrine', category: 'Database/ORM', color: 'FC6A31', logo: 'doctrine', composer: ['doctrine/orm', 'doctrine/dbal'] },
  { id: 'drizzle', name: 'Drizzle', category: 'Database/ORM', color: 'C5F74F', logo: 'drizzle', npm: ['drizzle-orm', 'drizzle-kit'] },
  { id: 'knex', name: 'Knex', category: 'Database/ORM', color: 'D26B38', logo: 'knexdotjs', npm: ['knex'] },
  { id: 'mariadb', name: 'MariaDB', category: 'Database/ORM', color: '003545', logo: 'mariadb', npm: ['mariadb'] },
  { id: 'mongodb', name: 'MongoDB', category: 'Database/ORM', color: '47A248', logo: 'mongodb', npm: ['mongodb', 'mongoose'], composer: ['mongodb/mongodb', 'ext-mongodb'] },
  { id: 'mysql', name: 'MySQL', category: 'Database/ORM', color: '4479A1', logo: 'mysql', npm: ['mysql', 'mysql2'], composer: ['ext-mysqli', 'ext-pdo_mysql'] },
  { id: 'postgresql', name: 'PostgreSQL', category: 'Database/ORM', color: '4169E1', logo: 'postgresql', npm: ['pg', 'postgres', '@neondatabase/serverless'], composer: ['ext-pgsql', 'ext-pdo_pgsql'] },
  { id: 'prisma', name: 'Prisma', category: 'Database/ORM', color: '2D3748', logo: 'prisma', npm: ['prisma', '@prisma/client'], extensions: ['.prisma'] },
  { id: 'redis', name: 'Redis', category: 'Database/ORM', color: 'FF4438', logo: 'redis', npm: ['redis', 'ioredis'], composer: ['predis/predis', 'ext-redis'] },
  { id: 'sequelize', name: 'Sequelize', category: 'Database/ORM', color: '52B0E7', logo: 'sequelize', npm: ['sequelize'] },
  { id: 'sqlite', name: 'SQLite', category: 'Database/ORM', color: '003B57', logo: 'sqlite', npm: ['sqlite3', 'better-sqlite3', '@libsql/client'], composer: ['ext-sqlite3', 'ext-pdo_sqlite'] },
  { id: 'typeorm', name: 'TypeORM', category: 'Database/ORM', color: 'FE0803', logo: 'typeorm', npm: ['typeorm'] },
  { id: 'composer', name: 'Composer', category: 'DevOps/Tools', color: '885630', logo: 'composer', markers: /(^|\/)composer\.json$/ },
  { id: 'docker', name: 'Docker', category: 'DevOps/Tools', color: '2496ED', logo: 'docker', markers: /(^|\/)(?:Dockerfile(?:\.[^/]+)?|[^/]+\.Dockerfile|(?:docker-)?compose(?:\.[^/]+)?\.ya?ml)$/i },
  { id: 'docker-compose', name: 'Docker Compose', category: 'DevOps/Tools', color: '2496ED', logo: 'docker', markers: /(^|\/)(?:docker-)?compose(?:\.[^/]+)?\.ya?ml$/i },
  { id: 'eslint', name: 'ESLint', category: 'DevOps/Tools', color: '4B32C3', logo: 'eslint', npm: ['eslint'], markers: /(^|\/)(?:eslint\.config\.[cm]?[jt]s|\.eslintrc(?:\.[^/]+)?)$/ },
  { id: 'esbuild', name: 'esbuild', category: 'DevOps/Tools', color: 'FFCF00', logo: 'esbuild', npm: ['esbuild'] },
  { id: 'git', name: 'Git', category: 'DevOps/Tools', color: 'F05032', logo: 'git' },
  { id: 'github-actions', name: 'GitHub Actions', category: 'DevOps/Tools', color: '2088FF', logo: 'githubactions', markers: /^\.github\/workflows\/[^/]+\.ya?ml$/i },
  { id: 'make', name: 'Make', category: 'DevOps/Tools', color: '6D00CC', logo: 'gnumake', markers: /(^|\/)(?:GNUmakefile|[Mm]akefile)$/ },
  { id: 'nginx', name: 'Nginx', category: 'DevOps/Tools', color: '009639', logo: 'nginx', markers: /(^|\/)nginx\.conf$/ },
  { id: 'pnpm', name: 'pnpm', category: 'DevOps/Tools', color: 'F69220', logo: 'pnpm', markers: /(^|\/)pnpm-workspace\.yaml$/ },
  { id: 'prettier', name: 'Prettier', category: 'DevOps/Tools', color: 'F7B93E', logo: 'prettier', npm: ['prettier'], markers: /(^|\/)(?:\.prettierrc(?:\.[^/]+)?|prettier\.config\.[cm]?[jt]s)$/ },
  { id: 'rollup', name: 'Rollup', category: 'DevOps/Tools', color: 'EC4A3F', logo: 'rollupdotjs', npm: ['rollup'] },
  { id: 'turborepo', name: 'Turborepo', category: 'DevOps/Tools', color: 'EF4444', logo: 'turborepo', npm: ['turbo'], markers: /(^|\/)turbo\.json$/ },
  { id: 'vite', name: 'Vite', category: 'DevOps/Tools', color: '646CFF', logo: 'vite', npm: ['vite'], markers: /(^|\/)vite\.config\.[cm]?[jt]s$/ },
  { id: 'webpack', name: 'Webpack', category: 'DevOps/Tools', color: '8DD6F9', logo: 'webpack', npm: ['webpack'], markers: /(^|\/)webpack\.config\.[cm]?[jt]s$/ },
  { id: 'codeception', name: 'Codeception', category: 'Testing', color: 'F28F1C', logo: 'codeception', composer: ['codeception/codeception'] },
  { id: 'cypress', name: 'Cypress', category: 'Testing', color: '69D3A7', logo: 'cypress', npm: ['cypress'] },
  { id: 'jest', name: 'Jest', category: 'Testing', color: 'C21325', logo: 'jest', npm: ['jest'] },
  { id: 'mocha', name: 'Mocha', category: 'Testing', color: '8D6748', logo: 'mocha', npm: ['mocha'] },
  { id: 'pest', name: 'Pest', category: 'Testing', color: 'F472B6', logo: '', composer: ['pestphp/pest'] },
  { id: 'phpunit', name: 'PHPUnit', category: 'Testing', color: '3C9CD7', logo: '', composer: ['phpunit/phpunit'], markers: /(^|\/)phpunit\.xml(?:\.dist)?$/ },
  { id: 'playwright', name: 'Playwright', category: 'Testing', color: '2EAD33', logo: '', npm: ['@playwright/test', 'playwright'] },
  { id: 'testing-library', name: 'Testing Library', category: 'Testing', color: 'E33332', logo: 'testinglibrary', npm: ['@testing-library/react', '@testing-library/vue', '@testing-library/svelte', '@testing-library/dom'] },
  { id: 'vitest', name: 'Vitest', category: 'Testing', color: '6E9F18', logo: 'vitest', npm: ['vitest'], markers: /(^|\/)vitest\.config\.[cm]?[jt]s$/ },
];
definitions.sort(compareTech);

export const TECH_REGISTRY: TechEntry[] = definitions;

function readDependencies(root: string, relative: string): string[] {
  const parts = relative.split('/');
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) return [];
  }
  const actual = fs.realpathSync(current);
  const fromRoot = path.relative(root, actual);
  if (fromRoot.startsWith(`..${path.sep}`) || fromRoot === '..' || path.isAbsolute(fromRoot)) return [];

  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(actual, 'utf-8').replace(/^\uFEFF/, ''));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in ${relative}. Fix the manifest and retry.`);
    throw error;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Invalid manifest ${relative}: expected a JSON object.`);
  }
  const sections = path.basename(relative) === 'composer.json'
    ? ['require', 'require-dev']
    : ['dependencies', 'devDependencies', 'optionalDependencies'];
  const dependencies: string[] = [];
  for (const section of sections) {
    const value = (data as Record<string, unknown>)[section];
    if (value === undefined) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.values(value).some((version) => typeof version !== 'string')) {
      throw new Error(`Invalid manifest ${relative}: "${section}" must be an object of dependency names and version strings.`);
    }
    dependencies.push(...Object.keys(value));
  }
  return dependencies;
}

function matchesDependency(signals: string[] | undefined, dependencies: Set<string>): boolean {
  for (const signal of signals ?? []) {
    if (!signal.endsWith('*')) {
      if (dependencies.has(signal)) return true;
      continue;
    }
    const prefix = signal.slice(0, -1);
    for (const dependency of dependencies) {
      if (dependency.startsWith(prefix)) return true;
    }
  }
  return false;
}

export async function detectTechStack(projectInfo: ProjectInfo): Promise<TechEntry[]> {
  const resolvedRoot = path.resolve(projectInfo.rootPath);
  const root = fs.realpathSync(resolvedRoot);
  if ([resolvedRoot, root].some((directory) => directory === path.parse(directory).root || directory === os.homedir())) {
    throw new Error(`Refusing to scan system drive or home directory root directly: "${resolvedRoot}".`);
  }
  const files = (await fg('**/*', {
    cwd: root,
    ignore: [...SAFE_IGNORE_LIST, '**/.env*/**'],
    dot: true,
    onlyFiles: true,
    objectMode: true,
    followSymbolicLinks: false,
  })).filter((entry) => !entry.dirent.isSymbolicLink())
    .map((entry) => entry.path.replace(/\\/g, '/')).sort(localeIndependentCompare);
  const npm = new Set<string>();
  const composer = new Set<string>();
  const extensions = new Set<string>();
  for (const file of files) {
    extensions.add(path.posix.extname(file).toLowerCase());
    const basename = path.posix.basename(file);
    if (basename === 'package.json' || basename === 'composer.json') {
      const target = basename === 'package.json' ? npm : composer;
      for (const dependency of readDependencies(root, file)) target.add(dependency);
    }
  }
  let hasGit = false;
  try {
    const marker = fs.lstatSync(path.join(root, '.git'));
    hasGit = marker.isDirectory() || marker.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return definitions.filter((tech) => (tech.id === 'git' && hasGit)
    || matchesDependency(tech.npm, npm)
    || matchesDependency(tech.composer, composer)
    || tech.extensions?.some((extension) => extensions.has(extension))
    || (tech.markers && files.some((file) => tech.markers!.test(file))));
}

function encodeUrlPart(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function badgeUrl(tech: TechEntry): string {
  const label = encodeUrlPart(tech.name.replace(/-/g, '--').replace(/_/g, '__'));
  const logo = tech.logo ? `&logo=${encodeUrlPart(tech.logo)}&logoColor=white` : '';
  return `https://img.shields.io/badge/${label}-%20-${encodeUrlPart(tech.color.replace(/^#/, ''))}?labelColor=333333${logo}`;
}

function badge(tech: TechEntry): string {
  const alt = tech.name.replace(/[\r\n]+/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\[\]]/g, '\\$&');
  return `![${alt}](${badgeUrl(tech)})`;
}

export function generateTechStackMarkdown(techs: TechEntry[], flat = false, graph?: StackGraph): string {
  const unique = [...new Map(techs.map((tech) => [tech.id, tech])).values()].sort(compareTech);
  const lines = ['## Tech Stack', '', '<!-- Badges render via external requests to shields.io (and its logo provider). -->', ''];
  if (unique.length === 0) lines.push('No technologies detected.', '');
  else if (flat) lines.push(unique.map(badge).join(' '), '');
  else {
    for (const category of CATEGORIES) {
      const entries = unique.filter((tech) => tech.category === category);
      if (entries.length) lines.push(`### ${category}`, '', entries.map(badge).join(' '), '');
    }
  }
  if (graph) lines.push(generateStackGraphMarkdown(graph));
  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function generateTechStackHtml(techs: TechEntry[], flat = false, graph?: StackGraph): string {
  const unique = [...new Map(techs.map((tech) => [tech.id, tech])).values()].sort(compareTech);
  const renderBadges = (entries: TechEntry[]): string => `<ul class="badges">${entries.map((tech) =>
    `<li><img src="${escapeHtml(badgeUrl(tech))}" alt="" width="180" height="24"><span>${escapeHtml(tech.name)}</span></li>`
  ).join('')}</ul>`;
  const preview = unique.length === 0
    ? '<p>No technologies detected. Run larats stack again to choose technologies.</p>'
    : flat
      ? renderBadges(unique)
      : CATEGORIES.map((category) => {
        const entries = unique.filter((tech) => tech.category === category);
        return entries.length ? `<div><h3>${escapeHtml(category)}</h3>\n${renderBadges(entries)}</div>` : '';
      }).filter(Boolean).join('\n');
  const graphPanel = graph
    ? `<section aria-labelledby="architecture"><h2 id="architecture">Architecture relationships</h2>${generateStackGraphHtml(graph, new Map(unique.map((tech) => [tech.id, badgeUrl(tech)])))}</section>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LaraTS Tech Stack Preview</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f6f8f7; color: #172b2a; font: 1rem/1.6 system-ui, sans-serif; }
    main { max-width: 90rem; margin: auto; padding: clamp(1rem, 4vw, 3rem); overflow-wrap: anywhere; }
    h1 { margin: 0; font-size: clamp(1.75rem, 5vw, 2.5rem); line-height: 1.2; }
    h2 { font-size: 1.4rem; line-height: 1.3; }
    h3 { margin: 1.5rem 0 .75rem; font-size: 1rem; }
    section { margin-top: clamp(2rem, 5vw, 3.5rem); min-width: 0; }
    header p, #diagram-help, #copy-help { max-width: 75ch; color: #425b57; }
    a { color: #0f766e; }
    a, summary { cursor: pointer; }
    a:hover, summary:hover { text-decoration: underline; }
    a:active, summary:active { color: #172b2a; }
    :focus-visible { outline: 3px solid #0f766e; outline-offset: 4px; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    .diagram-container { position: relative; margin-top: 1rem; }
    .diagram-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; padding: .5rem .75rem; background: #ffffff; border: 1px solid #cbd5d1; border-bottom: none; border-radius: 6px 6px 0 0; }
    .toolbar-group { display: flex; align-items: center; gap: .35rem; }
    .toolbar-label { font-size: .75rem; font-weight: 600; color: #425b57; text-transform: uppercase; margin-right: .25rem; }
    .tool-btn { display: inline-flex; align-items: center; padding: .25rem .6rem; border: 1px solid #cbd5d1; border-radius: 4px; background: #f6f8f7; color: #172b2a; font-size: .8rem; font-weight: 500; cursor: pointer; user-select: none; transition: background .15s ease, border-color .15s ease, color .15s ease; }
    .tool-btn:hover { background: #e6f2ef; border-color: #0f766e; color: #0f766e; }
    #zoom-80:checked ~ .diagram-toolbar label[for="zoom-80"],
    #zoom-100:checked ~ .diagram-toolbar label[for="zoom-100"],
    #zoom-125:checked ~ .diagram-toolbar label[for="zoom-125"],
    #zoom-150:checked ~ .diagram-toolbar label[for="zoom-150"] { background: #0f766e; border-color: #0f766e; color: #ffffff; }
    #zoom-80:checked ~ .diagram-scroll svg { transform: scale(0.8); transform-origin: top left; }
    #zoom-100:checked ~ .diagram-scroll svg { transform: scale(1); transform-origin: top left; }
    #zoom-125:checked ~ .diagram-scroll svg { transform: scale(1.25); transform-origin: top left; }
    #zoom-150:checked ~ .diagram-scroll svg { transform: scale(1.5); transform-origin: top left; }
    .expand-icon-close { display: none; }
    #diag-expand:checked ~ .diagram-toolbar .expand-icon-open { display: none; }
    #diag-expand:checked ~ .diagram-toolbar .expand-icon-close { display: inline; }
    #diag-expand:checked ~ .diagram-toolbar .expand-btn { background: #0f766e; border-color: #0f766e; color: #ffffff; }
    #diag-expand:checked ~ .diagram-scroll { position: fixed; top: 4rem; left: 1rem; right: 1rem; bottom: 1rem; width: calc(100vw - 2rem); height: calc(100vh - 5rem); max-height: none; z-index: 9999; border: 2px solid #0f766e; border-radius: 6px; box-shadow: 0 16px 48px rgba(0,0,0,0.22); }
    #diag-expand:checked ~ .diagram-toolbar { position: fixed; top: 1rem; left: 1rem; right: 1rem; z-index: 10000; border: 2px solid #0f766e; border-bottom: 1px solid #cbd5d1; border-radius: 6px 6px 0 0; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
    .diagram-container, .diagram-scroll, .diagram-scroll svg, .diagram-toolbar { user-select: none; -webkit-user-select: none; }
    .diagram-scroll { width: 100%; height: 38rem; max-height: 75vh; overflow: auto; resize: both; border: 1px solid #cbd5d1; border-radius: 0 0 6px 6px; background: #ffffff; cursor: grab; scroll-behavior: smooth; scrollbar-gutter: stable; }
    .diagram-scroll:active { cursor: grabbing; }
    .diagram-scroll svg { display: block; max-width: none; font-family: system-ui, sans-serif; transition: transform .15s ease-out; }
    .scope-box { fill: #f6f8f7; stroke: #cbd5d1; }
    .graph-node { fill: #ffffff; stroke: #cbd5d1; stroke-width: 1.5; }
    .tool-node { stroke-dasharray: 5 3; }
    .lane-label, .scope-label, .node-label { fill: #172b2a; font-size: 13px; font-weight: 600; }
    .node-meta { fill: #425b57; font-size: 11px; }
    .relationship { fill: none; stroke: #0f766e; stroke-width: 1.5; }
    .edge-label-box { fill: #ffffff; stroke: #cbd5d1; stroke-width: 1; }
    .edge-label { fill: #0f766e; font-size: 11px; font-weight: 500; }
    svg a:hover .edge-label-box, svg a:focus-visible .edge-label-box { fill: #e6f2ef; stroke: #0f766e; stroke-width: 1.5; }
    .evidence-list > li { margin: 1.25rem 0; padding-left: .25rem; scroll-margin-top: 1rem; }
    .evidence-list p { margin-bottom: .35rem; }
    .evidence-list ul { padding-left: 1.25rem; }
    .evidence-list li:target { background: #e6f2ef; }
    code { font-size: .9em; }
    details { border-top: 1px solid #cbd5d1; margin-top: 1.5rem; }
    summary { padding: .75rem 0; min-height: 44px; font-weight: 600; }
    aside { padding: .5rem 1rem; margin-top: 1.5rem; border: 1px solid #71847e; }
    .badges { display: flex; flex-wrap: wrap; gap: 1rem 1.5rem; padding: 0; list-style: none; }
    .badges li { display: flex; flex-direction: column; gap: .25rem; width: 180px; max-width: 100%; }
    .badges img { max-width: 100%; object-fit: contain; object-position: left; }
    .badges span { font-size: .875rem; }
    label { display: block; font-weight: 600; margin-bottom: .5rem; }
    textarea { display: block; width: 100%; min-height: 18rem; padding: 1rem; resize: vertical;
      border: 1px solid #71847e; border-radius: 4px; background: #ffffff; color: #172b2a; font: 1rem/1.5 ui-monospace, monospace; }
    @media (min-width: 48rem) { .inventory { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0 2rem; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Tech stack</h1>
      <p>Detected technologies and the source references that connect them.</p>
    </header>
    <section aria-labelledby="preview">
      <h2 id="preview">Technology inventory</h2>
      <div class="inventory">${preview}</div>
      <p>Badge images load from shields.io and its logo provider. Technology names and the architecture diagram remain visible offline.</p>
    </section>
    ${graphPanel}
    <section aria-labelledby="snippet">
      <h2 id="snippet">Copy into your README</h2>
      <p id="copy-help">Focus the field to select the snippet, then press Ctrl+C (Cmd+C on Mac), or use your device's copy menu. Your README is not changed automatically.</p>
      <label for="markdown">Generated Markdown</label>
      <textarea id="markdown" readonly spellcheck="false" aria-describedby="copy-help" onfocus="this.select()">${escapeHtml(generateTechStackMarkdown(unique, flat, graph))}</textarea>
    </section>
  </main>
  ${graph ? `<script>
    (function() {
      const svg = document.querySelector('.diagram-scroll svg');
      if (!svg) return;
      let dragType = null, activeId = null;
      let startMouseX = 0, startMouseY = 0;
      let nodeStartCurX = 0, nodeStartCurY = 0;
      let pillStartDx = 0, pillStartDy = 0;
      let didDrag = false;
      const nodes = new Map();
      svg.querySelectorAll('.graph-node-group').forEach(el => {
        const id = el.getAttribute('data-id');
        const x = parseFloat(el.getAttribute('data-x'));
        const y = parseFloat(el.getAttribute('data-y'));
        const w = parseFloat(el.getAttribute('data-w'));
        const h = parseFloat(el.getAttribute('data-h'));
        nodes.set(id, { initialX: x, initialY: y, curX: x, curY: y, w, h, el });
      });
      const edges = [];
      const labelOffsets = new Map();
      svg.querySelectorAll('path.relationship').forEach(path => {
        const from = path.getAttribute('data-from');
        const to = path.getAttribute('data-to');
        const idx = parseInt(path.getAttribute('data-edge-idx'), 10);
        const outIdx = parseInt(path.getAttribute('data-out-idx') || '0', 10);
        const totalOut = parseInt(path.getAttribute('data-total-out') || '1', 10);
        const inIdx = parseInt(path.getAttribute('data-in-idx') || '0', 10);
        const totalIn = parseInt(path.getAttribute('data-total-in') || '1', 10);
        const link = svg.querySelector('a.edge-label-link[data-edge-idx="' + idx + '"]');
        const box = link ? link.querySelector('.edge-label-box') : null;
        const text = link ? link.querySelector('.edge-label') : null;
        labelOffsets.set(idx, { dx: 0, dy: 0 });
        edges.push({ path, from, to, idx, outIdx, totalOut, inIdx, totalIn, box, text });
      });
      function updateEdge(e) {
        const from = nodes.get(e.from), to = nodes.get(e.to);
        if (!from || !to) return;
        const fx = from.curX, fy = from.curY, tx = to.curX, ty = to.curY;
        let sx, sy, ex, ey, pathStr, mx, my;
        if (tx > fx) {
          sx = fx + from.w;
          sy = fy + from.h * (e.totalOut === 1 ? 0.5 : 0.2 + 0.6 * (e.outIdx / Math.max(1, e.totalOut - 1)));
          ex = tx;
          ey = ty + to.h * (e.totalIn === 1 ? 0.5 : 0.2 + 0.6 * (e.inIdx / Math.max(1, e.totalIn - 1)));
          const dx = Math.max(45, (ex - sx) * 0.45);
          pathStr = 'M ' + sx + ' ' + sy + ' C ' + (sx + dx) + ' ' + sy + ', ' + (ex - dx) + ' ' + ey + ', ' + ex + ' ' + ey;
          const isAdj = (tx - fx) <= (from.w + 220);
          const t = isAdj ? (e.totalOut === 1 ? 0.5 : 0.22 + 0.56 * (e.outIdx / Math.max(1, e.totalOut - 1))) : (0.16 + 0.12 * (e.outIdx % 3));
          const cx1 = sx + dx, cy1 = sy, cx2 = ex - dx, cy2 = ey, mt = 1 - t;
          mx = mt * mt * mt * sx + 3 * mt * mt * t * cx1 + 3 * mt * t * t * cx2 + t * t * t * ex;
          my = mt * mt * mt * sy + 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t * t * t * ey;
        } else if (Math.abs(tx - fx) < 15) {
          sx = fx + from.w;
          sy = fy + from.h * (e.totalOut === 1 ? 0.5 : 0.2 + 0.6 * (e.outIdx / Math.max(1, e.totalOut - 1)));
          ex = tx + to.w;
          ey = ty + to.h * (e.totalIn === 1 ? 0.5 : 0.2 + 0.6 * (e.inIdx / Math.max(1, e.totalIn - 1)));
          const dist = Math.abs(ey - sy);
          const arc = 45 + Math.min(80, dist * 0.15) + (e.outIdx % 4) * 20;
          pathStr = 'M ' + sx + ' ' + sy + ' C ' + (sx + arc) + ' ' + sy + ', ' + (sx + arc) + ' ' + ey + ', ' + ex + ' ' + ey;
          mx = sx + arc;
          my = (sy + ey) / 2;
        } else {
          sx = fx;
          sy = fy + from.h * 0.75;
          ex = tx + to.w;
          ey = ty + to.h * 0.75;
          const bottom = Math.max(fy + from.h, ty + to.h) + 32 + (e.idx % 3) * 16;
          pathStr = 'M ' + sx + ' ' + sy + ' C ' + (sx - 35) + ' ' + bottom + ', ' + (ex + 35) + ' ' + bottom + ', ' + ex + ' ' + ey;
          mx = (sx + ex) / 2;
          my = bottom;
        }
        e.path.setAttribute('d', pathStr);
        if (e.box && e.text) {
          const offset = labelOffsets.get(e.idx) || { dx: 0, dy: 0 };
          const finalMx = mx + offset.dx;
          const finalMy = my + offset.dy;
          const bw = parseFloat(e.box.getAttribute('width'));
          const bh = parseFloat(e.box.getAttribute('height'));
          e.box.setAttribute('x', finalMx - bw / 2);
          e.box.setAttribute('y', finalMy - bh / 2);
          e.text.setAttribute('x', finalMx);
          e.text.setAttribute('y', finalMy + 4);
          let tether = svg.querySelector('line.edge-tether[data-edge-idx="' + e.idx + '"]');
          if (Math.hypot(offset.dx, offset.dy) > 12) {
            if (!tether) {
              tether = document.createElementNS('http://www.w3.org/2000/svg', 'line');
              tether.setAttribute('class', 'edge-tether');
              tether.setAttribute('data-edge-idx', e.idx);
              tether.setAttribute('stroke', '#0f766e');
              tether.setAttribute('stroke-width', '1.2');
              tether.setAttribute('stroke-dasharray', '3 2');
              tether.setAttribute('opacity', '0.6');
              tether.setAttribute('pointer-events', 'none');
              svg.insertBefore(tether, svg.querySelector('path.relationship'));
            }
            tether.setAttribute('x1', mx);
            tether.setAttribute('y1', my);
            tether.setAttribute('x2', finalMx);
            tether.setAttribute('y2', finalMy);
            tether.style.display = '';
          } else if (tether) {
            tether.style.display = 'none';
          }
        }
      }
      svg.addEventListener('mousedown', function(evt) {
        const pillLink = evt.target.closest('a.edge-label-link');
        if (pillLink) {
          dragType = 'pill';
          activeId = parseInt(pillLink.getAttribute('data-edge-idx'), 10);
          startMouseX = evt.clientX;
          startMouseY = evt.clientY;
          const curOffset = labelOffsets.get(activeId) || { dx: 0, dy: 0 };
          pillStartDx = curOffset.dx;
          pillStartDy = curOffset.dy;
          didDrag = false;
          pillLink.parentElement.appendChild(pillLink);
          document.body.style.cursor = 'grabbing';
          evt.preventDefault();
          return;
        }
        const group = evt.target.closest('.graph-node-group');
        if (group) {
          dragType = 'node';
          activeId = group.getAttribute('data-id');
          const pos = nodes.get(activeId);
          if (!pos) return;
          startMouseX = evt.clientX;
          startMouseY = evt.clientY;
          nodeStartCurX = pos.curX;
          nodeStartCurY = pos.curY;
          didDrag = false;
          group.parentElement.appendChild(group);
          document.body.style.cursor = 'grabbing';
          evt.preventDefault();
          return;
        }
      });
      window.addEventListener('mousemove', function(evt) {
        if (!dragType) return;
        const rect = svg.getBoundingClientRect();
        const vb = svg.viewBox.baseVal;
        const scale = (rect.width / (vb && vb.width ? vb.width : rect.width)) || 1;
        const dx = (evt.clientX - startMouseX) / scale;
        const dy = (evt.clientY - startMouseY) / scale;
        if (Math.hypot(dx, dy) > 2) didDrag = true;
        if (dragType === 'node') {
          const pos = nodes.get(activeId);
          if (!pos) return;
          pos.curX = nodeStartCurX + dx;
          pos.curY = nodeStartCurY + dy;
          const totalDx = pos.curX - pos.initialX;
          const totalDy = pos.curY - pos.initialY;
          pos.el.setAttribute('transform', 'translate(' + totalDx + ',' + totalDy + ')');
          for (let i = 0; i < edges.length; i++) {
            if (edges[i].from === activeId || edges[i].to === activeId) {
              updateEdge(edges[i]);
            }
          }
        } else if (dragType === 'pill') {
          const offset = labelOffsets.get(activeId);
          if (offset) {
            offset.dx = Math.max(-140, Math.min(140, pillStartDx + dx));
            offset.dy = Math.max(-90, Math.min(90, pillStartDy + dy));
            const edge = edges.find(function(ed) { return ed.idx === activeId; });
            if (edge) updateEdge(edge);
          }
        }
      });
      window.addEventListener('mouseup', function() {
        if (dragType) {
          dragType = null;
          activeId = null;
          document.body.style.cursor = '';
        }
      });
      svg.addEventListener('click', function(evt) {
        if (didDrag) {
          evt.preventDefault();
          didDrag = false;
        }
      }, true);
      const resetBtn = document.getElementById('reset-layout-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', function() {
          nodes.forEach(function(pos) {
            pos.curX = pos.initialX;
            pos.curY = pos.initialY;
            pos.el.removeAttribute('transform');
          });
          edges.forEach(function(e) {
            labelOffsets.set(e.idx, { dx: 0, dy: 0 });
            const tether = svg.querySelector('line.edge-tether[data-edge-idx="' + e.idx + '"]');
            if (tether) tether.style.display = 'none';
            updateEdge(e);
          });
        });
      }
    })();
  </script>` : ''}
</body>
</html>
`;
}
