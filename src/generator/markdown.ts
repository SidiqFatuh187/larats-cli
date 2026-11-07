import type { ScanResult } from '../scanner.js';
import { SAFE_IGNORE_LIST } from '../scanner.js';

/**
 * Escape pipe and newline characters in Markdown table cells.
 */
export function mdCell(str: string): string {
  if (!str) return '-';
  const cleaned = str.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();
  return cleaned || '-';
}

/**
 * Format markdown code fence handling nested backticks safely.
 */
export function fence(body: string, lang: string = ''): string {
  const matches = body.match(/`+/g);
  let maxBackticks = 2;
  if (matches) {
    for (const match of matches) {
      if (match.length > maxBackticks) maxBackticks = match.length;
    }
  }
  const f = '`'.repeat(maxBackticks + 1);
  return `${f}${lang ? lang : ''}\n${body}\n${f}`;
}

/**
 * Escape text for safe rendering in Mermaid diagram node labels and sanitize characters.
 */
export function mermaidLabel(str: string, maxLen: number = 40): string {
  if (!str) return '';
  let cleaned = str
    .replace(/"/g, "'")
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`/g, "'")
    .replace(/[\[\]\(\)\{\}]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
  if (cleaned.length > maxLen) {
    cleaned = cleaned.slice(0, maxLen - 3) + '...';
  }
  return cleaned;
}

/**
 * Render feature modules subgraph for Mermaid diagrams.
 */
function renderModulesSubgraph(modules: string[]): string {
  if (modules.length === 0) return '';
  let output = `\n    subgraph ModulesLayer ["📦 Detected Modules (${modules.length})"]\n`;
  modules.slice(0, 6).forEach((mod, idx) => {
    output += `        Mod_${idx}["${mermaidLabel(mod)} Module"]:::service\n`;
  });
  if (modules.length > 6) {
    output += `        Mod_More["...and ${modules.length - 6} more modules"]:::service\n`;
  }
  output += `    end\n`;
  return output;
}

/**
 * Generate a dynamic Mermaid.js diagram representing only the components and layers
 * that actually exist in the scanned codebase.
 */
export function generateMermaidDiagram(scanResult: ScanResult): string {
  const { projectInfo, components, modules } = scanResult;

  if (projectInfo.type === 'laravel') {
    const hasFilament = projectInfo.laravel?.hasFilament || (components['Filament Resources']?.count ?? 0) > 0;
    const hasActions = (components['Actions']?.count ?? 0) > 0;
    const hasServices = (components['Services']?.count ?? 0) > 0;
    const hasRequests = (components['Form Requests']?.count ?? 0) > 0;
    const hasModels = (components['Models']?.count ?? 0) > 0;
    const hasMigrations = (components['Migrations']?.count ?? 0) > 0;

    let diagram = `flowchart TD
    %% Styling Definitions
    classDef client fill:#E0F2FE,stroke:#0284C7,stroke-width:2px,color:#0369A1;
    classDef routing fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#B45309;
    classDef controller fill:#DCFCE7,stroke:#16A34A,stroke-width:2px,color:#15803D;
    classDef service fill:#F3E8FF,stroke:#9333EA,stroke-width:2px,color:#7E22CE;
    classDef data fill:#FEE2E2,stroke:#DC2626,stroke-width:2px,color:#B91C1C;
    classDef db fill:#F1F5F9,stroke:#475569,stroke-width:2px,color:#334155;

    subgraph EntryLayer ["1. Client & Entrypoints"]
        Client["Client / Browser / API Consumer"]:::client
        Routes["HTTP Routes"]:::routing
    end
`;

    if (hasRequests) {
      diagram += `
    subgraph RequestLayer ["2. Request Pipeline & Validation"]
        Middleware["Middleware Pipeline<br/>(Auth, CSRF, Rate Limiting)"]:::routing
        FormRequests["Form Requests<br/>(Validation & Authorization)"]:::routing
    end
`;
    }

    diagram += `
    subgraph HttpLayer ["3. Controllers & Presentation"]
        Controllers["HTTP Controllers"]:::controller
`;
    if (hasFilament) {
      diagram += `        Filament["Filament Admin Resources"]:::controller\n`;
    }
    diagram += `    end\n`;

    if (hasServices || hasActions) {
      diagram += `
    subgraph DomainLayer ["4. Domain & Business Logic"]
`;
      if (hasServices) {
        diagram += `        Services["Service Classes"]:::service\n`;
      }
      if (hasActions) {
        diagram += `        Actions["Action Classes"]:::service\n`;
      }
      diagram += `    end\n`;
    }

    diagram += `
    subgraph DataLayer ["5. Data Persistence & Storage"]
`;
    if (hasModels) {
      diagram += `        Models["Eloquent Models"]:::data\n`;
    }
    diagram += `        Database[("Database<br/>(MySQL / Postgres / SQLite)")]:::db\n`;
    if (hasMigrations) {
      diagram += `        Migrations["Database Migrations"]:::data\n`;
    }
    diagram += `    end\n\n`;

    // Connect nodes dynamically
    diagram += `    Client --> Routes\n`;

    if (hasRequests) {
      diagram += `    Routes --> Middleware\n`;
      diagram += `    Middleware --> FormRequests\n`;
      diagram += `    FormRequests --> Controllers\n`;
    } else {
      diagram += `    Routes --> Controllers\n`;
    }

    if (hasServices && hasActions) {
      diagram += `    Controllers --> Services\n`;
      diagram += `    Controllers --> Actions\n`;
      if (hasModels) {
        diagram += `    Services --> Models\n`;
        diagram += `    Actions --> Models\n`;
      } else {
        diagram += `    Services --> Database\n`;
        diagram += `    Actions --> Database\n`;
      }
    } else if (hasServices) {
      diagram += `    Controllers --> Services\n`;
      if (hasModels) {
        diagram += `    Services --> Models\n`;
      } else {
        diagram += `    Services --> Database\n`;
      }
    } else if (hasActions) {
      diagram += `    Controllers --> Actions\n`;
      if (hasModels) {
        diagram += `    Actions --> Models\n`;
      } else {
        diagram += `    Actions --> Database\n`;
      }
    } else {
      if (hasModels) {
        diagram += `    Controllers --> Models\n`;
      } else {
        diagram += `    Controllers --> Database\n`;
      }
    }

    if (hasFilament) {
      if (hasModels) {
        diagram += `    Client --> Filament\n    Filament --> Models\n`;
      } else {
        diagram += `    Client --> Filament\n    Filament --> Database\n`;
      }
    }

    if (hasModels) {
      diagram += `    Models --> Database\n`;
    }
    if (hasMigrations) {
      diagram += `    Migrations -.-> Database\n`;
    }

    if (modules.length > 0) {
      diagram += renderModulesSubgraph(modules);
    }

    return diagram;
  }

  if (projectInfo.type === 'typescript') {
    const rawFw = projectInfo.typescript?.framework || 'express';
    const fwDisplay =
      rawFw !== 'unknown' && rawFw !== 'node-vanilla'
        ? `${rawFw.charAt(0).toUpperCase() + rawFw.slice(1)} Router`
        : 'API Endpoints & Handlers';

    const orm = projectInfo.typescript?.hasPrisma ? 'Prisma' : projectInfo.typescript?.hasTypeORM ? 'TypeORM' : projectInfo.typescript?.hasDrizzle ? 'Drizzle' : null;

    const hasControllers = (components['Controllers']?.count ?? 0) > 0;
    const hasServices = (components['Services']?.count ?? 0) > 0;
    const hasRepositories = (components['Repositories']?.count ?? 0) > 0;
    const hasDtos = (components['DTOs & Schemas']?.count ?? 0) > 0;
    const hasUi = (components['UI Components']?.count ?? 0) > 0;
    const hasModels = (components['Models & Entities']?.count ?? 0) > 0;
    const hasAnyLayer = hasControllers || hasServices || hasRepositories || hasDtos || hasUi || hasModels;

    if (hasAnyLayer) {
      let diagram = `flowchart TD
    %% Styling Definitions
    classDef client fill:#E0F2FE,stroke:#0284C7,stroke-width:2px,color:#0369A1;
    classDef routing fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#B45309;
    classDef controller fill:#DCFCE7,stroke:#16A34A,stroke-width:2px,color:#15803D;
    classDef service fill:#F3E8FF,stroke:#9333EA,stroke-width:2px,color:#7E22CE;
    classDef data fill:#FEE2E2,stroke:#DC2626,stroke-width:2px,color:#B91C1C;
    classDef db fill:#F1F5F9,stroke:#475569,stroke-width:2px,color:#334155;

    subgraph EntryLayer ["1. Client & API Gateway"]
        Client["Frontend / API Client"]:::client
        Router["Router & Endpoints<br/>(${fwDisplay})"]:::routing
    end
`;

      if (hasUi) {
        diagram += `
    subgraph UiLayer ["Frontend Presentation"]
        UiComponents["UI Components<br/>(src/components)"]:::controller
    end
`;
      }

      if (hasDtos) {
        diagram += `
    subgraph ValidationLayer ["2. Validation & Schemas"]
        DTOs["DTOs & Schemas<br/>(Input Validation)"]:::routing
    end
`;
      }

      if (hasControllers) {
        diagram += `
    subgraph ControllerLayer ["3. Controllers"]
        Controllers["Controllers<br/>(Request Handling)"]:::controller
    end
`;
      }

      if (hasServices) {
        diagram += `
    subgraph ServiceLayer ["4. Application Services"]
        Services["Domain Services<br/>(Business Logic)"]:::service
    end
`;
      }

      diagram += `
    subgraph PersistenceLayer ["5. Data Layer & Storage"]
`;
      if (hasRepositories) {
        diagram += `        Repositories["Repositories / Data Access<br/>(${orm || 'Data Layer'})"]:::data\n`;
      } else if (hasModels) {
        diagram += `        Entities["Models & Entities<br/>(${orm || 'ORM'})"]:::data\n`;
      }
      diagram += `        Database[("Database / Storage")]:::db\n`;
      diagram += `    end\n\n`;

      // Dynamic Connections
      diagram += `    Client --> Router\n`;
      if (hasUi) {
        diagram += `    Client --> UiComponents\n`;
        diagram += `    UiComponents --> Router\n`;
      }

      let previousNode = 'Router';
      if (hasDtos) {
        diagram += `    ${previousNode} --> DTOs\n`;
        previousNode = 'DTOs';
      }

      if (hasControllers) {
        diagram += `    ${previousNode} --> Controllers\n`;
        previousNode = 'Controllers';
      }

      if (hasServices) {
        diagram += `    ${previousNode} --> Services\n`;
        previousNode = 'Services';
      }

      if (hasRepositories) {
        diagram += `    ${previousNode} --> Repositories\n`;
        diagram += `    Repositories --> Database\n`;
      } else if (hasModels) {
        diagram += `    ${previousNode} --> Entities\n`;
        diagram += `    Entities --> Database\n`;
      } else {
        diagram += `    ${previousNode} --> Database\n`;
      }

      if (modules.length > 0) {
        diagram += renderModulesSubgraph(modules);
      }

      return diagram;
    }
  }

  // Generic / CLI projects
  const hasEntry = (components['Source Files']?.files || []).some((f) =>
    /(?:^|\/)(?:index|cli|main|bin)\.[a-z]+$/i.test(f)
  );
  const hasSource = (components['Source Files']?.count ?? 0) > 0;
  const hasTests = (components['Test Files']?.count ?? 0) > 0;

  let diagram = `flowchart TD
    classDef client fill:#E0F2FE,stroke:#0284C7,stroke-width:2px,color:#0369A1;
    classDef core fill:#DCFCE7,stroke:#16A34A,stroke-width:2px,color:#15803D;
    classDef test fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#B45309;

    subgraph App ["CLI & Application Architecture"]
`;
  if (hasEntry) {
    diagram += `        Entry["Entrypoint CLI (bin/)"]:::client\n`;
  }
  if (hasSource) {
    diagram += `        Source["Core Modules & Generators (src/)"]:::core\n`;
  }
  if (hasTests) {
    diagram += `        Tests["Automated Test Suites (tests/)"]:::test\n`;
  }
  if (!hasEntry && !hasSource && !hasTests) {
    diagram += `        Source["Source Files"]:::core\n`;
  }
  diagram += `    end\n\n`;

  if (hasEntry && hasSource) {
    diagram += `    Entry --> Source\n`;
  }
  if (hasTests && hasSource) {
    diagram += `    Tests -.-> Source\n`;
  }

  return diagram;
}

/**
 * Generate full ARCHITECTURE.md markdown content.
 */
export function generateArchitectureMarkdown(scanResult: ScanResult): string {
  const { projectInfo, totalFilesScanned, components, modules, directoryTree } = scanResult;

  const mermaid = generateMermaidDiagram(scanResult);

  // Component statistics rows
  const componentRows = Object.entries(components)
    .map(([, comp]) => {
      const sampleFiles = comp.files.slice(0, 3).map((f) => `\`${f}\``).join(', ');
      const moreSuffix = comp.files.length > 3 ? ` *(+${comp.files.length - 3} more)*` : '';
      return `| **${mdCell(comp.name)}** | \`${comp.count}\` | ${mdCell(comp.description)} | ${sampleFiles ? mdCell(sampleFiles + moreSuffix) : '-'} |`;
    })
    .join('\n');

  // Modules section if present
  let modulesSection = '';
  if (modules.length > 0) {
    modulesSection = `
## 📦 Detected Modules & Domains (${modules.length})

This project organizes features into modular domains:

${modules.map((m) => `- **\`${m}\`**`).join('\n')}
`;
  }

  // Security notice generated from SAFE_IGNORE_LIST
  const sampleIgnores = SAFE_IGNORE_LIST.slice(0, 8).map((p) => `\`${p}\``).join(', ');
  const securityNotice = `## 🔒 Security & Privacy Notice

This architectural map was produced with strict privacy guarantees:
- **Zero Network Transmission:** Executed locally without telemetry, tracking, or outbound communication.
- **Safe Exclusion Filter:** Automatically ignores sensitive files and secret patterns (${sampleIgnores}, etc.) including \`node_modules\`, \`vendor\`, \`.env*\`, private keys, secrets, credentials, cloud configs, and cache folders.
- **Manifest & Structure Only:** Safely reads standard manifest dependencies (\`package.json\` / \`composer.json\`) to determine framework types, and relative file paths to categorize components. Never reads private configurations or file contents.

*Generated with ❤️ by LaraTS CLI.*`;

  return `# 🏛️ Architecture Overview: ${projectInfo.name}

> Auto-generated by **[LaraTS CLI](https://github.com/SidiqFatuh187/Larats)**.  
> **100% Local & Safe:** Generated entirely in offline mode via local filesystem manifest & structure analysis. Zero data transmitted.

---

## 📌 Project Summary

| Attribute | Details |
| :--- | :--- |
| **Project Name** | \`${projectInfo.name}\` |
| **Project Type** | **${projectInfo.type.toUpperCase()}** |
| **Detected Stack** | \`${projectInfo.summary}\` |
| **Scanned Files** | \`${totalFilesScanned}\` files indexed (safe ignore filter applied) |

---

## 📊 Architectural Components Statistics

| Component Layer | Count | Description | Sample Files |
| :--- | :---: | :--- | :--- |
${componentRows || '| *No architectural components identified* | `0` | - | - |'}
${modulesSection}
---

## 🗺️ Visual Architecture Flowchart

Visual representation of the project layers and request lifecycle rendered with [Mermaid.js](https://mermaid.js.org/):

${fence(mermaid, 'mermaid')}

---

## 🌲 Directory Structure Tree

Clean, high-level directory tree showing key folders (ignoring build artifacts, vendor files, and sensitive keys):

${fence(directoryTree || '(Empty directory structure)', 'text')}

---

${securityNotice}
`;
}

