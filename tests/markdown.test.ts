import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMermaidDiagram,
  generateArchitectureMarkdown,
  generateArchitectureHtml,
  renderTerminalFlow,
} from '../src/generator/markdown.js';
import type { ScanResult } from '../src/scanner.js';

test('generateMermaidDiagram creates valid Laravel flowchart with Filament and Modules', () => {
  const scanResult: ScanResult = {
    projectInfo: {
      type: 'laravel',
      name: 'shop-laravel',
      rootPath: '/dummy',
      summary: 'Laravel 11.0 (Filament)',
      laravel: {
        hasFilament: true,
        hasLivewire: false,
        hasInertia: false,
        hasSanctum: true,
        isModular: true,
      },
    },
    totalFilesScanned: 50,
    components: {
      Models: { name: 'Models', count: 5, files: ['app/Models/User.php'], description: 'Models' },
      Controllers: { name: 'Controllers', count: 3, files: ['app/Http/Controllers/UserController.php'], description: 'Controllers' },
      Services: { name: 'Services', count: 2, files: ['app/Services/UserService.php'], description: 'Services' },
      Actions: { name: 'Actions', count: 2, files: ['app/Actions/CreateUserAction.php'], description: 'Actions' },
      'Filament Resources': { name: 'Filament', count: 2, files: ['app/Filament/Resources/UserResource.php'], description: 'Admin' },
    },
    modules: ['Catalog', 'Checkout'],
    directoryTree: 'app/\n├── Models/\n└── Http/',
    scanDurationMs: 25,
  };

  const mermaid = generateMermaidDiagram(scanResult);

  assert.match(mermaid, /^flowchart TD/);
  assert.match(mermaid, /subgraph EntryLayer/);
  assert.match(mermaid, /Filament Admin Resources/);
  assert.match(mermaid, /Actions\["Action Classes/);
  assert.match(mermaid, /subgraph ModulesLayer/);
  assert.match(mermaid, /Catalog Module/);
  assert.match(mermaid, /Checkout Module/);
});

test('generateArchitectureMarkdown generates complete markdown with security notice', () => {
  const scanResult: ScanResult = {
    projectInfo: {
      type: 'typescript',
      name: 'fintech-api',
      rootPath: '/dummy',
      summary: 'TypeScript (express, Prisma)',
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
    totalFilesScanned: 35,
    components: {
      Controllers: { name: 'Controllers', count: 4, files: ['src/modules/payment/payment.controller.ts'], description: 'Controllers' },
      Services: { name: 'Services', count: 4, files: ['src/modules/payment/payment.service.ts'], description: 'Services' },
      Repositories: { name: 'Repositories', count: 4, files: ['src/modules/payment/payment.repository.ts'], description: 'Repositories' },
    },
    modules: ['payment', 'auth'],
    directoryTree: 'src/\n└── modules/',
    scanDurationMs: 15,
  };

  const md = generateArchitectureMarkdown(scanResult);

  assert.match(md, /# 🏛️ Architecture Overview: fintech-api/);
  assert.match(md, /## 📌 Project Summary/);
  assert.match(md, /## 📊 Architectural Components Statistics/);
  assert.match(md, /## 📦 Detected Modules & Domains \(2\)/);
  assert.match(md, /## 🗺️ Visual Architecture Flowchart/);
  assert.match(md, /```mermaid[\s\S]+```/);
  assert.match(md, /## 🌲 Directory Structure Tree/);
  assert.match(md, /## 🔒 Security & Privacy Notice/);
  assert.match(md, /Zero Network Transmission/);
  assert.match(md, /Safe Exclusion Filter/);
  assert.match(md, /Manifest & Structure Only/);
});

test('renderTerminalFlow outputs correct linear pipeline for Laravel and TypeScript', () => {
  const laravelResult: ScanResult = {
    projectInfo: { type: 'laravel', name: 'my-laravel', rootPath: '/app', summary: 'Laravel' },
    totalFilesScanned: 10,
    components: {
      Routes: { name: 'Routes', count: 3, files: [], description: '' },
      Controllers: { name: 'Controllers', count: 2, files: [], description: '' },
      Services: { name: 'Services', count: 2, files: [], description: '' },
      Models: { name: 'Models', count: 4, files: [], description: '' },
    },
    modules: [],
    directoryTree: '',
    scanDurationMs: 5,
  };

  const flow = renderTerminalFlow(laravelResult);
  assert.equal(flow, 'Client ──> Routes [3] ──> Controllers [2] ──> Services [2] ──> Models [4] ──> Database');

  const tsResult: ScanResult = {
    projectInfo: { type: 'typescript', name: 'my-ts', rootPath: '/app', summary: 'TypeScript' },
    totalFilesScanned: 8,
    components: {
      Routes: { name: 'Routes', count: 2, files: [], description: '' },
      Controllers: { name: 'Controllers', count: 2, files: [], description: '' },
      Services: { name: 'Services', count: 1, files: [], description: '' },
      Repositories: { name: 'Repositories', count: 2, files: [], description: '' },
    },
    modules: [],
    directoryTree: '',
    scanDurationMs: 4,
  };

  const tsFlow = renderTerminalFlow(tsResult);
  assert.equal(tsFlow, 'Client ──> Router [2] ──> Controllers [2] ──> Services [1] ──> Data Layer [2] ──> Database');
});

test('generateArchitectureHtml generates valid HTML document with Mermaid script', () => {
  const scanResult: ScanResult = {
    projectInfo: { type: 'typescript', name: 'html-test', rootPath: '/app', summary: 'TypeScript (express)' },
    totalFilesScanned: 12,
    components: {
      Controllers: { name: 'Controllers', count: 1, files: ['src/user.controller.ts'], description: 'HTTP' },
    },
    modules: ['users'],
    directoryTree: 'src/',
    scanDurationMs: 10,
  };

  const html = generateArchitectureHtml(scanResult);
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /LaraTS Architecture: html-test/);
  assert.match(html, /<pre class="mermaid">/);
  assert.match(html, /https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid/);
  assert.match(html, /Detected Modules & Domains/);
});

