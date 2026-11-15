// @ts-check
/**
 * Install commands: a command written for one package manager (npm, pnpm, yarn, bun, pip, uv,
 * poetry, pdm…) is read into what it does, then written again for every other manager.
 *
 * A line that is not understood is kept as written; nothing is ever run.
 *
 * @module components/install/commands
 */
import { shellQuote } from '../../core/shell.js';

export { shellQuote };

/** @typedef {'js' | 'python'} Ecosystem */
/** @typedef {'install' | 'ci' | 'add' | 'remove' | 'global' | 'exec' | 'create' | 'init' | 'run'} Action */
/** @typedef {{ dev: boolean, exact: boolean, optional: boolean, peer: boolean, upgrade: boolean }} Flags */

/**
 * What a command does.
 *
 * @typedef {object} Intent
 * @property {Ecosystem} ecosystem
 * @property {Action} action
 * @property {string[]} packages - Packages, or the script of `run`.
 * @property {string[]} args - Arguments passed on (`create`, `exec`, `run`), or `-r file`.
 * @property {Flags} flags
 */

/** @typedef {{ text: string, kind: 'cmd' | 'flag' | 'pkg' | 'arg' | 'op' | 'comment' | 'raw' }} Token */
/** @typedef {{ intent: Intent } | { words: string[] } | { raw: string }} Part */
/** @typedef {{ comment: string } | { parts: Part[] }} Line */

/** Package managers by ecosystem, in the order of their tabs. */
export const MANAGERS = Object.freeze({
  js: Object.freeze(['npm', 'pnpm', 'yarn', 'bun', 'deno']),
  python: Object.freeze(['pip', 'uv', 'poetry', 'pdm']),
});

/** Tabs shown when `managers` is not set. */
export const DEFAULT_MANAGERS = Object.freeze({
  js: Object.freeze(['npm', 'pnpm', 'yarn', 'bun']),
  python: Object.freeze(['pip', 'uv', 'poetry']),
});

export const ACTIONS = /** @type {const} */ ([
  'add', 'install', 'ci', 'remove', 'global', 'exec', 'create', 'init', 'run',
]); // prettier-ignore

/** Lines read from one source. */
const MAX_LINES = 50;
/** Words of one line. */
const MAX_WORDS = 100;

/** @returns {Flags} */
const noFlags = () => ({ dev: false, exact: false, optional: false, peer: false, upgrade: false });

// ---------------------------------------------------------------- words

/**
 * Splits a line into words with single and double quotes, like a shell without expansions.
 * `&&` is its own word. Other shell operators, `$` and backquotes make the line unreadable.
 *
 * @param {string} line
 * @returns {string[] | null}
 */
export function words(line) {
  /** @type {string[]} */
  const out = [];
  let word = '';
  let inWord = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "'" || char === '"') {
      const end = line.indexOf(char, i + 1);
      if (end < 0) return null;
      const inner = line.slice(i + 1, end);
      if (char === '"' && /[$`\\]/.test(inner)) return null;
      word += inner;
      inWord = true;
      i = end;
    } else if (/\s/.test(char)) {
      if (inWord) out.push(word);
      word = '';
      inWord = false;
    } else if (char === '&' && line[i + 1] === '&') {
      if (inWord) out.push(word);
      out.push('&&');
      word = '';
      inWord = false;
      i += 1;
    } else if (/[|;<>&$`\\()]/.test(char)) return null;
    else {
      word += char;
      inWord = true;
    }
  }
  if (inWord) out.push(word);
  return out.length > MAX_WORDS ? null : out;
}

// ---------------------------------------------------------------- reading

const JS_FLAGS = /** @type {Record<string, keyof Flags | 'global'>} */ ({
  '-D': 'dev', '--save-dev': 'dev', '--dev': 'dev', '-d': 'dev',
  '-g': 'global', '--global': 'global',
  '-E': 'exact', '--save-exact': 'exact', '--exact': 'exact',
  '-O': 'optional', '--save-optional': 'optional', '--optional': 'optional',
  '--save-peer': 'peer', '--peer': 'peer',
}); // prettier-ignore

const PY_FLAGS = /** @type {Record<string, keyof Flags | 'global'>} */ ({
  '-g': 'global', '-U': 'upgrade', '--upgrade': 'upgrade', '--dev': 'dev', '-d': 'dev', '-D': 'dev',
}); // prettier-ignore

