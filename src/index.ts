import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { parseArgs } from 'node:util';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { detectProjectType, type ProjectInfo } from './detector.js';
import { scanProject } from './scanner.js';
import {
  generateArchitectureMarkdown,
  generateArchitectureHtml,
  renderTerminalFlow,
} from './generator/markdown.js';
import { generateAiContext, mergeAiRules } from './generator/ai-context.js';
import { copyToClipboard } from './utils/clipboard.js';
import { scaffoldModule, validateModuleName, type ScaffoldResult } from './generator/scaffolder.js';
import { getNaming } from './templates/laravel.js';

declare const __VERSION__: string | undefined;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '1.1.1';

function showHelp() {
  console.log(`
${pc.bold(pc.cyan('LaraTS CLI'))} ${pc.gray(`v${VERSION}`)}
${pc.gray('Smart Architecture Visualizer & Contextual Module Scaffolder')}

${pc.bold('USAGE:')}
  ${pc.cyan('$')} npx larats [command] [options]
  ${pc.cyan('$')} larats [command] [options]

${pc.bold('COMMANDS:')}
  ${pc.green('scan')}                 Scan repository & generate ARCHITECTURE.md
  ${pc.green('view')}, ${pc.green('preview')}          Open interactive architecture diagram in local browser
  ${pc.green('ai')}                   Export architecture context prompt for AI (Cursor, Claude, Copilot)
  ${pc.green('scaffold')}, ${pc.green('make')} [name] Scaffold a new module or feature with clean boilerplate
  ${pc.green('info')}                 Show detected project type & architectural flavor
  ${pc.green('help')}                 Display this help message

${pc.bold('OPTIONS:')}
  ${pc.yellow('-o, --output')} <file>    Output path for scan (default: ARCHITECTURE.md)
  ${pc.yellow('--view')}                 Open local browser viewer immediately after scanning
  ${pc.yellow('--copy')}                 Copy AI architecture context prompt to clipboard
  ${pc.yellow('--cursor')}               Inject architecture rules into .cursorrules
  ${pc.yellow('--claude')}               Inject architecture rules into CLAUDE.md
  ${pc.yellow('-t, --tree')}             Print directory tree in terminal
  ${pc.yellow('--html')}                 Also export standalone ARCHITECTURE.html
  ${pc.yellow('-m, --modular')}          Enforce modular directory structure
  ${pc.yellow('-s, --standard')}         Enforce standard/layered directory structure
  ${pc.yellow('--dry-run')}              Simulate generation without writing files
  ${pc.yellow('-f, --force')}            Overwrite files if they already exist
  ${pc.yellow('-v, --version')}          Display CLI version
  ${pc.yellow('-h, --help')}             Display this help message
${pc.bold('EXAMPLES:')}
  ${pc.cyan('$')} larats
  ${pc.cyan('$')} larats scan
  ${pc.cyan('$')} larats scan --output docs/ARCHITECTURE.md
  ${pc.cyan('$')} larats scaffold Payment
  ${pc.cyan('$')} larats make Order --modular
`);
}

/**
 * Handle cancellation gracefully
 */
function handleCancel(): never {
  p.cancel(pc.yellow('Operation cancelled. See you next time! 👋'));
  process.exit(0);
}

export interface UserStats {
  runs?: number;
  hasPromptedStar?: boolean;
}

/**
 * Track usage and politely prompt user to star repo once on 3rd or 4th run
 */
