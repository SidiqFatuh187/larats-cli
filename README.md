# LaraTS ⚡

> **Smart Architecture Visualizer & Contextual Module Scaffolder CLI**  
> Tailor-made for **Laravel**, **TypeScript**, and **JavaScript (Node.js)** projects.

[![npm version](https://img.shields.io/npm/v/larats.svg)](https://www.npmjs.com/package/larats)
[![CI](https://github.com/SidiqFatuh187/Larats/actions/workflows/ci.yml/badge.svg)](https://github.com/SidiqFatuh187/Larats/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.3.0-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Offline First](https://img.shields.io/badge/Security-100%25%20Offline-success.svg)](#-strict-security--safety-guarantees)

---

## 💡 What is LaraTS?

When codebases grow large, developers often struggle to understand the architecture or keep module structures consistent across teams. **LaraTS** solves this with three core pillars:

1. 🔍 **Architecture Scanner & Visualizer (`scan`)**: Instantly scans your repository, categorizes layers (Models, Controllers, Services, Actions, Filament Resources, Routes, etc.), and generates a clean `ARCHITECTURE.md` with an interactive **Mermaid.js flowchart** and directory tree.
2. 🏗️ **Contextual Module Scaffolder (`scaffold` / `make`)**: Quickly generates cohesive feature modules with clean, production-ready boilerplate code tailored to your exact stack (Laravel or TypeScript).
3. 🔒 **100% Local & Secure**: No data ever leaves your computer. Sensitive files (`.env`, private keys, vendor folders) are strictly excluded.

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

---

## 🔒 Strict Security & Safety Guarantees

LaraTS was engineered from the ground up for strict security:
- **100% Offline & Local**: Zero network calls, telemetry, or third-party tracking.
- **Strict Ignore List (`SAFE_IGNORE_LIST`)**:
  - Never reads or includes `**/node_modules/**`, `**/vendor/**`, `**/.git/**`, `**/storage/**`, `**/dist/**`, `build/**`, `out/**`, `tmp/**`.
  - Never touches keys or cloud secrets: `**/.env*`, `**/*.pem`, `**/*.key`, `**/*.p12`, `**/*.jks`, `**/*.keystore`, `**/.aws/**`, `**/.ssh/**`, `**/secrets/**`, `**/credentials*.json`, `**/*service-account*.json`, `**/id_rsa*`, `**/id_ed25519*`, `**/id_ecdsa*`.
  - Never indexes lock/log files: `**/*.log`, `**/*.lock`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `composer.lock`.
- **Manifest & Structure Only**: Scanner safely inspects package manifests (`package.json`, `composer.json`) solely to identify framework and ORM types, and relative file paths to categorize layers. It never reads private configuration values, `.env*` secrets, or internal application logic.

---

## 💻 CLI Usage & Commands

```text
USAGE:
  $ npx larats [command] [options]
  $ larats [command] [options]

COMMANDS:
  scan                 Scan repository & generate ARCHITECTURE.md
  view, preview        Open interactive architecture diagram in local browser
  scaffold, make [name] Scaffold a new module or feature with clean boilerplate
  info                 Show detected project type & architectural flavor
  help                 Display help message

OPTIONS:
  -o, --output <file>    Output path for scan (default: ARCHITECTURE.md)
  --view                 Open local browser viewer immediately after scanning
  -t, --tree             Print directory tree in terminal
  --html                 Also export standalone ARCHITECTURE.html
  -m, --modular          Enforce modular directory structure
  -s, --standard         Enforce standard/layered directory structure
  --dry-run              Simulate generation without writing files
  -f, --force            Overwrite files if they already exist
  -v, --version          Display CLI version
  -h, --help             Display help message

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

# Run test suite
npm test

# Build distribution bundle
npm run build

# Run local build
node dist/index.js
```

---

## 📄 License

Licensed under the [MIT License](LICENSE).