/**
 * Reads flags and packages. `null` when a flag is not known: the line is then kept as written.
 *
 * @param {string[]} rest
 * @param {Record<string, string>} table
 * @returns {{ packages: string[], flags: Flags, global: boolean, args: string[] } | null}
 */
function readArgs(rest, table) {
  const flags = noFlags();
  /** @type {string[]} */
  const packages = [];
  /** @type {string[]} */
  const args = [];
  let global = false;
  for (let i = 0; i < rest.length; i += 1) {
    const word = rest[i];
    if (!word.startsWith('-')) {
      packages.push(word);
      continue;
    }
    // A group named dev (poetry, pdm, uv) is a development dependency.
    if (['--group', '-G'].includes(word) && rest[i + 1] === 'dev') {
      flags.dev = true;
      i += 1;
      continue;
    }
    if (['-r', '--requirement'].includes(word) && rest[i + 1]) {
      args.push('-r', rest[i + 1]);
      i += 1;
      continue;
    }
    const flag = table[word];
    if (!flag) return null;
    if (flag === 'global') global = true;
    else flags[/** @type {keyof Flags} */ (flag)] = true;
  }
  return { packages, flags, global, args };
}

/**
 * @param {Ecosystem} ecosystem
 * @param {Action} action
 * @param {{ packages?: string[], args?: string[], flags?: Partial<Flags> }} [rest]
 * @returns {Intent}
 */
export function intent(ecosystem, action, rest = {}) {
  return {
    ecosystem,
    action,
    packages: rest.packages ?? [],
    args: rest.args ?? [],
    flags: { ...noFlags(), ...rest.flags },
  };
}

/**
 * `add` with packages, `install` without, `global` with `-g`.
 *
 * @param {Ecosystem} ecosystem
 * @param {string[]} rest
 * @returns {Intent | null}
 */
function adding(ecosystem, rest) {
  const read = readArgs(rest, ecosystem === 'js' ? JS_FLAGS : PY_FLAGS);
  if (!read) return null;
  const { packages, flags, global, args } = read;
  if (global) return packages.length ? intent(ecosystem, 'global', { packages }) : null;
  if (!packages.length) return intent(ecosystem, 'install', { args });
  return intent(ecosystem, 'add', { packages, flags });
}

/**
 * Packages to remove: flags such as `-y` or `-D` change nothing in other managers.
 *
 * @param {Ecosystem} ecosystem
 * @param {string[]} rest
 * @returns {Intent | null}
 */
function removing(ecosystem, rest) {
  const packages = rest.filter((w) => !w.startsWith('-'));
  return packages.length ? intent(ecosystem, 'remove', { packages }) : null;
}

/**
 * The package to run and its arguments (`--` separators dropped).
 *
 * @param {Ecosystem} ecosystem
 * @param {Action} action
 * @param {string[]} rest
 * @returns {Intent | null}
 */
function running(ecosystem, action, rest) {
  const words = rest.filter((w, i) => !(w === '--' && i <= 1) && !['-y', '--yes'].includes(w));
  const [name, ...args] = words;
  if (!name || name.startsWith('-')) return null;
  return intent(ecosystem, action, { packages: [name], args: args.filter((w) => w !== '--') });
}

/**
 * @param {string} verb
 * @param {Record<string, string[]>} verbs
 * @returns {string | undefined}
 */
function verbOf(verb, verbs) {
  return Object.keys(verbs).find((key) => verbs[key].includes(verb));
}

const JS_VERBS = {
  add: ['install', 'i', 'in', 'add', 'a'],
  remove: ['uninstall', 'un', 'remove', 'rm', 'r'],
  exec: ['exec', 'x', 'dlx'],
  create: ['create'],
  init: ['init'],
  run: ['run', 'run-script', 'task'],
  ci: ['ci'],
};

/**
 * Reads a command of npm, npx, pnpm, yarn, bun or bunx.
 *
 * @param {string[]} w
 * @returns {Intent | null}
 */