export async function checkAndPromptStar(customStatsPath?: string, forceAnswer?: boolean): Promise<void> {
  try {
    const configDir = path.join(os.homedir(), '.larats');
    const statsFile = customStatsPath || path.join(configDir, 'stats.json');

    if (!fs.existsSync(path.dirname(statsFile))) {
      fs.mkdirSync(path.dirname(statsFile), { recursive: true });
    }

    let stats: UserStats = {};
    if (fs.existsSync(statsFile)) {
      stats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
    }

    const runs = (stats.runs || 0) + 1;
    stats.runs = runs;

    if (runs >= 3 && !stats.hasPromptedStar) {
      stats.hasPromptedStar = true;
      const repoUrl = 'https://github.com/SidiqFatuh187/larats-cli';

      if (process.stdin.isTTY || typeof forceAnswer === 'boolean') {
        const shouldStar = typeof forceAnswer === 'boolean'
          ? forceAnswer
          : await p.confirm({
              message: '⭐ Suka dengan LaraTS? Maukah kamu memberi star di GitHub untuk mendukung proyek ini?',
              initialValue: true,
            });

        if (shouldStar && !p.isCancel(shouldStar)) {
          openViewer(repoUrl);
          p.log.success(pc.green('Terima kasih banyak atas dukungannya! ⭐ Halaman GitHub sedang dibuka...'));
        } else {
          p.log.message(pc.gray('Tidak masalah, enjoy menggunakan LaraTS! 👍'));
        }
      } else {
        console.log(
          `\n${pc.yellow('⭐ Suka dengan LaraTS?')} Jika CLI ini membantu pekerjaanmu, yuk beri star di GitHub:\n` +
          `   ${pc.bold(pc.cyan('👉 ' + repoUrl))}\n`
        );
      }
    }

    fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
  } catch {
    // Fail-safe: Never crash CLI on file permission errors
  }
}

/**
 * Open architecture HTML in the default browser without blocking the terminal
 */
function openViewer(destination: string): void {
  const startCmd =
    process.platform === 'win32'
      ? `start "" "${destination}"`
      : process.platform === 'darwin'
        ? `open "${destination}"`
        : `xdg-open "${destination}"`;

  try {
    exec(startCmd, (err) => {
      if (err) {
        p.log.warn(`Could not open browser automatically. Please open ${pc.cyan(destination)} manually.`);
      }
    });
  } catch {
    p.log.warn(`Could not open browser automatically. Please open ${pc.cyan(destination)} manually.`);
  }
}


/**
 * Execute AI architecture rules export workflow
 */
