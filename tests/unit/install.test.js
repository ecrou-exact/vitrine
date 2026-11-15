// @ts-check
import { afterEach, describe, expect, it } from 'vitest';
import {
  linesText,
  readCommands,
  words,
  writeLines,
} from '../../src/components/install/commands.js';
import { VtInstall, readSource } from '../../src/components/install/vt-install.js';
import { shellQuote } from '../../src/core/shell.js';

if (!customElements.get('vt-install')) customElements.define('vt-install', VtInstall);

/**
 * @param {string} command
 * @param {string} manager
 * @returns {string | null}
 */
function write(command, manager) {
  const lines = writeLines(readCommands(command).lines, manager);
  return lines && linesText(lines);
}

/**
 * @param {Record<string, string>} attributes
 * @param {string} [content]
 * @returns {Promise<VtInstall>}
 */
async function mount(attributes, content) {
  const el = /** @type {VtInstall} */ (document.createElement('vt-install'));
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  if (content !== undefined) el.content = content;
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe('reading commands', () => {
  it('splits words like a shell, and refuses expansions', () => {
    expect(words(`npm i "a b" 'c'`)).toEqual(['npm', 'i', 'a b', 'c']);
    expect(words('npm ci && npm test')).toEqual(['npm', 'ci', '&&', 'npm', 'test']);
    expect(words('echo $HOME')).toBeNull();
    expect(words('npm i x; rm -rf /')).toBeNull();
    expect(words('a | b')).toBeNull();
    expect(words('"unclosed')).toBeNull();
  });

  it('writes an npm install for every manager', () => {
    expect(write('npm i -D vitest', 'pnpm')).toBe('pnpm add -D vitest');
    expect(write('npm i -D vitest', 'yarn')).toBe('yarn add -D vitest');
    expect(write('npm i -D vitest', 'bun')).toBe('bun add -d vitest');
    expect(write('npm i -D vitest', 'deno')).toBe('deno add --dev npm:vitest');
    expect(write('pnpm add -E react', 'npm')).toBe('npm install --save-exact react');
    expect(write('yarn global add serve', 'npm')).toBe('npm install -g serve');
  });

  it('writes exec, create, run and ci', () => {
    expect(write('npx -y cowsay hi', 'pnpm')).toBe('pnpm dlx cowsay hi');
    expect(write('npx cowsay', 'bun')).toBe('bunx cowsay');
    expect(write('npm create vite@latest app -- --template vue', 'pnpm')).toBe(
      'pnpm create vite@latest app --template vue',
    );
    expect(write('pnpm create vite app --template vue', 'npm')).toBe(
      'npm create vite app -- --template vue',
    );
    expect(write('npm init vite', 'yarn')).toBe('yarn create vite');
    expect(write('npm run build -- --watch', 'yarn')).toBe('yarn run build --watch');
    expect(write('yarn run build --watch', 'npm')).toBe('npm run build -- --watch');
    expect(write('npm test', 'deno')).toBe('deno task test');
    expect(write('npm ci', 'yarn')).toBe('yarn install --immutable');
    expect(write('pnpm install --frozen-lockfile', 'npm')).toBe('npm ci');
  });

  it('writes Python commands, or none when a manager has no equivalent', () => {
    expect(write('pip install "requests>=2.31"', 'uv')).toBe(`uv add 'requests>=2.31'`);
    expect(write('poetry add --group dev pytest', 'pdm')).toBe('pdm add -d pytest');
    expect(write('uv add --dev pytest', 'poetry')).toBe('poetry add --group dev pytest');
    expect(write('pipx install ruff', 'uv')).toBe('uv tool install ruff');
    expect(write('uvx ruff check', 'pip')).toBe('pipx run ruff check');
    expect(write('uvx ruff check', 'poetry')).toBeNull();
    expect(write('pip install -r requirements.txt', 'uv')).toBe('uv pip install -r requirements.txt'); // prettier-ignore
    expect(readCommands('python -m pip install flask').ecosystem).toBe('python');
  });

  it('keeps lines it does not understand, in their own tab only', () => {
    expect(write('cd my-app && npm i', 'pnpm')).toBe('cd my-app && pnpm install');
    expect(write('npm i --legacy-peer-deps a', 'npm')).toBe('npm i --legacy-peer-deps a');
    expect(write('npm i --legacy-peer-deps a', 'pnpm')).toBeNull();
    expect(write('# Then\nnpm start', 'bun')).toBe('# Then\nbun run start');
  });

  it('quotes words that a shell would read otherwise', () => {
    expect(shellQuote('react@^18')).toBe('react@^18');
    expect(shellQuote('a>=1')).toBe(`'a>=1'`);
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
    expect(shellQuote('$(id)')).toBe(`'$(id)'`);
    expect(shellQuote('~/x')).toBe(`'~/x'`);
    // A package name from JSON cannot add a command.
    const el = new VtInstall();
    el.setAttribute('package', 'x;rm');
    expect(linesText(/** @type {any} */ (el.tabs[0].lines))).toBe(`npm install 'x;rm'`);
  });

  it('reads JSON with tabs given as they are', () => {
    expect(readSource('{"command":"npm i a","tabs":{"CDN":"<script src=x></script>"}}')).toEqual({
      command: 'npm i a',
      tabs: [['CDN', '<script src=x></script>']],
    });
    expect(readSource('npm i a')).toEqual({ command: 'npm i a', tabs: [] });
  });
});

describe('<vt-install>', () => {
  it('shows a tab per manager from the package attribute', async () => {
    const el = await mount({ package: 'vitrine', dev: '' });
    const tabs = [...el.root.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    expect(tabs).toEqual(['npm', 'pnpm', 'yarn', 'bun']);
    expect(el.root.querySelector('.ins-code')?.textContent).toBe('$ npm install -D vitrine');
  });

  it('chooses Python managers from the command, and shows a missing equivalent', async () => {
    const el = await mount({ managers: 'pip,uv,poetry' }, 'uvx ruff');
    expect(el.tabs.map((t) => t.label)).toEqual(['pip', 'uv', 'poetry']);
    el.selected = 'poetry';
    expect(el.root.querySelector('.ins-none')?.textContent).toContain('poetry');
    expect(el.root.querySelector('[part~="copy-button"]')).toBeNull();
  });

  it('syncs the choice across the page and remembers it', async () => {
    const a = await mount({}, 'npm i a');
    const b = await mount({}, 'npm i b');
    /** @type {string[]} */
    const seen = [];
    a.addEventListener('vt-tab-change', (e) => seen.push(/** @type {CustomEvent} */ (e).detail.tab)); // prettier-ignore
    /** @type {HTMLElement} */ (a.root.querySelectorAll('[role="tab"]')[2]).click();
    /** @type {HTMLElement | null} */ (a.root.activeElement)?.blur();
    expect(seen).toEqual(['yarn']);
    expect(b.selected).toBe('yarn');
    expect(b.root.querySelector('.ins-code')?.textContent).toBe('$ yarn add b');
    expect(localStorage.getItem('vitrine-install:install')).toBe('yarn');
    const c = await mount({}, 'npm i c');
    expect(c.selected).toBe('yarn');
    const d = await mount({ sync: 'false' }, 'npm i d');
    expect(d.selected).toBe('npm');
  });

  it('adds tabs given as children and hides the prompt for them', async () => {
    const el = /** @type {VtInstall} */ (document.createElement('vt-install'));
    el.innerHTML = 'npm i vitrine<template data-tab="CDN"><script src="x.js"></script></template>';
    document.body.append(el);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(el.tabs.map((t) => t.label)).toEqual(['npm', 'pnpm', 'yarn', 'bun', 'CDN']);
    el.selected = 'CDN';
    expect(el.root.querySelector('.ins-code')?.textContent).toBe('<script src="x.js"></script>');
  });
});