function readJs(w) {
  const [tool, verb = '', ...rest] = w;
  if (tool === 'npx' || tool === 'bunx') return running('js', 'exec', w.slice(1));
  if (tool === 'yarn' && !verb) return intent('js', 'install');
  if (tool === 'yarn' && verb === 'global' && rest[0] === 'add')
    return adding('js', ['-g', ...rest.slice(1)]);
  if (tool === 'npm' && ['test', 't', 'start', 'stop'].includes(verb))
    return running('js', 'run', [verb === 't' ? 'test' : verb, ...rest]);
  // `pnpm exec` runs a local binary: not `dlx`.
  if (tool === 'pnpm' && verb === 'exec') return null;
  const action = verbOf(verb, JS_VERBS);
  if (!action) return null;
  if (action === 'add') {
    const plain = rest.filter((w) => w !== '--frozen-lockfile' && w !== '--immutable');
    const found = adding('js', plain);
    return found?.action === 'install' && plain.length < rest.length ? intent('js', 'ci') : found;
  }
  if (action === 'ci') return intent('js', 'ci');
  if (action === 'remove') return removing('js', rest);
  if (action === 'init' || action === 'create') {
    // `npm init vite` is `npm create vite`.
    if (rest[0] && !rest[0].startsWith('-')) return running('js', 'create', rest);
    return action === 'init' ? intent('js', 'init', { args: rest.filter((a) => a === '-y') }) : null; // prettier-ignore
  }
  return running('js', /** @type {Action} */ (action), rest);
}

/**
 * Reads a command of pip, uv, poetry, pdm, pipx or uvx.
 *
 * @param {string[]} w
 * @returns {Intent | null}
 */
function readPython(w) {
  let [tool, verb = '', ...rest] = w;
  if (tool === 'python' || tool === 'python3') {
    if (verb !== '-m' || !/^pip3?$/.test(rest[0] ?? '')) return null;
    [tool, verb, ...rest] = rest;
  }
  if (tool === 'uv' && verb === 'pip') [verb, ...rest] = rest;
  else if (tool === 'uv' && verb === 'tool') {
    [verb, ...rest] = rest;
    if (verb === 'install') return adding('python', ['-g', ...rest]);
    if (verb === 'run') return running('python', 'exec', rest);
    return null;
  }
  if (tool === 'uvx') return running('python', 'exec', w.slice(1));
  if (tool === 'pipx') {
    if (verb === 'install') return adding('python', ['-g', ...rest]);
    if (verb === 'run') return running('python', 'exec', rest);
    return null;
  }
  if (verb === 'install' || verb === 'add' || verb === 'sync') return adding('python', rest);
  if (verb === 'uninstall' || verb === 'remove') return removing('python', rest);
  if (verb === 'run' && tool !== 'pip') return running('python', 'run', rest);
  if ((verb === 'init' || verb === 'new') && tool !== 'pip') return intent('python', 'init');
  return null;
}

/** @param {string[]} w */
const isPythonTool = (w) => /^(?:pip3?|uvx?|poetry|pdm|pipx|python3?)$/.test(w[0] ?? '');

/**
 * Reads one command (no `&&`).
 *
 * @param {string[]} w
 * @returns {Intent | null}
 */
export function readCommand(w) {
  if (/^(?:npm|npx|pnpm|yarn|bunx?)$/.test(w[0] ?? '')) return readJs(w);
  if (!isPythonTool(w)) return null;
  const found = readPython(w);
  // `pip install .` installs the project itself.
  if (found?.action === 'add' && found.packages.length === 1 && found.packages[0] === '.')
    return intent('python', 'install');
  return found;
}

/**
 * Reads commands, one per line. `#` lines are comments.
 *
 * @param {string} text
 * @returns {{ lines: Line[], ecosystem: Ecosystem | null }}
 */
export function readCommands(text) {
  /** @type {Line[]} */
  const lines = [];
  /** @type {Ecosystem | null} */
  let ecosystem = null;
  for (const raw of text.split(/\r?\n/).slice(0, MAX_LINES)) {
    // A prompt copied with the command is not part of it.
    const line = raw.trim().replace(/^[$>]\s+/, '');
    if (!line) continue;
    if (line.startsWith('#')) {
      lines.push({ comment: line });
      continue;
    }
    const all = words(line);
    if (!all) {
      lines.push({ parts: [{ raw: line }] });
      continue;
    }
    /** @type {Part[]} */
    const parts = [];
    for (const segment of splitOn(all, '&&')) {
      const found = segment.length ? readCommand(segment) : null;
      if (found) ecosystem ??= found.ecosystem;
      parts.push(found ? { intent: found } : { words: segment });
    }
    lines.push({ parts });
  }
  return { lines, ecosystem };
}

/**
 * @param {string[]} list
 * @param {string} separator
 * @returns {string[][]}
 */
function splitOn(list, separator) {
  /** @type {string[][]} */
  const out = [[]];
  for (const word of list) {
    if (word === separator) out.push([]);
    else out[out.length - 1].push(word);
  }
  return out;
}