async function runAi(
  projectInfo: ProjectInfo,
  options: { copy?: boolean; cursor?: boolean; claude?: boolean } = {}
) {
  const spinner = p.spinner();
  spinner.start('Scanning codebase & formulating AI architecture context...');

  try {
    const scanResult = await scanProject(projectInfo);
    spinner.stop(pc.green(`Architecture context ready (${scanResult.scanDurationMs}ms)`));

    const aiContext = generateAiContext(scanResult);
    let handled = false;

    if (options.cursor) {
      const cursorPath = path.resolve(projectInfo.rootPath, '.cursorrules');
      const existing = fs.existsSync(cursorPath) ? fs.readFileSync(cursorPath, 'utf-8') : '';
      const updated = mergeAiRules(existing, aiContext);
      fs.writeFileSync(cursorPath, updated, 'utf-8');
      p.log.success(pc.green(`✔ Architecture rules injected into ${pc.bold('.cursorrules')}`));
      handled = true;
    }

    if (options.claude) {
      const claudePath = path.resolve(projectInfo.rootPath, 'CLAUDE.md');
      const existing = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, 'utf-8') : '';
      const updated = mergeAiRules(existing, aiContext);
      fs.writeFileSync(claudePath, updated, 'utf-8');
      p.log.success(pc.green(`✔ Architecture rules injected into ${pc.bold('CLAUDE.md')}`));
      handled = true;
    }

    if (options.copy) {
      const copied = await copyToClipboard(aiContext);
      if (copied) {
        p.log.success(pc.green('✔ Architecture context copied to clipboard! Ready to paste into ChatGPT or Claude.'));
      } else {
        p.log.warn('Could not access system clipboard. Printing prompt to console instead.');
        console.log(`\n${aiContext}\n`);
      }
      handled = true;
    }

    if (!handled) {
      console.log(`\n${pc.bold(pc.cyan('--- AI Codebase Architecture Prompt ---'))}\n${aiContext}\n${pc.bold(pc.cyan('---------------------------------------'))}\n`);
      p.note(
        `Tip: Run with ${pc.yellow('--copy')} to copy directly to clipboard,\n` +
        `or ${pc.yellow('--cursor')} / ${pc.yellow('--claude')} to inject into rules files automatically!`,
        pc.green('Prompt Ready for AI 🤖')
      );
    }

    p.outro(pc.cyan('Done!'));
  } catch (err: unknown) {
    spinner.stop(pc.red('Failed to generate AI context'));
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
/**
 * Execute scan workflow
 */
async function runScan(
  projectInfo: ProjectInfo,
  outputPath: string = 'ARCHITECTURE.md',
  options: { force?: boolean; dryRun?: boolean; view?: boolean; tree?: boolean; html?: boolean } = {}
) {
  const spinner = p.spinner();
  spinner.start('Scanning codebase structure & components (strict ignore list active)...');

  try {
    const destination = path.resolve(projectInfo.rootPath, outputPath);

    // Defense: Ensure output path is inside project root
    const rel = path.relative(projectInfo.rootPath, destination);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      spinner.stop(pc.red('Scan failed'));
      p.log.error(`Refusing to write output: "${outputPath}" resolves outside project root directory.`);
      process.exitCode = 1;
      return;
    }

    // Defense: Refuse to overwrite files that are not generated by LaraTS unless --force
    if (fs.existsSync(destination) && !options.force) {
      const existingContent = fs.readFileSync(destination, 'utf-8');
      const isLaraTsFile =
        existingContent.includes('Auto-generated by **[LaraTS CLI]') ||
        existingContent.includes('Auto-generated by **[ArchMind CLI]') ||
        existingContent.includes('LaraTS CLI') ||
        existingContent.includes('<!-- larats-generated -->');

      if (!isLaraTsFile) {
        spinner.stop(pc.red('Scan refused'));
        p.log.error(
          `Destination file "${outputPath}" already exists and does not appear to be generated by LaraTS.\n` +
          `To protect user files from accidental overwrites, use --force to overwrite.`
        );
        process.exitCode = 1;
        return;
      }
    }

    const scanResult = await scanProject(projectInfo);
    const nonZeroLayers = Object.values(scanResult.components).filter((c) => c.count > 0).length;
    const totalComponents = Object.values(scanResult.components).reduce((sum, c) => sum + c.count, 0);

    const terminalFlow = renderTerminalFlow(scanResult);

    if (options.dryRun) {
      spinner.stop(pc.green(`Scan completed in ${scanResult.scanDurationMs}ms (dry run)`));
      p.note(
        `${pc.bold('Architecture Flow:')}\n  ${pc.cyan(terminalFlow)}\n\n` +
        `${pc.bold('Scanned Files:')} ${scanResult.totalFilesScanned}\n` +
        `${pc.bold('Total Components:')} ${totalComponents} across ${nonZeroLayers} active architectural layers\n` +
        `${pc.bold('Modules Detected:')} ${scanResult.modules.length > 0 ? scanResult.modules.join(', ') : 'None (monolithic structure)'}\n` +
        `${pc.bold('Simulated Output:')} Would write ARCHITECTURE.md to ${pc.cyan(outputPath)} (dry run: no files written)`,
        pc.green('Architecture Map (Dry Run) 🗺️')
      );
      if (options.tree) {
        console.log(`\n${pc.bold('Directory Tree:')}\n${scanResult.directoryTree}\n`);
      }
      p.outro(pc.cyan('Dry run completed: no files written.'));
      return;
    }

    spinner.stop(pc.green(`Scan completed in ${scanResult.scanDurationMs}ms`));

    const markdown = generateArchitectureMarkdown(scanResult);

    // Ensure output directory exists if custom path
    const parentDir = path.dirname(destination);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(destination, markdown, 'utf-8');

    const shouldWriteHtml = options.html || options.view;
    if (shouldWriteHtml) {
      const htmlDestination = destination.replace(/\.md$/i, '') + '.html';
      fs.writeFileSync(htmlDestination, generateArchitectureHtml(scanResult), 'utf-8');
      p.log.success(`HTML architecture saved to ${pc.cyan(path.relative(projectInfo.rootPath, htmlDestination) || htmlDestination)}`);
      if (options.view) {
        openViewer(htmlDestination);
        p.log.info(pc.green('🌐 Opened interactive architecture diagram in your browser!'));
      }
    }

    if (options.tree) {
      console.log(`\n${pc.bold('Directory Tree:')}\n${scanResult.directoryTree}\n`);
    }

    // Display summary
    p.note(
      `${pc.bold('Architecture Flow:')}\n  ${pc.cyan(terminalFlow)}\n\n` +
      `${pc.bold('Scanned Files:')} ${scanResult.totalFilesScanned}\n` +
      `${pc.bold('Total Components:')} ${totalComponents} across ${nonZeroLayers} active architectural layers\n` +
      `${pc.bold('Modules Detected:')} ${scanResult.modules.length > 0 ? scanResult.modules.join(', ') : 'None (monolithic structure)'}\n` +
      `${pc.bold('Documentation:')} Saved to ${pc.cyan(path.relative(projectInfo.rootPath, destination) || outputPath)}\n\n` +
      `${pc.bold('💡 How to view diagram:')}\n` +
      `  • On GitHub: Push ${outputPath} (Mermaid renders automatically)\n` +
      `  • In VS Code: Press ${pc.yellow('Ctrl+Shift+V')} for Markdown Preview\n` +
      `  • In Browser: Run ${pc.cyan('npx larats view')} for instant local web preview`,
      pc.green('Architecture Map Generated! 🗺️')
    );

    p.outro(pc.cyan(`Done! Open ${outputPath} or run "npx larats view" to inspect architecture!`));
  } catch (err: any) {
    spinner.stop(pc.red('Scan failed'));
    p.log.error(err.message || String(err));
    process.exitCode = 1;
  }
}

