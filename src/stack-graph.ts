import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fg from 'fast-glob';
import ts from 'typescript';
import { SAFE_IGNORE_LIST, localeIndependentCompare as compare } from './scanner.js';
import type { ProjectInfo } from './detector.js';
import type { TechEntry } from './generator/techstack.js';

export interface StackNode {
  id: string;
  label: string;
  role: 'frontend' | 'backend' | 'data' | 'external' | 'tools' | 'module';
  scope: string;
  techId?: string;
}

export interface StackEvidence {
  file: string;
  line: number;
  kind: 'import' | 'route' | 'request' | 'provider' | 'manifest';
  detail: string;
}

export interface StackEdge {
  from: string;
  to: string;
  label: string;
  evidence: StackEvidence[];
}

export interface StackGraph {
  nodes: StackNode[];
  edges: StackEdge[];
  warnings: string[];
}

type Definition = TechEntry & { npm?: string[]; composer?: string[] };
type Source = { file: string; scope: string; text: string; role: StackNode['role'] };
type HttpSite = { source: Source; method: string; route: string; offset: number };
const SOURCE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.vue', '.svelte', '.php', '.prisma'];
const MAX_FILES = 5000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

function safePath(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '?');
}

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (text[i] === '\n') line++;
  return line;
}

function techRole(tech: TechEntry): StackNode['role'] {
  if (tech.category === 'Frontend') return 'frontend';
  if (tech.category === 'Backend') return 'backend';
  if (tech.category === 'Database/ORM') return 'data';
  if (tech.category === 'DevOps/Tools' || tech.category === 'Testing') return 'tools';
  return 'module';
}

// Mask rather than delete so evidence offsets never include source values.
function maskLiterals(text: string, php = false): { code: string; literals: Map<number, string>; incomplete: boolean } {
  const chars = text.split('');
  const literals = new Map<number, string>();
  let incomplete = false;
  const blank = (start: number, end: number) => {
    for (let j = start; j < end; j++) if (chars[j] !== '\n' && chars[j] !== '\r') chars[j] = ' ';
  };
  let active = !php;
  for (let i = 0; i < text.length;) {
    if (!active) {
      const start = text.indexOf('<?', i);
      if (start < 0) { blank(i, text.length); break; }
      blank(i, start + 2);
      i = start + 2;
      if (text.slice(i, i + 3).toLowerCase() === 'php') { blank(i, i + 3); i += 3; }
      active = true;
      continue;
    }
    if (php && text.startsWith('?>', i)) {
      blank(i, i + 2); i += 2; active = false; continue;
    }
    if (text.startsWith('//', i) || (php && text[i] === '#' && text[i + 1] !== '[')) {
      const end = text.indexOf('\n', i);
      blank(i, end < 0 ? text.length : end); i = end < 0 ? text.length : end; continue;
    }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      incomplete ||= end < 0;
      const stop = end < 0 ? text.length : end + 2;
      blank(i, stop); i = stop; continue;
    }
    if (php && text.startsWith('<<<', i)) {
      const header = /^<<<[ \t]*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?[ \t]*\r?\n/.exec(text.slice(i));
      if (!header) { blank(i, text.length); incomplete = true; break; }
      const ending = new RegExp(`^[ \\t]*${header[1]}(?=[^A-Za-z0-9_]|$)`, 'm');
      const rest = text.slice(i + header[0].length);
      const match = ending.exec(rest);
      const stop = match ? i + header[0].length + match.index + match[0].length : text.length;
      incomplete ||= !match;
      blank(i, stop); i = stop; continue;
    }
    if (text[i] === '"' || text[i] === "'" || text[i] === '`') {
      const start = i++;
      const quote = text[start];
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') i++;
        i++;
      }
      const closed = i < text.length;
      incomplete ||= !closed;
      if (closed && quote === '"' && !text.slice(start + 1, i).includes('\\')) {
        literals.set(start, text.slice(start + 1, i));
      }
      if (closed) i++;
      blank(start, i); continue;
    }
    i++;
  }
  return { code: chars.join(''), literals, incomplete };
}

function scriptText(source: Source): string {
  if (!/\.(vue|svelte)$/.test(source.file)) return source.text;
  const result = source.text.replace(/[^\r\n]/g, ' ').split('');
  const uncommented = source.text.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\r\n]/g, ' '));
  for (const match of uncommented.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const start = match.index! + match[0].indexOf('>') + 1;
    for (let i = 0; i < match[1].length; i++) result[start + i] = match[1][i];
  }
  return result.join('');
}

