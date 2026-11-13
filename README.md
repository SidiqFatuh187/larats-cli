# LaraTS 

> **Smart Architecture Visualizer & Contextual Module Scaffolder CLI**  
> Tailor-made for **Laravel**, **TypeScript**, and **JavaScript (Node.js)** projects.

[![npm version](https://img.shields.io/npm/v/larats.svg)](https://www.npmjs.com/package/larats)
[![CI](https://github.com/SidiqFatuh187/Larats/actions/workflows/ci.yml/badge.svg)](https://github.com/SidiqFatuh187/Larats/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.3.0-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Offline First](https://img.shields.io/badge/Security-100%25%20Offline-success.svg)](#-strict-security--safety-guarantees)
[![XERJ Corpus Hub contributor](https://hub.xerj.org/contributors/SidiqFatuh187/badge.svg)](https://hub.xerj.org/contributors/SidiqFatuh187)
---

## 💡 What is LaraTS?

When codebases grow large, developers often struggle to understand the architecture or keep module structures consistent across teams. **LaraTS** provides these commands:

1. 🔍 **Architecture Scanner & Visualizer (`scan`)**: Instantly scans your repository, categorizes layers (Models, Controllers, Services, Actions, Filament Resources, Routes, etc.), and generates a clean `ARCHITECTURE.md` with an interactive **Mermaid.js flowchart** and directory tree.
2. 🏗️ **Contextual Module Scaffolder (`scaffold` / `make`)**: Quickly generates cohesive feature modules with clean, production-ready boilerplate code tailored to your exact stack (Laravel or TypeScript).
3. 🤖 **AI Architecture Context Packager (`ai`)**: Exports a token-efficient system prompt teaching Cursor AI, Claude, Copilot, or ChatGPT your exact layered boundaries (`--copy`, `--cursor`, `--claude`).
4. **Tech Stack Generator (`stack`)**: Detects technologies from manifests and filenames, lets you review the selection, and generates Markdown badges for your README.
5. 🔒 **100% Local & Secure**: Detection runs locally. Sensitive files (`.env`, private keys, vendor folders) are excluded; generated badges request external images only when rendered.
---

## 🚀 Quick Start

Run instantly without installation via `npx`:

```bash
# Interactive menu mode
npx larats

# Scan architecture & display terminal pipeline
npx larats scan

# Open interactive Mermaid diagram in your browser
npx larats view

# Export architecture context rules for AI (Cursor, Claude, Copilot)
npx larats ai --copy

# Generate README-ready tech stack badges
npx larats stack

# Or scaffold a new module directly
npx larats scaffold Payment
```

Or install globally:

```bash
npm install -g larats
larats
```


---

## 👀 How to View Your Project Architecture

LaraTS makes your codebase architecture visible in 4 convenient ways:

1. 🌐 **Interactive Local Browser (`larats view` / `larats scan --view`)**:
   Spawns a local browser tab displaying the interactive Mermaid flowchart, component counts, and directory tree.
   ```bash
   npx larats view
   # or scan and open viewer immediately
   npx larats scan --view
   ```

2. 📟 **Terminal Architecture Pipeline**:
   Every time you run `larats scan`, LaraTS prints an ASCII pipeline of your request lifecycle directly in the terminal:
   ```text
   Client ──> Routes [4] ──> Controllers [4] ──> Services [2] ──> Models [6] ──> Database
   ```

3. 🐙 **GitHub & GitLab Native Preview**:
   Commit and push `ARCHITECTURE.md` to your repository. GitHub natively renders Mermaid.js flowcharts into interactive graphics directly on the web page.

4. 💻 **VS Code & Cursor**:
   Open `ARCHITECTURE.md` and press `Ctrl+Shift+V` (`Cmd+Shift+V` on macOS) to open the built-in Markdown Preview.

5. 📄 **Standalone HTML Export (`--html`)**:
   Generate a self-contained `ARCHITECTURE.html` file that can be opened in any web browser without any server:
   ```bash
   npx larats scan --html
   ```
---

## ✨ Key Features

### 1. 🔍 Auto-Detection & Safe Scanner
LaraTS safely inspects root manifest files (`package.json`, `composer.json`, `tsconfig.json`) solely to detect your framework and architectural stack, without parsing application logic or reading `.env*` secrets:
- **Laravel**: Detects Laravel version (10.x vs 11+), Filament Admin panel, Livewire, Inertia.js, Sanctum, and Modular architecture (`app/Modules/`, `modules/`, `Modules/`).
- **TypeScript**: Detects Express, NestJS, Fastify, Next.js, React, Prisma ORM, TypeORM, Drizzle, Monorepos (`apps/*/src`, `packages/*/src`), and Modular setups (`src/modules/`).

When you run `larats scan`:
- Indexes architectural components (Counts and samples).
- Builds a clean, high-level directory tree.
- Generates an interactive **Mermaid.js flowchart (`flowchart TD`)** showing the entire request lifecycle across layers, dynamically adapting to CLI applications or web services.
- Outputs a deterministic, diff-friendly `ARCHITECTURE.md` file.

### 2. 🏗️ Contextual Module Scaffolder
Create new features in seconds with consistent boilerplate:

- **Laravel Options**:
  - `Model`: Eloquent model with `$table`, `$fillable`, and `$casts`.
  - `Controller`: Resourceful API Controller with Dependency-Injected Service.
  - `Service`: Encapsulated business logic service (`getAll`, `getById`, `create`, `update`, `delete`).
  - `Action`: Single-responsibility invokable class (`execute` method).
  - `FormRequest`: Authorization and validation rules.
  - `Migration`: Timestamped schema migration.
  - **Structure choices**: Modular Domain (`app/Modules/<Name>`) or Standard Laravel (`app/Models`, `app/Http/Controllers`, etc.).

- **TypeScript Options**:
  - `Controller`: Express request handler with error handling.
  - `Service`: Business logic service.
  - `Repository`: Data access layer interface and implementation.
  - `Route`: Express router connected to controller actions.
  - `DTO / Schema`: Strongly-typed TypeScript interfaces and payloads.
  - `Barrel Export`: Automatic `index.ts` export for modular cohesion.
  - **Structure choices**: Feature Module (`src/modules/<name>/...`) or Layered structure (`src/controllers/`, `src/services/`, etc.).

### 3. 🛡️ Anti-Overwrite Protection
LaraTS will **NEVER** silently overwrite your existing code. If a target file already exists, LaraTS skips it and alerts you. You can only overwrite files by explicitly providing `--force`.


### 4. 🤖 AI Architecture Context Packager (`ai`)
Teach AI coding assistants (Cursor, Claude Code, GitHub Copilot, ChatGPT) your exact project architecture rules so they never write misplaced code again:
- **Copy to Clipboard**: `larats ai --copy` — Copies clean, compressed architecture instructions (< 500 tokens) ready to paste into ChatGPT or Claude.
- **Cursor AI Rules**: `larats ai --cursor` — Injects architecture boundaries and directory maps directly into `.cursorrules`.
- **Claude Code Rules**: `larats ai --claude` — Injects architecture conventions into `CLAUDE.md`.
*(Safe merge: uses `<!-- larats-rules:start -->` tags so existing user instructions are never overwritten).*

### 5. Tech Stack Generator (`stack`)

Run `larats stack` in the project you want to inspect. In an interactive terminal, detected technologies start selected. Use arrow keys to navigate, Space to toggle, and Enter to confirm. You can then add technologies from the registry, including ones auto-detection missed. Ctrl+C cancels before output or clipboard changes.

Detection combines root and nested `package.json` / `composer.json` manifests, source-file extensions, and known configuration filenames. Laravel and frontend dependencies are detected together. Output groups technologies into Language, Backend, Frontend, Database/ORM, DevOps/Tools, and Testing.

#### Relationship analysis

`larats stack` also inspects source files to discover how technologies connect: JS/TS imports, Vue/Svelte script blocks, PHP namespace references, Laravel DB facade calls, Prisma datasource providers, and Express/fetch HTTP matches. Every arrow in the diagram links back to a file and line number so you can verify the evidence yourself.

The generated `TECH_STACK.md` includes a Mermaid flowchart under **Architecture relationships** with numbered edges and a full **Relationship evidence** section. The browser preview renders an SVG diagram with role lanes (Frontend, Backend, Data, etc.), directed arrows, and an accessible text inventory below.

Limits: only literal import specifiers and route paths are matched; tsconfig aliases, workspace packages, dynamic routes, PHP grouped imports, and runtime-only connections are not resolved. Warnings list every omission. Analysis reads at most 5,000 files (512 KiB each, 32 MiB total), excludes tests/fixtures/generated sources, and never follows symlinks outside the project.

```bash
# Review technologies and relationships, save TECH_STACK.md, open diagram preview
larats stack

# Generate a flat badge layout (diagram still included)
larats stack --flat

# Copy the final selection
larats stack --copy

# Save a separate snippet inside the project
larats stack --output docs/STACK.md

# Preview without writing files or touching the clipboard
larats stack --dry-run --output docs/STACK.md

# Replace an existing snippet explicitly
larats stack --output docs/STACK.md --force
```

In an interactive terminal, `larats stack` (or the main menu's stack action) saves `TECH_STACK.md` in the current project and opens a local HTML preview in your default browser. The preview shows an SVG architecture diagram, badges, and a selectable Markdown snippet. Focus the snippet to select it, then copy it into your README.

The CLI prints absolute paths for both files. Preview HTML lives in a unique system temporary directory, outside the project, so it does not affect future language detection. You can reopen that HTML file until your system removes temporary files. If browser launching fails, the CLI prints a manual-opening URL.

Existing output files require confirmation before replacement; answering No or cancelling leaves them unchanged. `--force` skips that confirmation. `--output` selects another destination inside the project; paths outside the project or through symlinks are rejected. README and architecture files are not changed automatically.

`--copy` alone remains clipboard-only, without saving or opening a browser. Combine it with `--output` to save and copy. `--dry-run` prints Markdown without writing files, changing the clipboard, or opening a browser.

When input or output is not a TTY, no stack selection prompts or browser launch run. Default stdout contains only Markdown for scripts; explicit `--output` writes a file and refuses replacement without `--force`. Diagnostics go to stderr. If copying fails, Markdown is printed for manual copying and the command exits with code 1.

Badges use a dark label with white text and logos, plus the technology's brand color as an accent. Technologies without an available provider logo use a text badge. Generating Markdown needs no network connection; displaying badge images requires access to Shields.io.

Detection lists evidence of technologies, not proof of runtime usage. A database driver can identify an integration; Laravel or Prisma alone does not identify its database. Only direct manifest dependencies (including development and optional npm dependencies) are matched, not lockfile or peer dependency lists. Source/configuration contents and `.env*` files are not parsed for detection (only for relationship analysis of imports and providers). Unknown technologies can be selected manually if present in the registry; arbitrary custom badge definitions are not supported.

Malformed manifests fail with the filename and a correction message rather than silently producing incomplete results.

---

## 🔒 Strict Security & Safety Guarantees

LaraTS was engineered from the ground up for strict security:
- **100% Offline & Local**: Zero network calls, telemetry, or third-party tracking.
- **Strict Ignore List (`SAFE_IGNORE_LIST`)**:
  - Never reads or includes `**/node_modules/**`, `**/vendor/**`, `**/.git/**`, `**/storage/**`, `**/dist/**`, `build/**`, `out/**`, `tmp/**`.
  - Never touches keys or cloud secrets: `**/.env*`, `**/*.pem`, `**/*.key`, `**/*.p12`, `**/*.jks`, `**/*.keystore`, `**/.aws/**`, `**/.ssh/**`, `**/secrets/**`, `**/credentials*.json`, `**/*service-account*.json`, `**/id_rsa*`, `**/id_ed25519*`, `**/id_ecdsa*`.
  - Never indexes lock/log files: `**/*.log`, `**/*.lock`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `composer.lock`.
- **Manifest & Structure Only**: Scanner safely inspects package manifests (`package.json`, `composer.json`) solely to identify framework and ORM types, and relative file paths to categorize layers. It never reads private configuration values or `.env*` secrets. Relationship analysis reads source imports and provider declarations but masks all string literals before processing and never records endpoint values, credentials, or source snippets in evidence.

---

## 💻 CLI Usage & Commands

```text
USAGE:
  $ npx larats [command] [options]
  $ larats [command] [options]

COMMANDS:
  scan                 Scan repository & generate ARCHITECTURE.md
  view, preview        Open interactive architecture diagram in local browser
  ai                   Export architecture context prompt for AI (Cursor, Claude, Copilot)
  stack                Map technology relationships, save Markdown & open a browser preview
  scaffold, make [name] Scaffold a new module or feature with clean boilerplate
  info                 Show detected project type & architectural flavor
  help                 Display help message

OPTIONS:
  -o, --output <file>    Output path (scan: ARCHITECTURE.md; interactive stack: TECH_STACK.md)
                            Non-interactive stack defaults to terminal output
  --view                 Open local browser viewer immediately after scanning
  --copy                 Copy to clipboard (stack: skips saving/preview unless --output is set)
  --flat                 Render stack badges without category subheadings
  --cursor               Inject architecture rules into .cursorrules
  --claude               Inject architecture rules into CLAUDE.md
  -t, --tree             Print directory tree in terminal
  --html                 Also export standalone ARCHITECTURE.html
  -m, --modular          Enforce modular directory structure
  -s, --standard         Enforce standard/layered directory structure
  --dry-run              Simulate generation without writing files
  -f, --force            Overwrite files if they already exist
  -v, --version          Display CLI version
  -h, --help             Display help message
```

### Examples

```bash
# Scan and save to custom documentation path
larats scan --output docs/ARCHITECTURE.md

# Scaffold a 'Payment' module with modular structure
larats scaffold Payment --modular

# Dry-run test scaffolding without writing files
larats scaffold Order --dry-run
```

---

## ⚠️ Limitations & Notes

- **Express Boilerplate**: For TypeScript projects, the scaffolder generates Express-compatible controllers and routers. If using NestJS, Fastify, or Next.js, use the generated domain logic (DTOs, Repositories, Services) and adapt HTTP routing accordingly.
- **Route Registration**: LaraTS does not automatically alter your main entrypoint files (`routes/api.php`, `src/app.ts`). Recommended mounting code is displayed in next steps upon scaffold completion.
- **Conventions**: Module and component detection relies on standard industry conventions (`app/Modules/`, `src/modules/`, `apps/*/src/`, etc.). Non-standard custom layouts may fall back to generic source classification.

---

## 🛠️ Development & Contributing

```bash
# Clone repository
git clone https://github.com/SidiqFatuh187/Larats.git
cd Larats

# Install dependencies
npm install

# Type-check and build (CLI tests run the distribution bundle)
npm run lint
npm run build

# Run the complete test suite
npm test

# Run only stack regression tests
npx tsx --test tests/techstack.test.ts tests/stack_cli.test.ts

# Smoke-test the local stack command
node dist/index.js stack
node dist/index.js stack --flat --dry-run

# Run local build
node dist/index.js
```

---

## 📄 License

Licensed under the [MIT License](LICENSE).