/**
 * Execute scaffold workflow
 */
async function runScaffold(
  projectInfo: ProjectInfo,
  moduleNameArg?: string,
  cliOptions: { modular?: boolean; standard?: boolean; force?: boolean; dryRun?: boolean } = {}
) {
  // Warn if project type unknown or non-standard framework
  if (projectInfo.type === 'unknown') {
    p.log.warn(pc.yellow('Warning: Project type is unknown (neither Laravel nor TypeScript detected). Scaffolding standard TypeScript/Express components.'));
  } else if (
    projectInfo.type === 'typescript' &&
    projectInfo.typescript?.framework &&
    !['express', 'node-vanilla', 'unknown'].includes(projectInfo.typescript.framework)
  ) {
    p.log.warn(
      pc.yellow(`Warning: Project detected as "${projectInfo.typescript.framework}". LaraTS generates standard Express-compatible TypeScript boilerplate.`)
    );
  }

  let moduleName = moduleNameArg;

  if (moduleName) {
    const errorMsg = validateModuleName(moduleName);
    if (errorMsg) {
      p.log.error(pc.red(`Invalid module name: ${errorMsg}`));
      process.exitCode = 1;
      return;
    }
  } else {
    // Non-TTY check: cannot prompt
    if (!process.stdin.isTTY) {
      p.log.error(pc.red('Error: Module name is required in non-interactive (non-TTY) mode. Example: `larats scaffold Payment`'));
      process.exitCode = 1;
      return;
    }

    const input = await p.text({
      message: 'What is the name of the new module or feature?',
      placeholder: 'e.g. Payment, Order, UserProfile',
      validate(val) {
        return validateModuleName(val) || undefined;
      },
    });

    if (p.isCancel(input)) handleCancel();
    moduleName = input.trim();
  }

  // Component selection based on project type
  let selectedComponents: string[] = [];

  if (projectInfo.type === 'laravel') {
    if (!process.stdin.isTTY) {
      selectedComponents = ['model', 'controller', 'service', 'request', 'migration'];
    } else {
      const componentsPrompt = await p.multiselect({
        message: `Select components to scaffold for ${pc.cyan(moduleName)}:`,
        options: [
          { value: 'model', label: 'Eloquent Model', hint: 'Includes table name, fillables, and casts' },
          { value: 'controller', label: 'Resourceful Controller', hint: 'Includes standard CRUD methods & DI service' },
          { value: 'service', label: 'Service Class', hint: 'Encapsulated business logic operations' },
          { value: 'action', label: 'Single Action Class', hint: 'Invokable single-responsibility class' },
          { value: 'request', label: 'Form Request', hint: 'Request validation rules & authorization' },
          { value: 'migration', label: 'Database Migration', hint: 'Schema definition with timestamps' },
        ],
        initialValues: ['model', 'controller', 'service', 'request', 'migration'],
        required: true,
      });

      if (p.isCancel(componentsPrompt)) handleCancel();
      selectedComponents = componentsPrompt as string[];
    }

    // Component dependencies: controller depends on service
    if (selectedComponents.includes('controller') && !selectedComponents.includes('service')) {
      p.log.warn(pc.yellow('Notice: Controller requires Service class. Auto-adding "service" to scaffolded components.'));
      selectedComponents.push('service');
    }
  } else {
    // TypeScript or fallback
    if (!process.stdin.isTTY) {
      selectedComponents = ['controller', 'service', 'repository', 'route', 'dto'];
    } else {
      const componentsPrompt = await p.multiselect({
        message: `Select components to scaffold for ${pc.cyan(moduleName)}:`,
        options: [
          { value: 'controller', label: 'Controller', hint: 'Express request handlers & response orchestration' },
          { value: 'service', label: 'Service', hint: 'Application logic & repository coordination' },
          { value: 'repository', label: 'Repository', hint: 'Data persistence abstraction & queries' },
          { value: 'route', label: 'Router & Routes', hint: 'Express router mapping endpoints to controller' },
          { value: 'dto', label: 'DTOs & Interfaces', hint: 'Typed interfaces for entities and payloads' },
        ],
        initialValues: ['controller', 'service', 'repository', 'route', 'dto'],
        required: true,
      });

      if (p.isCancel(componentsPrompt)) handleCancel();
      selectedComponents = componentsPrompt as string[];
    }

    // Dependencies: route -> controller -> service -> repository
    if (selectedComponents.includes('route') && !selectedComponents.includes('controller')) {
      p.log.warn(pc.yellow('Notice: Route requires Controller. Auto-adding "controller" to scaffolded components.'));
      selectedComponents.push('controller');
    }
    if (selectedComponents.includes('controller') && !selectedComponents.includes('service')) {
      p.log.warn(pc.yellow('Notice: Controller requires Service. Auto-adding "service" to scaffolded components.'));
      selectedComponents.push('service');
    }
    if (selectedComponents.includes('service') && !selectedComponents.includes('repository')) {
      p.log.warn(pc.yellow('Notice: Service requires Repository. Auto-adding "repository" to scaffolded components.'));
      selectedComponents.push('repository');
    }
  }

  // Determine modular vs standard structure
  let isModular = true;
  if (cliOptions.modular) {
    isModular = true;
  } else if (cliOptions.standard) {
    isModular = false;
  } else if (!process.stdin.isTTY) {
    isModular = projectInfo.type === 'laravel'
      ? Boolean(projectInfo.laravel?.isModular)
      : projectInfo.type === 'typescript'
        ? Boolean(projectInfo.typescript?.isModular)
        : true;
  } else {
    const defaultModular = projectInfo.type === 'laravel'
      ? Boolean(projectInfo.laravel?.isModular)
      : projectInfo.type === 'typescript'
        ? Boolean(projectInfo.typescript?.isModular)
        : true;

    const structurePrompt = await p.select({
      message: 'Choose folder architecture structure:',
      options: projectInfo.type === 'laravel'
        ? [
            {
              value: 'modular',
              label: 'Modular Domain Structure',
              hint: `app/Modules/${moduleName}/[Models, Controllers, Services]`,
            },
            {
              value: 'standard',
              label: 'Standard Laravel Structure',
              hint: `app/Models, app/Http/Controllers, app/Services`,
            },
          ]
        : [
            {
              value: 'modular',
              label: 'Modular Feature Structure',
              hint: `src/modules/${moduleName.toLowerCase()}/...`,
            },
            {
              value: 'standard',
              label: 'Layered Folder Structure',
              hint: `src/controllers, src/services, src/routes...`,
            },
          ],
      initialValue: defaultModular ? 'modular' : 'standard',
    });

    if (p.isCancel(structurePrompt)) handleCancel();
    isModular = structurePrompt === 'modular';
  }

  const spinner = p.spinner();
  spinner.start(`Generating boilerplate files for ${pc.cyan(moduleName)}...`);

  const result: ScaffoldResult = await scaffoldModule(projectInfo, {
    moduleName,
    components: selectedComponents,
    isModular,
    dryRun: cliOptions.dryRun,
    forceOverwrite: cliOptions.force,
  });

  spinner.stop('Generation finished!');

  if (result.errorCount > 0) {
    process.exitCode = 1;
  }

  // Report files status
  const fileLines = result.files.map((f) => {
    if (f.status === 'created') {
      if (cliOptions.dryRun) {
        return `  ${pc.blue('ℹ')} ${f.relativeFilePath} ${pc.gray('(would create)')}`;
      }
      return `  ${pc.green('✔')} ${f.relativeFilePath} ${pc.gray('(created)')}`;
    } else if (f.status === 'skipped') {
      return `  ${pc.yellow('⚠')} ${f.relativeFilePath} ${pc.yellow(`(skipped - ${f.reason})`)}`;
    } else {
      return `  ${pc.red('✖')} ${f.relativeFilePath} ${pc.red(`(error - ${f.reason})`)}`;
    }
  });

  if (cliOptions.dryRun) {
    p.note(
      fileLines.join('\n') +
      `\n\n${pc.bold('Dry run summary:')} ${pc.cyan(`${result.createdCount} would be created`)}, ${pc.yellow(`${result.skippedCount} skipped`)}, ${pc.red(`${result.errorCount} errors`)}`,
      pc.cyan(`Dry run: Scaffolding ${moduleName}`)
    );
    p.outro(pc.cyan('Dry run: no files written.'));
    return;
  }

  p.note(
    fileLines.join('\n') +
    `\n\n${pc.bold('Summary:')} ${pc.green(`${result.createdCount} created`)}, ${pc.yellow(`${result.skippedCount} skipped`)}, ${pc.red(`${result.errorCount} errors`)}`,
    pc.cyan(`Module Scaffolding: ${moduleName}`)
  );

  if (result.skippedCount > 0 && !cliOptions.force) {
    p.log.warn(pc.yellow('Anti-Overwrite Protection prevented modifying existing files. Use --force to overwrite if intended.'));
  }

  // Next steps guidance
  const names = getNaming(moduleName);
  if (result.createdCount > 0) {
    if (projectInfo.type === 'laravel') {
      p.note(
        `1. Run database migration:\n   ${pc.cyan('php artisan migrate')}\n` +
        `2. Register routes in routes/api.php or routes/web.php:\n   ${pc.cyan(`Route::apiResource('${names.kebab}', \\${isModular ? `App\\Modules\\${names.pascal}\\Controllers\\` : 'App\\Http\\Controllers\\'}${names.pascal}Controller::class);`)}`,
        '🚀 Next Steps'
      );
    } else {
      p.note(
        `1. Mount routes into Express app:\n   ${pc.cyan(`import { ${names.camel}Routes } from './${isModular ? `modules/${names.kebab}` : `routes/${names.kebab}.routes.js`}';\n   app.use('/api/${names.kebab}', ${names.camel}Routes);`)}`,
        '🚀 Next Steps'
      );
    }
  }

  p.outro(pc.green(`✨ Successfully scaffolded ${moduleName} module!`));
}