/**
 * Render a concise, clean ASCII architecture request pipeline for terminal output.
 */
export function renderTerminalFlow(scanResult: ScanResult): string {
  const { projectInfo, components } = scanResult;
  const steps: string[] = [];

  if (projectInfo.type === 'laravel') {
    steps.push('Client');
    const routes = components['Routes']?.count ?? 0;
    if (routes > 0) steps.push(`Routes [${routes}]`);
    const requests = components['Form Requests']?.count ?? 0;
    if (requests > 0) steps.push(`Requests [${requests}]`);
    const controllers = components['Controllers']?.count ?? 0;
    if (controllers > 0) steps.push(`Controllers [${controllers}]`);
    const services = (components['Services']?.count ?? 0) + (components['Actions']?.count ?? 0);
    if (services > 0) steps.push(`Services [${services}]`);
    const models = components['Models']?.count ?? 0;
    if (models > 0) steps.push(`Models [${models}]`);
    steps.push('Database');
  } else if (projectInfo.type === 'typescript') {
    const hasAnyLayer = ['Controllers', 'Services', 'Repositories', 'Routes', 'DTOs & Schemas', 'Models & Entities', 'UI Components']
      .some((k) => (components[k]?.count ?? 0) > 0);

    if (hasAnyLayer) {
      steps.push('Client');
      const ui = components['UI Components']?.count ?? 0;
      if (ui > 0) steps.push(`UI [${ui}]`);
      const routes = components['Routes']?.count ?? 0;
      if (routes > 0) steps.push(`Router [${routes}]`);
      const dtos = components['DTOs & Schemas']?.count ?? 0;
      if (dtos > 0) steps.push(`DTOs [${dtos}]`);
      const controllers = components['Controllers']?.count ?? 0;
      if (controllers > 0) steps.push(`Controllers [${controllers}]`);
      const services = components['Services']?.count ?? 0;
      if (services > 0) steps.push(`Services [${services}]`);
      const data = (components['Repositories']?.count ?? 0) + (components['Models & Entities']?.count ?? 0);
      if (data > 0) steps.push(`Data Layer [${data}]`);
      steps.push('Database');
    } else {
      const src = components['Source Files']?.count ?? 0;
      const tests = components['Test Files']?.count ?? 0;
      steps.push('CLI / Entrypoint');
      if (src > 0) steps.push(`Source Modules [${src}]`);
      if (tests > 0) steps.push(`Test Suites [${tests}]`);
    }
  } else {
    const src = components['Source Files']?.count ?? 0;
    const tests = components['Test Files']?.count ?? 0;
    steps.push('Project Root');
    if (src > 0) steps.push(`Source [${src}]`);
    if (tests > 0) steps.push(`Tests [${tests}]`);
  }

  return steps.join(' ──> ');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate standalone interactive HTML architecture viewer with Mermaid.js.
 */
export function generateArchitectureHtml(scanResult: ScanResult): string {
  const { projectInfo, totalFilesScanned, components, modules, directoryTree } = scanResult;
  const mermaid = generateMermaidDiagram(scanResult);

  const componentRowsHtml = Object.entries(components)
    .map(([, comp]) => {
      const samples = comp.files.slice(0, 3).map((f) => `<code>${escapeHtml(f)}</code>`).join(', ');
      const more = comp.files.length > 3 ? ` <span class="muted">(+${comp.files.length - 3} more)</span>` : '';
      return `<tr>
        <td><strong>${escapeHtml(comp.name)}</strong></td>
        <td><span class="badge">${comp.count}</span></td>
        <td>${escapeHtml(comp.description)}</td>
        <td>${samples ? samples + more : '-'}</td>
      </tr>`;
    })
    .join('\n');

  const modulesHtml = modules.length > 0
    ? `<div class="card">
        <h2>📦 Detected Modules & Domains (${modules.length})</h2>
        <div class="modules-grid">
          ${modules.map((m) => `<div class="module-item"><code>${escapeHtml(m)}</code></div>`).join('\n')}
        </div>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LaraTS Architecture: ${escapeHtml(projectInfo.name)}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --muted: #94a3b8;
      --border: #334155;
      --primary: #38bdf8;
      --accent: #818cf8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      padding: 2rem 1rem;
    }
    .container { max-width: 1080px; margin: 0 auto; }
    header { margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; }
    .header-top { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
    h1 { font-size: 1.8rem; font-weight: 700; color: #fff; }
    .pill { background: #0284c7; color: #fff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 600; }
    .subtitle { color: var(--muted); margin-top: 0.5rem; font-size: 0.95rem; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem; }
    h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; color: #e2e8f0; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; font-size: 0.9rem; }
    th, td { text-align: left; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .badge { background: #334155; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 600; font-size: 0.85rem; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: #090d16; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85rem; color: #38bdf8; }
    pre { background: #090d16; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.85rem; border: 1px solid var(--border); line-height: 1.4; }
    .mermaid-box { display: flex; justify-content: center; background: #090d16; border-radius: 8px; padding: 2rem 1rem; overflow-x: auto; border: 1px solid var(--border); }
    .modules-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .module-item { background: #090d16; border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 1rem; }
    .muted { color: var(--muted); font-size: 0.85rem; }
    footer { text-align: center; color: var(--muted); font-size: 0.85rem; margin-top: 3rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-top">
        <div>
          <h1>🏛️ Architecture Overview: ${escapeHtml(projectInfo.name)}</h1>
          <p class="subtitle">Stack: <strong>${escapeHtml(projectInfo.summary)}</strong> &bull; Total Files: <strong>${totalFilesScanned}</strong></p>
        </div>
        <span class="pill">LaraTS Architecture Map</span>
      </div>
    </header>

    <div class="card">
      <h2>🗺️ Interactive Architecture Flowchart</h2>
      <div class="mermaid-box">
        <pre class="mermaid">${mermaid}</pre>
      </div>
    </div>

    <div class="card">
      <h2>📊 Architectural Component Statistics</h2>
      <table>
        <thead>
          <tr>
            <th>Component Layer</th>
            <th>Files</th>
            <th>Description</th>
            <th>Sample Files</th>
          </tr>
        </thead>
        <tbody>
          ${componentRowsHtml || '<tr><td colspan="4">No architectural components detected</td></tr>'}
        </tbody>
      </table>
    </div>

    ${modulesHtml}

    <div class="card">
      <h2>🌲 Directory Structure Tree</h2>
      <pre><code>${escapeHtml(directoryTree || '(Empty directory)')}</code></pre>
    </div>

    <footer>
      Generated locally &amp; offline with ❤️ by <strong>LaraTS CLI</strong>
    </footer>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    if (typeof mermaid !== 'undefined') {
      mermaid.initialize({
        startOnLoad: true,
        theme: 'dark',
        flowchart: { curve: 'basis' }
      });
    }
  </script>
</body>
</html>`;
}
