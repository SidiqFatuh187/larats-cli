import type { ScanResult } from '../scanner.js';

export const AI_RULES_START_TAG = '<!-- larats-rules:start -->';
export const AI_RULES_END_TAG = '<!-- larats-rules:end -->';

/**
 * Generate a token-efficient, high-signal architecture context prompt for AI agents (Cursor, Claude, Copilot, ChatGPT).
 */
export function generateAiContext(scanResult: ScanResult): string {
  const { projectInfo, components, modules } = scanResult;

  const lines: string[] = [];

  lines.push('# Codebase Architecture Rules');
  lines.push(`> Project: ${projectInfo.name} | Stack: ${projectInfo.summary}`);
  lines.push('');

  lines.push('## Architectural Boundaries & Principles');
  lines.push('- Maintain strict separation of concerns across active architectural layers.');
  lines.push('- Keep Controllers thin: handle HTTP requests, invoke Services, and return responses.');
  lines.push('- Encapsulate all business rules, calculations, and mutations inside Services/Actions.');
  lines.push('- Isolate data storage and queries to Repositories or Model entities.');
  lines.push('- Validate all incoming user inputs with dedicated DTOs or Form Requests before reaching domain logic.');
  lines.push('');

  lines.push('## Project Structure & Layer Conventions');

  if (projectInfo.type === 'laravel') {
    const isModular = Boolean(projectInfo.laravel?.isModular);
    const modDir = projectInfo.laravel?.modulesDir || 'app/Modules';

    if (isModular) {
      lines.push(`- **Architecture Style**: Modular Domain Architecture`);
      lines.push(`- **Module Root**: \`${modDir}/<FeatureName>/\``);
      lines.push(`- **Controllers**: \`${modDir}/<FeatureName>/Controllers/\` (HTTP handlers)`);
      lines.push(`- **Services / Actions**: \`${modDir}/<FeatureName>/Services/\` or \`Actions/\` (Business logic)`);
      lines.push(`- **Models**: \`${modDir}/<FeatureName>/Models/\` (Eloquent entities)`);
      lines.push(`- **Validation**: \`${modDir}/<FeatureName>/Requests/\` (FormRequest classes)`);
      lines.push(`- **Routes**: \`${modDir}/<FeatureName>/routes.php\` or root \`routes/\``);
    } else {
      lines.push(`- **Architecture Style**: Standard Laravel Layered Architecture`);
      lines.push(`- **Controllers**: \`app/Http/Controllers/\``);
      lines.push(`- **Services / Actions**: \`app/Services/\` or \`app/Actions/\``);
      lines.push(`- **Models**: \`app/Models/\``);
      lines.push(`- **Validation**: \`app/Http/Requests/\``);
      lines.push(`- **Routes**: \`routes/web.php\`, \`routes/api.php\``);
      lines.push(`- **Migrations**: \`database/migrations/\``);
    }

    if (projectInfo.laravel?.hasFilament) {
      lines.push(`- **Admin Panel**: Filament Resources live in \`app/Filament/Resources/\``);
    }
  } else if (projectInfo.type === 'typescript') {
    const isModular = Boolean(projectInfo.typescript?.isModular);
    const srcDir = projectInfo.typescript?.srcDir || 'src';
    const orm = projectInfo.typescript?.hasPrisma ? 'Prisma' : projectInfo.typescript?.hasTypeORM ? 'TypeORM' : projectInfo.typescript?.hasDrizzle ? 'Drizzle' : null;

    if (isModular) {
      lines.push(`- **Architecture Style**: Feature Module Architecture`);
      lines.push(`- **Module Root**: \`${srcDir}/modules/<feature>/\``);
      lines.push(`- **Controllers**: \`${srcDir}/modules/<feature>/<feature>.controller.ts\``);
      lines.push(`- **Services**: \`${srcDir}/modules/<feature>/<feature>.service.ts\``);
      lines.push(`- **Repositories**: \`${srcDir}/modules/<feature>/<feature>.repository.ts\``);
      lines.push(`- **DTOs / Schemas**: \`${srcDir}/modules/<feature>/<feature>.dto.ts\``);
      lines.push(`- **Routes**: \`${srcDir}/modules/<feature>/<feature>.routes.ts\``);
      lines.push(`- **Module Index**: \`${srcDir}/modules/<feature>/index.ts\` (barrel export)`);
    } else {
      lines.push(`- **Architecture Style**: Layered Architecture`);
      lines.push(`- **Controllers**: \`${srcDir}/controllers/\``);
      lines.push(`- **Services**: \`${srcDir}/services/\``);
      lines.push(`- **Repositories / Data**: \`${srcDir}/repositories/\``);
      lines.push(`- **DTOs / Schemas**: \`${srcDir}/dtos/\` or \`${srcDir}/schemas/\``);
      lines.push(`- **Routes**: \`${srcDir}/routes/\``);
    }

    if (orm) {
      lines.push(`- **Database ORM**: ${orm} is used for data persistence.`);
    }
  } else {
    lines.push(`- **Source Code**: \`src/\``);
    lines.push(`- **Automated Tests**: \`tests/\``);
  }

  if (modules.length > 0) {
    lines.push('');
    lines.push(`## Active Feature Modules (${modules.length})`);
    lines.push(`Existing domains: ${modules.map((m) => `\`${m}\``).join(', ')}`);
    lines.push('When creating new features, follow this established domain partition.');
  }

  lines.push('');
  lines.push('## AI Coding Guardrails');
  lines.push('1. NEVER place raw queries or database transactions inside Controller files.');
  lines.push('2. When implementing a new feature, always create cohesive layers: Route -> Controller -> Service -> Repository/Model.');
  lines.push('3. Keep naming conventions consistent with existing files in the repository.');
  lines.push('4. Write automated unit/feature tests for new domain services.');

  return lines.join('\n');
}

/**
 * Safely merge AI architecture rules into an existing config file (.cursorrules, CLAUDE.md)
 * without destroying existing user instructions.
 */
export function mergeAiRules(existingContent: string, newRules: string): string {
  const block = `${AI_RULES_START_TAG}\n${newRules}\n${AI_RULES_END_TAG}`;

  if (!existingContent || existingContent.trim() === '') {
    return block + '\n';
  }

  const regex = new RegExp(`${AI_RULES_START_TAG}[\\s\\S]*?${AI_RULES_END_TAG}`, 'm');
  if (regex.test(existingContent)) {
    return existingContent.replace(regex, block);
  }

  return existingContent.trimEnd() + '\n\n' + block + '\n';
}