/**
 * Display quick project info
 */
function showProjectInfo(projectInfo: ProjectInfo) {
  let details = `${pc.bold('Project Name:')} ${projectInfo.name}\n` +
    `${pc.bold('Project Type:')} ${projectInfo.type.toUpperCase()}\n` +
    `${pc.bold('Flavor / Stack:')} ${projectInfo.summary}\n` +
    `${pc.bold('Working Path:')} ${projectInfo.rootPath}`;

  if (projectInfo.type === 'laravel' && projectInfo.laravel) {
    details += `\n${pc.bold('Filament Admin:')} ${projectInfo.laravel.hasFilament ? pc.green('Yes') : 'No'}` +
      `\n${pc.bold('Livewire:')} ${projectInfo.laravel.hasLivewire ? pc.green('Yes') : 'No'}` +
      `\n${pc.bold('Inertia.js:')} ${projectInfo.laravel.hasInertia ? pc.green('Yes') : 'No'}` +
      `\n${pc.bold('Modular App:')} ${projectInfo.laravel.isModular ? pc.green('Yes') : 'No'}`;
  } else if (projectInfo.type === 'typescript' && projectInfo.typescript) {
    details += `\n${pc.bold('Framework:')} ${projectInfo.typescript.framework}` +
      `\n${pc.bold('Prisma ORM:')} ${projectInfo.typescript.hasPrisma ? pc.green('Yes') : 'No'}` +
      `\n${pc.bold('Monorepo:')} ${projectInfo.typescript.isMonorepo ? pc.green('Yes') : 'No'}` +
      `\n${pc.bold('Modular Src:')} ${projectInfo.typescript.isModular ? pc.green('Yes') : 'No'}`;
  }

  p.note(details, pc.cyan('Detected Project Architecture'));
}