// ---------------------------------------------------------------- writing

/**
 * @param {string} text
 * @param {Token['kind']} kind
 * @returns {Token}
 */
const tok = (text, kind) => ({ text, kind });

/**
 * @param {string} text - A command and its fixed words, separated by spaces.
 * @returns {Token[]}
 */
const cmd = (text) => text.split(' ').map((w, n) => tok(w, n ? (w.startsWith('-') ? 'flag' : 'arg') : 'cmd')); // prettier-ignore

/** @param {string} p - A package for Deno: npm packages need the `npm:` scheme. */
const denoPackage = (p) => (/^(?:npm|jsr|https?):/.test(p) ? p : `npm:${p}`);

/** Flags written by each JavaScript manager. */
const JS_FLAG_WORDS = /** @type {Record<string, Partial<Record<keyof Flags, string>>>} */ ({
  npm: { dev: '-D', exact: '--save-exact', optional: '--save-optional', peer: '--save-peer' },
  pnpm: { dev: '-D', exact: '--save-exact', optional: '--save-optional', peer: '--save-peer' },
  yarn: { dev: '-D', exact: '--exact', optional: '--optional', peer: '--peer' },
  bun: { dev: '-d', exact: '--exact', optional: '--optional', peer: '--peer' },
  deno: { dev: '--dev' },
});

/**
 * The words of a JavaScript command for one manager, `null` when it has no equivalent.
 *
 * @param {Intent} i
 * @param {string} m
 * @returns {Token[] | null}
 */
