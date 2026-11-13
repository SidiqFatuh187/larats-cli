# Changelog

All notable changes to the LaraTS CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2026-11-13

### Added
- `larats stack`: detect technologies from root and nested npm/Composer manifests, source-file extensions, and configuration filenames, including mixed Laravel/frontend projects.
- Interactive technology selection and registry additions; categorized Markdown badges with readable labels and provider logos where available.
- `stack --flat`, `--copy`, `--output`, `--dry-run`, and explicit `--force` overwrite support. Non-interactive stdout contains only Markdown.
- Safe stack output paths and symlink rejection; secret/dependency/build exclusions and actionable malformed-manifest errors.
- Interactive stack generation now saves `TECH_STACK.md` and opens a local browser preview automatically, with overwrite confirmation and a selectable Markdown snippet. Preview HTML is stored outside the project in a temporary directory.
- **Static relationship analysis**: inspects JS/TS imports, reexports, dynamic `import()`, unshadowed `require()`, Vue/Svelte script blocks, PHP namespace imports, Laravel DB facade calls, Prisma datasource providers, and literal Express/fetch HTTP route matching. Generates a Mermaid flowchart with numbered evidence and an SVG diagram in the browser preview.
- Architecture diagram in browser preview: role-lane SVG layout (Frontend, Backend, Data, etc.) with directed arrows, scope grouping, numbered evidence links, and accessible text inventory.

### Notes
- Stack detection and relationship analysis run locally without network requests. Generated badge images load from Shields.io when rendered.
- Detection reports manifest/file evidence, not active services or database runtime configuration. Existing commands and package version are unchanged.
- Relationship analysis limits: 5,000 files max (512 KiB each, 32 MiB total), literal specifiers only, no tsconfig aliases or workspace package resolution. Warnings document every omission.

---

## [1.0.2] - 2026-10-24

### 🚀 Core Fixes (P0)
- **Template Backslash Escaping**: Fixed issue where JS template literals dropped backslashes in `use Illuminate\...` imports.
- **Base Controller Import**: Modular Laravel controllers now import base `App\Http\Controllers\Controller` class when located in custom namespaces.
- **Modular Laravel Scanner**: Recognized domain-driven structures (`app/Modules/`, `modules/`, `Modules/`) and enforced trailing slash module directory checks.
- **Monorepo & Suffix-Free TypeScript Scanner**: Supported `apps/*/src`, `packages/*/src`, custom `srcDir`, and suffix-free layered architectures (`src/controllers/user.ts`).
- **Anti-Duplicate Migrations**: Scaffolder checks for existing migrations matching `*_create_<pluralSnake>_table.php` before creating new timestamped files.
- **Deterministic Documentation**: Removed non-deterministic timestamps and scan durations from `ARCHITECTURE.md`, ensuring byte-identical results and clean Git diffs.
- **Dynamic CLI Architecture Diagram**: Generic/CLI TypeScript projects render dynamic application flows (`Entry -> Source -> Tests`) instead of static web API diagrams.

### 🔒 Security & Hardening (P1)
- **Strict Safe Ignore Filter (`SAFE_IGNORE_LIST`)**: Added exhaustive patterns for SSH keys (`id_rsa*`, `id_ed25519*`, `id_ecdsa*`), cloud credentials (`.aws/**`, `credentials*.json`, `*service-account*.json`), certificates (`.p12`, `.jks`, `.keystore`), and root-scoped build directories (`build/**`, `out/**`, `tmp/**`).
- **Path Traversal Guard**: Scaffolder and scan output destinations reject paths outside the repository root.
- **Protected File Overwrite Guard**: `scan --output` refuses to overwrite non-LaraTS generated files unless explicitly passed `--force`.
- **Atomic File Writing**: Replaced check-and-write sequences with atomic `wx` flag writes to prevent race conditions.
- **Native Arg Parsing (`util.parseArgs`)**: Replaced manual argv slicing with Node's standard `util.parseArgs`, supporting flexible flag ordering (e.g. `larats -o custom.md scan`).
- **Dry Run Support**: Added `--dry-run` simulation for both `scan` and `scaffold` workflows.
- **Non-TTY Protection**: Gracefully exits with error code `1` in headless environments when required arguments are omitted.
- **Shared Module Validator**: Validates module names and blocks collisions with framework primitives (`Model`, `Controller`, etc.).
- **Smart English Pluralization**: Corrected pluralization for consonant+y (`Category` -> `categories`), sibilants (`Box` -> `boxes`), and avoided double-pluralizing already-plural words.
- **Laravel 10 vs 11 Compatibility**: Emits `protected $casts` array for Laravel < 11 and `casts()` method for Laravel 11+.
- **UTF-8 BOM Stripping**: Safely parses `composer.json` and `package.json` files containing byte order marks.
- **Incremental Barrel Exports**: When scaffolding into an existing TypeScript module `index.ts`, appends new exports instead of skipping.
- **TypeScript Templates**: Uses `randomUUID` from `node:crypto` and handles 404 responses with custom `NotFoundError`.

### 📦 Packaging & CI (P2)
- **Pure ESM Distribution**: Switched tsup output to single ESM bundle (`dist/index.js`), removing obsolete CJS and `.d.ts` artifacts.
- **Cross-Platform Test Runner**: Created `scripts/run-tests.mjs` ensuring consistent Node test runner execution on Windows, Linux, and macOS.
- **CI Test Matrix**: GitHub Actions runs across Ubuntu and Windows on Node 18.x, 20.x, and 22.x.
- **Automated PHP 8.3 Syntax Linting**: Added CI job running `php -l` on scaffolded Laravel components.
- **`prepublishOnly` Hook**: Ensures linting, tests, and build pass before npm publishing.

---

## [1.0.1] - 2026-10-24

### Added
- Initial public release of LaraTS CLI.
- Laravel and TypeScript project detection.
- Component scanning and Mermaid flowchart generation.
- Interactive scaffolding for standard and modular directory architectures.