/**
 * CLI Main Entrypoint
 */
async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: {
        output: { type: 'string', short: 'o' },
        modular: { type: 'boolean', short: 'm' },
        standard: { type: 'boolean', short: 's' },
        force: { type: 'boolean', short: 'f' },
        'dry-run': { type: 'boolean' },
        view: { type: 'boolean' },
        tree: { type: 'boolean', short: 't' },
        html: { type: 'boolean' },
        version: { type: 'boolean', short: 'v' },
        copy: { type: 'boolean' },
        cursor: { type: 'boolean' },
        claude: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err: unknown) {
    console.error(pc.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
    showHelp();
    process.exitCode = 1;
    return;
  }

  // Flags check
  if (parsed.values.help || parsed.positionals[0] === 'help') {
    showHelp();
    return;
  }

  if (parsed.values.version || parsed.positionals[0] === 'version') {
    console.log(`larats v${VERSION}`);
    return;
  }

  const command = parsed.positionals[0];
  const VALID_COMMANDS: Record<string, true> = {
    scan: true,
    view: true,
    preview: true,
    scaffold: true,
    make: true,
    info: true,
    ai: true,
    help: true,
  };
  if (command && !VALID_COMMANDS[command]) {
    console.error(pc.red(`Error: Unknown command "${command}".`));
    showHelp();
    process.exitCode = 1;
    return;
  }

  const outputPath = parsed.values.output || 'ARCHITECTURE.md';
  const isModularFlag = parsed.values.modular;
  const isStandardFlag = parsed.values.standard;
  const isForceFlag = parsed.values.force;
  const isDryRunFlag = parsed.values['dry-run'];
  const isViewFlag = parsed.values.view;
  const isTreeFlag = parsed.values.tree;
  const isHtmlFlag = parsed.values.html;

  // Auto-detect project type in current working directory
  const projectInfo = await detectProjectType(process.cwd());

  // Non-interactive command routing
  if (command === 'scan') {
    p.intro(`${pc.bgCyan(pc.black(' LaraTS '))} ${pc.gray(`v${VERSION}`)} - Scanning Architecture`);
    p.log.info(`Detected: ${pc.green(projectInfo.summary)}`);
    await runScan(projectInfo, outputPath, {
      force: isForceFlag,
      dryRun: isDryRunFlag,
      view: isViewFlag,
      tree: isTreeFlag,
      html: isHtmlFlag,
    });
    await checkAndPromptStar();
    return;
  }

  if (command === 'view' || command === 'preview') {
    p.intro(`${pc.bgCyan(pc.black(' LaraTS '))} ${pc.gray(`v${VERSION}`)} - Architecture Viewer`);
    p.log.info(`Target: ${pc.green(projectInfo.summary)}`);
    const spinner = p.spinner();
    spinner.start('Scanning repository & generating architecture map...');
    const scanResult = await scanProject(projectInfo);
    spinner.stop(pc.green(`Scanned ${scanResult.totalFilesScanned} files in ${scanResult.scanDurationMs}ms`));

    const htmlDestination = path.resolve(projectInfo.rootPath, 'ARCHITECTURE.html');
    fs.writeFileSync(htmlDestination, generateArchitectureHtml(scanResult), 'utf-8');
    openViewer(htmlDestination);

    p.note(
      `${pc.bold('File:')} ${pc.cyan('ARCHITECTURE.html')}\n` +
      `Interactive Mermaid.js flowchart & component breakdown loaded in your browser.\n` +
      `Double-click ${pc.cyan('ARCHITECTURE.html')} anytime to view offline!`,
      pc.green('Opened in Browser! 🌐')
    );
    p.outro(pc.cyan('Done!'));
    await checkAndPromptStar();
    return;
  }

  if (command === 'ai') {
    p.intro(`${pc.bgCyan(pc.black(' LaraTS '))} ${pc.gray(`v${VERSION}`)} - AI Architecture Context`);
    p.log.info(`Target: ${pc.green(projectInfo.summary)}`);
    await runAi(projectInfo, {
      copy: parsed.values.copy as boolean | undefined,
      cursor: parsed.values.cursor as boolean | undefined,
      claude: parsed.values.claude as boolean | undefined,
    });
    await checkAndPromptStar();
    return;
  }

  if (command === 'scaffold' || command === 'make') {
    const moduleName = parsed.positionals[1];
    p.intro(`${pc.bgCyan(pc.black(' LaraTS '))} ${pc.gray(`v${VERSION}`)} - Module Scaffolder`);
    p.log.info(`Target Project: ${pc.green(projectInfo.summary)}`);
    await runScaffold(projectInfo, moduleName, {
      modular: isModularFlag,
      standard: isStandardFlag,
      force: isForceFlag,
      dryRun: isDryRunFlag,
    });
    await checkAndPromptStar();
    return;
  }

  if (command === 'info') {
    p.intro(`${pc.bgCyan(pc.black(' LaraTS '))} ${pc.gray(`v${VERSION}`)}`);
    showProjectInfo(projectInfo);
    p.outro(pc.cyan('Done.'));
    await checkAndPromptStar();
    return;
  }

  // No command supplied: check for non-TTY
  if (!process.stdin.isTTY) {
    showHelp();
    return;
  }

  // Interactive Menu Mode
  p.intro(`${pc.bgCyan(pc.black(' LaraTS '))} ${pc.bold('Smart Architecture Visualizer & Scaffolder')} ${pc.gray(`v${VERSION}`)}`);

  p.log.info(`Working Directory: ${pc.gray(process.cwd())}`);
  p.log.info(`Detected Architecture: ${pc.bold(pc.green(projectInfo.summary))}`);

  const action = await p.select({
    message: 'What would you like to do?',
    options: [
      {
        value: 'scan',
        label: '🔍 Scan Architecture & Generate ARCHITECTURE.md',
        hint: 'Creates component stats, directory tree & Mermaid flowchart',
      },
      {
        value: 'ai',
        label: '🤖 Export Architecture Context for AI (Cursor, Claude, Copilot)',
        hint: 'Generate architecture rules for AI coding agents',
      },
      {
        value: 'view',
        label: '🌐 Open Interactive Architecture Viewer in Browser',
        hint: 'Spawns local browser tab with Mermaid flowchart & stats',
      },
      {
        value: 'scaffold',
        label: '🏗️  Scaffold New Feature / Module',
        hint: 'Interactively generate boilerplate components with safety checks',
      },
      {
        value: 'info',
        label: '📊 Inspect Detected Architecture Details',
        hint: 'View detected frameworks, ORMs, and configurations',
      },
      {
        value: 'exit',
        label: '🚪 Exit',
      },
    ],
  });

  if (p.isCancel(action) || action === 'exit') {
    handleCancel();
  }

  if (action === 'scan') {
    await runScan(projectInfo, outputPath, {
      force: isForceFlag,
      dryRun: isDryRunFlag,
      view: isViewFlag,
      tree: isTreeFlag,
      html: isHtmlFlag,
    });
  } else if (action === 'ai') {
    const aiTarget = await p.select({
      message: 'How would you like to export the AI architecture context?',
      options: [
        { value: 'copy', label: '📋 Copy directly to Clipboard', hint: 'Ready to paste into ChatGPT or Claude web' },
        { value: 'cursor', label: '🖱️  Save into .cursorrules', hint: 'Inject rules for Cursor AI' },
        { value: 'claude', label: '🧠 Save into CLAUDE.md', hint: 'Inject rules for Claude Code' },
        { value: 'print', label: '🖥️  Display prompt in terminal', hint: 'View formatted markdown text' },
      ],
    });

    if (p.isCancel(aiTarget)) {
      handleCancel();
    }

    await runAi(projectInfo, {
      copy: aiTarget === 'copy',
      cursor: aiTarget === 'cursor',
      claude: aiTarget === 'claude',
    });
  } else if (action === 'view') {
    const spinner = p.spinner();
    spinner.start('Scanning repository & generating architecture map...');
    const scanResult = await scanProject(projectInfo);
    spinner.stop(pc.green(`Scanned in ${scanResult.scanDurationMs}ms`));
    const htmlDestination = path.resolve(projectInfo.rootPath, 'ARCHITECTURE.html');
    fs.writeFileSync(htmlDestination, generateArchitectureHtml(scanResult), 'utf-8');
    openViewer(htmlDestination);
    p.outro(pc.green('🌐 Opened interactive architecture diagram in your browser!'));
  } else if (action === 'scaffold') {
    await runScaffold(projectInfo, undefined, {
      modular: isModularFlag,
      standard: isStandardFlag,
      force: isForceFlag,
      dryRun: isDryRunFlag,
    });
  } else if (action === 'info') {
    showProjectInfo(projectInfo);
    p.outro(pc.cyan('Done!'));
  }
  await checkAndPromptStar();
}

main().catch((err) => {
  p.log.error(pc.red(`Fatal error: ${err.message || String(err)}`));
  process.exit(1);
});