export async function analyzeStackGraph(projectInfo: ProjectInfo, technologies: TechEntry[]): Promise<StackGraph> {
  const root = fs.realpathSync(path.resolve(projectInfo.rootPath));
  if (root === path.parse(root).root || root === fs.realpathSync(os.homedir())) {
    throw new Error('Refusing to analyze a filesystem root or home directory.');
  }
  const warnings = new Set<string>([
    'Static source evidence only: imports and provider declarations do not prove runtime traffic or deployment.',
    'Only JS/TS, Vue/Svelte script blocks, Laravel namespace/facade references and literal Prisma providers are analyzed. Tests, generated files, secrets and symlinks are excluded.',
    'Package imports match registry package IDs and their subpaths only. Relative imports require an unambiguous scanned file; workspace package resolution and tsconfig aliases are not followed.',
    'HTTP matching supports only unshadowed fetch calls and direct Express app routes with exact literal method/path in one manifest scope. Routers, mounts, aliases, dynamic paths and other route frameworks are not resolved.',
  ]);
  const nodes = new Map<string, StackNode>();
  const edges = new Map<string, StackEdge>();
  const definitions = technologies as Definition[];
  const byId = new Map(definitions.map((tech) => [tech.id, tech]));
  const files = (await fg(['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,vue,svelte,php,prisma}', '**/package.json', '**/composer.json'], {
    cwd: root, dot: true, onlyFiles: true, objectMode: true, followSymbolicLinks: false,
    ignore: [...SAFE_IGNORE_LIST, '**/.env*/**', '**/tests/**', '**/test/**', '**/__tests__/**',
      '**/fixtures/**', '**/__fixtures__/**', '**/*.test.*', '**/*.spec.*', '**/*.d.ts',
      '**/generated/**', '**/.output/**', '**/*.min.js', '**/credentials*', '**/*service-account*',
      '**/*secret*', '**/secrets*/**'],
  })).filter((entry) => !entry.dirent.isSymbolicLink()).map((entry) => entry.path.replace(/\\/g, '/')).sort(compare);
  if (files.length > MAX_FILES) warnings.add(`File limit reached: only the first ${MAX_FILES} sorted allowlisted files were analyzed.`);
  const contents = new Map<string, string>();
  let totalBytes = 0;
  for (const file of files.slice(0, MAX_FILES)) {
    try {
      let current = root;
      let linked = false;
      for (const segment of file.split('/')) {
        current = path.join(current, segment);
        if (fs.lstatSync(current).isSymbolicLink()) { linked = true; break; }
      }
      if (linked) { warnings.add('Symlinked files or directories were skipped.'); continue; }
      const actual = fs.realpathSync(current);
      const relative = path.relative(root, actual);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        warnings.add('Files resolving outside the project were skipped.'); continue;
      }
      const size = fs.statSync(actual).size;
      if (size > MAX_FILE_BYTES) { warnings.add(`File exceeds 512 KiB and was skipped: ${safePath(file)}`); continue; }
      if (totalBytes + size > MAX_TOTAL_BYTES) { warnings.add('Source read limit of 32 MiB reached; remaining files were skipped.'); break; }
      totalBytes += size;
      contents.set(file, fs.readFileSync(actual, 'utf8'));
    } catch {
      warnings.add(`File could not be read safely and was skipped: ${safePath(file)}`);
    }
  }
  const scopes = [...new Set(['.', ...files.filter((file) => /(^|\/)(package|composer)\.json$/.test(file))
    .map((file) => path.posix.dirname(file))])].sort((a, b) => b.length - a.length || compare(a, b));
  const scopeOf = (file: string) => scopes.find((scope) => scope === '.' || file.startsWith(`${scope}/`))!;
  const technology = (id: string, scope: string): string | undefined => {
    const tech = byId.get(id);
    if (!tech) return undefined;
    const key = `tech:${scope}:${id}`;
    nodes.set(key, { id: key, label: tech.name, role: techRole(tech), scope: safePath(scope), techId: id });
    return key;
  };
  const moduleNode = (source: Source): string => {
    const id = `source:${source.file}`;
    nodes.set(id, { id, label: safePath(source.file), role: source.role, scope: safePath(source.scope) });
    return id;
  };
  const evidence = (source: Source, offset: number, kind: StackEvidence['kind'], detail: string): StackEvidence =>
    ({ file: safePath(source.file), line: lineAt(source.text, offset), kind, detail });
  const connect = (from: string, to: string | undefined, label: string, proof: StackEvidence[]) => {
    if (!to || from === to) return;
    const key = JSON.stringify([from, to, label]);
    const edge = edges.get(key) ?? { from, to, label, evidence: [] };
    for (const item of proof) if (!edge.evidence.some((old) => JSON.stringify(old) === JSON.stringify(item))) edge.evidence.push(item);
    edges.set(key, edge);
  };
  const matchNpm = (specifier: string): Definition[] => definitions.filter((tech) =>
    tech.npm?.some((name) => specifier === name || specifier.startsWith(`${name}/`)));
  for (const [file, text] of contents) {
    if (!/(^|\/)(package|composer)\.json$/.test(file)) continue;
    try {
      const manifest: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error();
      const composer = file.endsWith('composer.json');
      const packages = new Set<string>();
      for (const section of composer ? ['require', 'require-dev'] : ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        const values = (manifest as Record<string, unknown>)[section];
        if (values && typeof values === 'object' && !Array.isArray(values)) Object.keys(values).forEach((key) => packages.add(key));
      }
      for (const tech of definitions) {
        if ((composer ? tech.composer : tech.npm)?.some((name) => name.endsWith('*')
          ? [...packages].some((pkg) => pkg.startsWith(name.slice(0, -1))) : packages.has(name))) {
          technology(tech.id, scopeOf(file));
        }
      }
    } catch { warnings.add(`Invalid manifest was not analyzed: ${safePath(file)}`); }
  }
  const sources = new Map<string, Source>();
  for (const [file, text] of contents) {
    if (!SOURCE_EXTENSIONS.includes(path.posix.extname(file))) continue;
    const tools = /(^|\/)(?:config|scripts|tools|\.github)(\/|$)|(?:^|\/)[^/]*config\.[^/]+$/.test(file);
    sources.set(file, { file, text, scope: scopeOf(file), role: tools ? 'tools' : file.endsWith('.php') ? 'backend' : 'module' });
  }
  const routes: HttpSite[] = [];
  const requests: HttpSite[] = [];
  const uncertainRouteScopes = new Set<string>();
  const literalPath = (value: string | undefined): value is string => !!value && /^\/[A-Za-z0-9._~/-]*$/.test(value) && !value.startsWith('//');
  for (const source of sources.values()) {
    const { file, text, scope } = source;
    if (file.endsWith('.prisma')) {
      const masked = maskLiterals(text);
      if (masked.incomplete) { warnings.add(`Unterminated Prisma syntax was skipped: ${safePath(file)}`); continue; }
      const providers: Record<string, string> = { postgresql: 'postgresql', mysql: 'mysql', sqlite: 'sqlite', mongodb: 'mongodb' };
      for (const block of masked.code.matchAll(/\bdatasource\s+[A-Za-z_]\w*\s*\{([^{}]*)\}/g)) {
        const start = block.index! + block[0].indexOf('{') + 1;
        const assignment = /\bprovider\s*=/.exec(block[1]);
        if (!assignment) continue;
        let offset = start + assignment.index + assignment[0].length;
        while (offset < text.length && /\s/.test(text[offset])) offset++;
        const provider = masked.literals.get(offset);
        const id = provider && Object.hasOwn(providers, provider) ? providers[provider] : undefined;
        if (!id) { warnings.add(`Nonliteral or unsupported Prisma provider omitted: ${safePath(file)}`); continue; }
        const prisma = technology('prisma', scope);
        if (prisma) connect(prisma, technology(id, scope), 'provider', [evidence(source, start + assignment.index, 'provider', 'Prisma datasource declares a literal database provider.')]);
      }
      continue;
    }
    if (file.endsWith('.php')) {
      const masked = maskLiterals(text, true);
      if (masked.incomplete) { warnings.add(`Unterminated PHP syntax was skipped: ${safePath(file)}`); continue; }
      const aliases = new Set<string>();
      const namespaces: [string, string][] = [
        ['Illuminate\\', 'laravel'], ['Laravel\\Sanctum\\', 'sanctum'], ['Livewire\\', 'livewire'],
        ['Filament\\', 'filament'], ['Inertia\\', 'inertia'], ['Symfony\\', 'symfony'], ['Doctrine\\', 'doctrine'],
      ];
      for (const match of masked.code.matchAll(/\buse\s+\\?([A-Za-z_]\w*(?:\\[A-Za-z_]\w*)+)(?:\s+as\s+([A-Za-z_]\w*))?\s*;/g)) {
        const name = match[1];
        const id = namespaces.find(([prefix]) => name.startsWith(prefix))?.[1];
        if (id && byId.has(id)) connect(moduleNode(source), technology(id, scope), 'imports', [evidence(source, match.index!, 'import', 'PHP namespace reference.')]);
        if (name === 'Illuminate\\Support\\Facades\\DB') aliases.add(match[2] ?? 'DB');
      }
      for (const match of masked.code.matchAll(/(?:\\?Illuminate\\Support\\Facades\\DB|[A-Za-z_]\w*)\s*::\s*([A-Za-z_]\w*)\s*\(/g)) {
        if (match.index! > 0 && /[\w\\$]/.test(masked.code[match.index! - 1])) continue;
        const receiver = match[0].split('::')[0].trim();
        if (!aliases.has(receiver) && receiver.replace(/^\\/, '') !== 'Illuminate\\Support\\Facades\\DB') continue;
        if (!['connection', 'table', 'select', 'selectOne', 'scalar', 'insert', 'update', 'delete', 'statement', 'unprepared', 'transaction', 'beginTransaction', 'commit', 'rollBack', 'raw'].includes(match[1])) continue;
        const id = `database:${scope}`;
        nodes.set(id, { id, label: 'Database access (vendor unspecified)', role: 'data', scope: safePath(scope) });
        connect(moduleNode(source), id, 'uses database facade', [evidence(source, match.index!, 'request', 'Explicit Laravel DB facade call; database vendor is not inferred.')]);
      }
      if (/\buse\s+[^;]*\{|\bRoute\s*::/.test(masked.code)) warnings.add(`PHP grouped imports or route declarations are not resolved: ${safePath(file)}`);
      continue;
    }
    const script = scriptText(source);
    const ast = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true,
      /\.(?:jsx|tsx)$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    if ((ast as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) {
      warnings.add(`Source with unsupported or invalid syntax was skipped: ${safePath(file)}`); continue;
    }
    const imports: { specifier: string; offset: number; typeOnly: boolean }[] = [];
    const expressNames = new Set<string>();
    const declarations = new Map<string, number>();
    const countBinding = (name: ts.BindingName) => {
      if (ts.isIdentifier(name)) declarations.set(name.text, (declarations.get(name.text) ?? 0) + 1);
      else for (const element of name.elements) if (ts.isBindingElement(element)) countBinding(element.name);
    };
    const visit = (node: ts.Node) => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        if (ts.isIdentifier(node.left)) countBinding(node.left);
        else if (ts.isPropertyAccessExpression(node.left) && ts.isIdentifier(node.left.expression)) countBinding(node.left.expression);
      }
      if (ts.isVariableDeclaration(node) || ts.isParameter(node)) countBinding(node.name);
      if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node)
        || ts.isClassExpression(node) || ts.isEnumDeclaration(node)) && node.name) countBinding(node.name);
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const named = clause?.namedBindings;
        const typeOnly = !!clause?.isTypeOnly || !!(!clause?.name && named && ts.isNamedImports(named)
          && named.elements.length && named.elements.every((binding) => binding.isTypeOnly));
        imports.push({ specifier: node.moduleSpecifier.text, offset: node.getStart(ast), typeOnly });
        if (clause?.name) {
          countBinding(clause.name);
          if (node.moduleSpecifier.text === 'express' && !clause.isTypeOnly) expressNames.add(clause.name.text);
        }
        if (clause?.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) countBinding(clause.namedBindings.name);
          else for (const binding of clause.namedBindings.elements) countBinding(binding.name);
        }
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const named = node.exportClause;
        const typeOnly = node.isTypeOnly || !!(named && ts.isNamedExports(named)
          && named.elements.length && named.elements.every((binding) => binding.isTypeOnly));
        imports.push({ specifier: node.moduleSpecifier.text, offset: node.getStart(ast), typeOnly });
      }
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
        && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) {
        countBinding(node.name);
        imports.push({ specifier: node.moduleReference.expression.text, offset: node.getStart(ast), typeOnly: node.isTypeOnly });
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    const apps = new Set<string>();
    for (const statement of ast.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (ts.isIdentifier(declaration.name) && init && ts.isCallExpression(init) && ts.isIdentifier(init.expression)
          && expressNames.has(init.expression.text) && declarations.get(init.expression.text) === 1
          && declarations.get(declaration.name.text) === 1 && init.arguments.length === 0) apps.add(declaration.name.text);
      }
    }
    const calls = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const target = node.expression;
        const argument = node.arguments[0];
        const literal = argument && ts.isStringLiteralLike(argument) ? argument.text : undefined;
        if (target.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(target) && target.text === 'require' && !declarations.has('require'))) {
          if (literal) imports.push({ specifier: literal, offset: node.getStart(ast), typeOnly: false });
          else warnings.add(`Dynamic module specifier omitted: ${safePath(file)}`);
        }
        if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression)
          && apps.has(target.expression.text) && ['use', 'all', 'route'].includes(target.name.text)) {
          uncertainRouteScopes.add(scope);
          warnings.add(`HTTP matching omitted for a scope with Express middleware, mounts or chained routes: ${safePath(scope)}`);
        }
        if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression) && apps.has(target.expression.text)
          && ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(target.name.text)) {
          if (literalPath(literal) && node.arguments.length > 1 && ts.isExpressionStatement(node.parent) && node.parent.parent === ast) {
            routes.push({ source, method: target.name.text.toUpperCase(), route: literal, offset: node.getStart(ast) });
            if (source.role !== 'tools') source.role = 'backend';
          } else {
            uncertainRouteScopes.add(scope);
            warnings.add(`Unsupported Express route omitted: ${safePath(file)}`);
          }
        }
        if (ts.isIdentifier(target) && target.text === 'fetch') {
          let method: string | undefined = node.arguments.length === 1 ? 'GET' : undefined;
          const options = node.arguments[1];
          if (options && node.arguments.length === 2 && ts.isObjectLiteralExpression(options)) {
            method = 'GET';
            for (const property of options.properties) {
              if (!ts.isPropertyAssignment(property)) { method = undefined; break; }
              const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : undefined;
              if (!name) { method = undefined; break; }
              if (name === 'method') method = ts.isStringLiteralLike(property.initializer) ? property.initializer.text.toUpperCase() : undefined;
            }
          }
          if (!declarations.has('fetch') && literalPath(literal) && method && source.role !== 'tools') {
            requests.push({ source, method, route: literal, offset: node.getStart(ast) });
          } else warnings.add(`HTTP request omitted: a static unshadowed local fetch method/path is required (${safePath(file)}).`);
        }
      }
      ts.forEachChild(node, calls);
    };
    calls(ast);
    if (source.role === 'module') {
      const importedRoles = imports.flatMap((item) => matchNpm(item.specifier)).map(techRole);
      if (importedRoles.includes('frontend') || /\.(vue|svelte|jsx|tsx)$/.test(file)) source.role = 'frontend';
      else if (importedRoles.includes('backend')) source.role = 'backend';
    }
    for (const item of imports) {
      const proof = evidence(source, item.offset, 'import', item.typeOnly ? 'Type-only source import; not a runtime call.' : 'Source module reference; not a runtime call.');
      if (item.specifier.startsWith('.')) {
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), item.specifier));
        const candidates = [base, ...SOURCE_EXTENSIONS.map((extension) => base + extension),
          ...SOURCE_EXTENSIONS.map((extension) => `${base}/index${extension}`)];
        if (/\.[cm]?js$/.test(base)) candidates.push(base.replace(/\.js$/, '.ts').replace(/\.mjs$/, '.mts').replace(/\.cjs$/, '.cts'), base.replace(/\.js$/, '.tsx'));
        const found = [...new Set(candidates.filter((candidate) => sources.has(candidate)))];
        if (found.length === 1) connect(moduleNode(source), moduleNode(sources.get(found[0])!), item.typeOnly ? 'imports types' : 'imports', [proof]);
        else warnings.add(`Unresolved or ambiguous relative import omitted: ${safePath(file)}:${proof.line}`);
      } else {
        for (const tech of matchNpm(item.specifier)) connect(moduleNode(source), technology(tech.id, scope), item.typeOnly ? 'imports types' : 'imports', [proof]);
      }
    }
  }
  for (const request of requests) {
    const matches = routes.filter((route) => route.source.scope === request.source.scope && route.method === request.method && route.route === request.route && route.source.role !== 'tools');
    if (matches.length !== 1 || uncertainRouteScopes.has(request.source.scope)) {
      warnings.add(`HTTP request omitted: no unique same-scope supported route (${safePath(request.source.file)}:${lineAt(request.source.text, request.offset)}).`);
      continue;
    }
    const route = matches[0];
    connect(moduleNode(request.source), moduleNode(route.source), 'requests matched route', [
      evidence(request.source, request.offset, 'request', 'Static HTTP method/path matches one supported route in this manifest scope.'),
      evidence(route.source, route.offset, 'route', 'Direct Express application route declaration.'),
    ]);
  }
  for (const source of sources.values()) {
    const node = nodes.get(`source:${source.file}`);
    if (node) node.role = source.role;
  }
  return {
    nodes: [...nodes.values()].sort((a, b) => compare(a.id, b.id)),
    edges: [...edges.values()].map((edge) => ({ ...edge, evidence: edge.evidence.sort((a, b) =>
      compare(a.file, b.file) || a.line - b.line || compare(a.kind, b.kind) || compare(a.detail, b.detail)) }))
      .sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to) || compare(a.label, b.label)),
    warnings: [...warnings].sort(compare),
  };
}