function writeJs(i, m) {
  const pkgs = i.packages.map((p) => tok(m === 'deno' ? denoPackage(p) : p, 'pkg'));
  const args = i.args.map((a) => tok(a, a.startsWith('-') ? 'flag' : 'arg'));
  switch (i.action) {
    case 'install':
      return cmd(`${m} install`);
    case 'ci':
      return cmd({ npm: 'npm ci', pnpm: 'pnpm install --frozen-lockfile', yarn: 'yarn install --immutable', bun: 'bun install --frozen-lockfile', deno: 'deno install --frozen' }[m] ?? `${m} ci`); // prettier-ignore
    case 'add': {
      const flags = /** @type {(keyof Flags)[]} */ (['dev', 'exact', 'optional', 'peer'])
        .filter((f) => i.flags[f] && JS_FLAG_WORDS[m][f])
        .map((f) => tok(/** @type {string} */ (JS_FLAG_WORDS[m][f]), 'flag'));
      return [...cmd(m === 'npm' ? 'npm install' : `${m} add`), ...flags, ...pkgs];
    }
    case 'remove':
      return [...cmd(m === 'npm' ? 'npm uninstall' : `${m} remove`), ...pkgs];
    case 'global':
      if (m === 'yarn') return [...cmd('yarn global add'), ...pkgs];
      return [...cmd({ npm: 'npm install', deno: 'deno install' }[m] ?? `${m} add`), tok('-g', 'flag'), ...pkgs]; // prettier-ignore
    case 'exec':
      return [...cmd({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx', deno: 'deno run' }[m] ?? m), ...pkgs, ...args]; // prettier-ignore
    case 'create': {
      if (m === 'deno') return [...cmd('deno init'), tok('--npm', 'flag'), tok(i.packages[0], 'pkg'), ...args]; // prettier-ignore
      // npm passes options on to the initializer only after `--`.
      const at = m === 'npm' ? i.args.findIndex((a) => a.startsWith('-')) : -1;
      if (at >= 0) args.splice(at, 0, tok('--', 'op'));
      return [...cmd(`${m} create`), tok(i.packages[0], 'pkg'), ...args];
    }
    case 'init':
      return [...cmd(`${m} init`), ...(m === 'pnpm' || m === 'deno' ? [] : args)];
    case 'run': {
      if (m === 'npm' && args.length) args.unshift(tok('--', 'op'));
      return [...cmd(m === 'deno' ? 'deno task' : `${m} run`), tok(i.packages[0], 'pkg'), ...args];
    }
  }
  return null;
}

/**
 * The words of a Python command for one manager, `null` when it has no equivalent.
 *
 * @param {Intent} i
 * @param {string} m
 * @returns {Token[] | null}
 */
function writePython(i, m) {
  const pkgs = i.packages.map((p) => tok(p, 'pkg'));
  const args = i.args.map((a) => tok(a, a.startsWith('-') ? 'flag' : 'arg'));
  const flag = (/** @type {string} */ text) => tok(text, 'flag');
  switch (i.action) {
    case 'install':
      if (args.length) return m === 'pip' ? [...cmd('pip install'), ...args] : m === 'uv' ? [...cmd('uv pip install'), ...args] : null; // prettier-ignore
      return m === 'pip' ? [...cmd('pip install'), tok('.', 'arg')] : cmd(m === 'uv' ? 'uv sync' : `${m} install`); // prettier-ignore
    case 'add': {
      if (m === 'pip') return [...cmd('pip install'), ...(i.flags.upgrade ? [flag('-U')] : []), ...pkgs]; // prettier-ignore
      const dev = i.flags.dev ? { uv: [flag('--dev')], poetry: [flag('--group'), tok('dev', 'arg')], pdm: [flag('-d')] }[m] ?? [] : []; // prettier-ignore
      return [...cmd(`${m} add`), ...dev, ...pkgs];
    }
    case 'remove':
      return [...cmd(m === 'pip' ? 'pip uninstall' : `${m} remove`), ...pkgs];
    case 'global':
      return m === 'pip' ? [...cmd('pipx install'), ...pkgs] : m === 'uv' ? [...cmd('uv tool install'), ...pkgs] : null; // prettier-ignore
    case 'exec':
      return m === 'pip' ? [...cmd('pipx run'), ...pkgs, ...args] : m === 'uv' ? [...cmd('uvx'), ...pkgs, ...args] : null; // prettier-ignore
    case 'run':
      return m === 'pip' ? null : [...cmd(`${m} run`), ...pkgs, ...args];
    case 'init':
    case 'create':
      return m === 'pip' ? null : cmd(`${m} init`);
    case 'ci':
      return m === 'pip' ? null : cmd(m === 'uv' ? 'uv sync --locked' : `${m} install`);
  }
  return null;
}

/**
 * Writes what a command does for one manager.
 *
 * @param {Intent} i
 * @param {string} manager
 * @returns {Token[] | null}
 */
export function writeCommand(i, manager) {
  if (!(/** @type {readonly string[]} */ (MANAGERS[i.ecosystem]).includes(manager))) return null;
  return i.ecosystem === 'js' ? writeJs(i, manager) : writePython(i, manager);
}

/** Commands that belong to a manager. */
const OWNERS = /** @type {Record<string, string>} */ ({
  npx: 'npm', bunx: 'bun', pip3: 'pip', pipx: 'pip', uvx: 'uv', python: 'pip', python3: 'pip',
}); // prettier-ignore

/**
 * @param {string} word - The first word of a command.
 * @returns {string | null} The manager it belongs to.
 */
function ownerOf(word) {
  if (OWNERS[word]) return OWNERS[word];
  return [...MANAGERS.js, ...MANAGERS.python].includes(word) ? word : null;
}

/**
 * Writes every line for one manager: `null` when one of them has no equivalent.
 *
 * @param {Line[]} lines
 * @param {string} manager
 * @returns {Token[][] | null}
 */
export function writeLines(lines, manager) {
  /** @type {Token[][]} */
  const out = [];
  for (const line of lines) {
    if ('comment' in line) {
      out.push([tok(line.comment, 'comment')]);
      continue;
    }
    /** @type {Token[]} */
    const tokens = [];
    for (const [n, part] of line.parts.entries()) {
      if (n) tokens.push(tok('&&', 'op'));
      if ('raw' in part) {
        tokens.push(tok(part.raw, 'raw'));
        continue;
      }
      if ('words' in part) {
        // A command of another manager that was not understood has no equivalent here.
        const owner = ownerOf(part.words[0] ?? '');
        if (owner && owner !== manager) return null;
        tokens.push(...part.words.map((w, k) => tok(w, k ? 'arg' : 'cmd')));
        continue;
      }
      const written = writeCommand(part.intent, manager);
      if (!written) return null;
      tokens.push(...written);
    }
    out.push(tokens);
  }
  return out;
}

/**
 * The text of written lines, with words quoted for a shell.
 *
 * @param {Token[][]} lines
 * @returns {string}
 */
export function linesText(lines) {
  return lines
    .map(
      (tokens) =>
      tokens.map((t) => (t.kind === 'comment' || t.kind === 'op' || t.kind === 'raw' ? t.text : shellQuote(t.text))).join(' '), // prettier-ignore
    )
    .join('\n');
}
