// @ts-check
/**
 * Reads YARA rules without running them: imports, rules with their tags, meta, strings
 * (text, hex, regular expressions) and modifiers, and the condition. Checks what the YARA
 * compiler and reviewers reject or warn about: strings referenced but not defined or defined
 * but not used, duplicates, short atoms, unbounded jumps, modules used without `import`.
 *
 * @module components/yara/yara
 */

/** Longest text read (characters). */
export const MAX_TEXT = 1024 * 1024;
/** Most rules read. */
export const MAX_RULES = 500;

/**
 * @typedef {"comment" | "string" | "regex" | "hex" | "keyword" | "ref" | "number" | "ident" | "punct" | "space" | "error"} TokenType
 * @typedef {{ type: TokenType, text: string, line: number }} Token
 * @typedef {{ name: string, arg: string }} Modifier
 * @typedef {{ id: string, kind: "text" | "hex" | "regex", value: string, modifiers: Modifier[], line: number, used: boolean }} YaraString
 * @typedef {{ key: string, value: string, kind: "string" | "number" | "boolean" }} Meta
 * @typedef {{ id: string, level: "danger" | "warning" | "info", line: number, params: Record<string, string | number> }} Finding
 * @typedef {{ id: string, params: Record<string, string | number> }} Note
 * @typedef {object} Rule
 * @property {string} name
 * @property {number} line
 * @property {boolean} private
 * @property {boolean} global
 * @property {string[]} tags
 * @property {Meta[]} meta
 * @property {YaraString[]} strings
 * @property {Token[]} condition
 * @property {Finding[]} findings
 * @property {Note[]} notes - The condition read in words.
 * @property {string} source - The text of the rule.
 * @typedef {object} Ruleset
 * @property {string[]} imports
 * @property {string[]} includes
 * @property {Rule[]} rules
 * @property {Finding[]} findings - Problems outside a rule (syntax).
 * @property {boolean} capped
 */

export const KEYWORDS = new Set(
  'all and any ascii at base64 base64wide condition contains defined endswith entrypoint false filesize for fullword global icontains iendswith iequals import in include istartswith matches meta nocase none not of or private rule startswith strings them true uint8 uint16 uint32 uint8be uint16be uint32be int8 int16 int32 int8be int16be int32be wide xor'.split(
    ' ',
  ),
);

/** Modules of YARA 4. */
export const MODULES = new Set(['pe', 'elf', 'math', 'hash', 'dotnet', 'magic', 'cuckoo', 'time', 'console', 'string', 'macho', 'dex', 'lnk']); // prettier-ignore

/** Modifiers allowed on each kind of string. */
const ALLOWED = {
  text: new Set(['nocase', 'wide', 'ascii', 'fullword', 'private', 'xor', 'base64', 'base64wide']),
  hex: new Set(['private']),
  regex: new Set(['nocase', 'wide', 'ascii', 'fullword', 'private']),
};

/**
 * Well-known first bytes, as YARA conditions read them (little-endian unless `be`).
 * @type {Record<string, string>}
 */
const MAGIC = {
  'uint16:0x5a4d': 'MZ (Windows executable)',
  'uint16be:0x4d5a': 'MZ (Windows executable)',
  'uint32:0x464c457f': 'ELF (Linux executable)',
  'uint32be:0x7f454c46': 'ELF (Linux executable)',
  'uint32:0x04034b50': 'ZIP (also DOCX, XLSX, JAR, APK)',
  'uint32be:0x504b0304': 'ZIP (also DOCX, XLSX, JAR, APK)',
  'uint32:0x46445025': 'PDF',
  'uint32be:0x25504446': 'PDF',
  'uint32:0xe011cfd0': 'OLE (DOC, XLS, MSI)',
  'uint32be:0xd0cf11e0': 'OLE (DOC, XLS, MSI)',
  'uint32:0xfeedface': 'Mach-O (macOS executable)',
  'uint32:0xfeedfacf': 'Mach-O (macOS executable)',
  'uint32:0xcafebabe': 'Mach-O fat binary or Java class',
  'uint32be:0xcafebabe': 'Mach-O fat binary or Java class',
  'uint32:0x0a786564': 'DEX (Android)',
  'uint32:0x0000004c': 'LNK (Windows shortcut)',
  'uint32:0x21726152': 'RAR',
  'uint32be:0x52617221': 'RAR',
  'uint16:0x8b1f': 'GZIP',
  'uint32:0xbc7aaf37': '7-Zip',
};

/**
 * Splits YARA text into tokens, keeping everything (spaces and comments) so the source can
 * be shown colored. Hex strings follow `=`; regular expressions follow `=` or `matches`.
 *
 * @param {string} text
 * @returns {Token[]}
 */
export function tokenize(text) {
  /** @type {Token[]} */
  const tokens = [];
  let i = 0;
  let line = 1;
  /** Text of the last token that is not a space or a comment. */
  let last = '';
  const push = (/** @type {TokenType} */ type, /** @type {number} */ end) => {
    const value = text.slice(i, end);
    const token = { type, text: value, line };
    tokens.push(token);
    if (type !== 'space' && type !== 'comment') last = value;
    for (const c of value) if (c === '\n') line += 1;
    i = end;
  };
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (/\s/.test(c)) {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      push('space', j);
    } else if (c === '/' && next === '/') {
      const j = text.indexOf('\n', i);
      push('comment', j < 0 ? text.length : j);
    } else if (c === '/' && next === '*') {
      const j = text.indexOf('*/', i + 2);
      push(j < 0 ? 'error' : 'comment', j < 0 ? text.length : j + 2);
    } else if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"' && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      push(text[j] === '"' ? 'string' : 'error', Math.min(text.length, j + 1));
    } else if (c === '{' && last === '=') {
      const j = text.indexOf('}', i);
      push(j < 0 ? 'error' : 'hex', j < 0 ? text.length : j + 1);
    } else if (c === '/' && (last === '=' || last === 'matches')) {
      let j = i + 1;
      while (j < text.length && text[j] !== '/' && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      if (text[j] !== '/') push('error', j);
      else {
        j += 1;
        while (/[is]/.test(text[j] ?? '')) j += 1;
        push('regex', j);
      }
    } else if (/[$#@!]/.test(c) && /[A-Za-z0-9_*]/.test(next ?? '')) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_*]/.test(text[j])) j += 1;
      push('ref', j);
    } else if (c === '$') {
      push('ref', i + 1);
    } else if (/[0-9]/.test(c)) {
      const m = /^(0x[0-9a-fA-F]+|0o[0-7]+|\d+(\.\d+)?(KB|MB)?)/.exec(text.slice(i, i + 40));
      push('number', i + (m ? m[0].length : 1));
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j += 1;
      push(KEYWORDS.has(text.slice(i, j)) ? 'keyword' : 'ident', j);
    } else {
      const two = text.slice(i, i + 2);
      push('punct', i + (['==', '!=', '<=', '>=', '<<', '>>', '..'].includes(two) ? 2 : 1));
    }
  }
  return tokens;
}

/**
 * @param {string} literal - A YARA string literal with its quotes.
 * @returns {string} The text between the quotes, escapes kept as written.
 */
function unquote(literal) {
  return literal.slice(1, -1);
}

/**
 * Bytes a text string is sure to match, escapes counted once.
 *
 * @param {string} value
 * @returns {number}
 */
function textLength(value) {
  return value.replace(/\\x[0-9a-fA-F]{2}|\\./g, '_').length;
}

/**
 * Reads a hex string: fixed bytes, wildcards, jumps and alternatives.
 *
 * @param {string} body - Without braces.
 * @returns {{ fixed: number, unbounded: boolean, leadingWildcard: boolean, valid: boolean, longestRun: number }}
 */
export function readHex(body) {
  const clean = body.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ' ');
  const parts = clean.match(/\[[^\]]*\]|[0-9A-Fa-f?~]{1,3}|[()|]|\S/g) ?? [];
  let fixed = 0;
  let run = 0;
  let longestRun = 0;
  let unbounded = false;
  let valid = parts.length > 0;
  let depth = 0;
  parts.forEach((part) => {
    if (part.startsWith('[')) {
      if (!/^\[\s*(\d+)?\s*(-\s*(\d+)?)?\s*\]$/.test(part)) valid = false;
      if (/-\s*\]$/.test(part)) unbounded = true;
      run = 0;
    } else if (part === '(') depth += 1;
    else if (part === ')') depth -= 1;
    else if (part === '|') run = 0;
    else if (/^~?[0-9A-Fa-f?]{2}$/.test(part)) {
      if (/^[0-9A-Fa-f]{2}$/.test(part)) {
        fixed += 1;
        run += 1;
        longestRun = Math.max(longestRun, run);
      } else run = 0;
    } else valid = false;
  });
  if (depth !== 0) valid = false;
  const first = parts.find((p) => p !== '(');
  return { fixed, unbounded, leadingWildcard: Boolean(first && /[?[]/.test(first)), valid, longestRun }; // prettier-ignore
}

/**
 * @param {Token[]} tokens
 * @returns {Token[]} Without spaces and comments.
 */
const significant = (tokens) => tokens.filter((t) => t.type !== 'space' && t.type !== 'comment');

/**
 * Reads YARA text.
 *
 * @param {string} input
 * @returns {Ruleset}
 */
export function parseYara(input) {
  const text = input.length > MAX_TEXT ? input.slice(0, MAX_TEXT) : input;
  const all = tokenize(text);
  const tokens = significant(all);
  /** @type {Ruleset} */
  const set = { imports: [], includes: [], rules: [], findings: [], capped: false };
  let i = 0;
  const peek = (/** @type {number} */ k = 0) => tokens[i + k];
  const error = (/** @type {Token | undefined} */ at, /** @type {string} */ expected) =>
    set.findings.push({ id: 'syntax', level: 'danger', line: at?.line ?? 0, params: { expected, found: at ? at.text.slice(0, 40) : 'end' } }); // prettier-ignore

  while (i < tokens.length) {
    const t = peek();
    if (t.type === 'error') {
      set.findings.push({ id: 'unclosed', level: 'danger', line: t.line, params: { text: t.text.slice(0, 20) } }); // prettier-ignore
      i += 1;
    } else if ((t.text === 'import' || t.text === 'include') && peek(1)?.type === 'string') {
      (t.text === 'import' ? set.imports : set.includes).push(unquote(peek(1).text));
      i += 2;
    } else if (['rule', 'private', 'global'].includes(t.text)) {
      if (set.rules.length >= MAX_RULES) {
        set.capped = true;
        break;
      }
      const next = readRule(tokens, i, all, set);
      if (next <= i) {
        i += 1;
        continue;
      }
      i = next;
    } else {
      error(t, 'rule');
      // Skip to the next rule.
      i += 1;
      while (i < tokens.length && !['rule', 'private', 'global', 'import', 'include'].includes(peek().text)) i += 1; // prettier-ignore
    }
  }
  check(set);
  return set;
}

/**
 * @param {Token[]} tokens - Significant tokens.
 * @param {number} start
 * @param {Token[]} all - Every token, for the source of the rule.
 * @param {Ruleset} set
 * @returns {number} Index after the rule.
 */
function readRule(tokens, start, all, set) {
  let i = start;
  const startLine = tokens[i].line;
  /** @type {Rule} */
  const rule = { name: '', line: startLine, private: false, global: false, tags: [], meta: [], strings: [], condition: [], findings: [], notes: [], source: '' }; // prettier-ignore
  const fail = (/** @type {string} */ expected) => {
    const at = tokens[i];
    rule.findings.push({ id: 'syntax', level: 'danger', line: at?.line ?? startLine, params: { expected, found: at ? at.text.slice(0, 40) : 'end' } }); // prettier-ignore
  };
  while (tokens[i]?.text === 'private' || tokens[i]?.text === 'global') {
    rule[/** @type {"private" | "global"} */ (tokens[i].text)] = true;
    i += 1;
  }
  if (tokens[i]?.text !== 'rule') return start + 1;
  i += 1;
  if (tokens[i]?.type !== 'ident') {
    fail('name');
    return i;
  }
  rule.name = tokens[i].text;
  i += 1;
  if (tokens[i]?.text === ':') {
    i += 1;
    while (tokens[i]?.type === 'ident') rule.tags.push(tokens[i++].text);
  }
  set.rules.push(rule);
  if (tokens[i]?.text !== '{') {
    fail('{');
    return i;
  }
  i += 1;
  /** @type {"" | "meta" | "strings" | "condition"} */
  let section = '';
  let depth = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (
      section !== 'condition' &&
      ['meta', 'strings', 'condition'].includes(t.text) &&
      tokens[i + 1]?.text === ':'
    ) {
      section = /** @type {"meta" | "strings" | "condition"} */ (t.text);
      i += 2;
      continue;
    }
    if (t.text === '}' && depth === 0) {
      i += 1;
      break;
    }
    if (t.type === 'error') {
      rule.findings.push({ id: 'unclosed', level: 'danger', line: t.line, params: { text: t.text.slice(0, 20) } }); // prettier-ignore
      i += 1;
      continue;
    }
    if (section === 'meta') {
      const value = tokens[i + 2];
      if (t.type === 'ident' || t.type === 'keyword') {
        if (tokens[i + 1]?.text !== '=' || !value) {
          fail('=');
          i += 1;
          continue;
        }
        const negative = value.text === '-' && tokens[i + 3]?.type === 'number';
        const v = negative ? tokens[i + 3] : value;
        if (v.type === 'string')
          rule.meta.push({ key: t.text, value: unquote(v.text), kind: 'string' }); // prettier-ignore
        else if (v.type === 'number')
          rule.meta.push({ key: t.text, value: `${negative ? '-' : ''}${v.text}`, kind: 'number' }); // prettier-ignore
        else if (v.text === 'true' || v.text === 'false')
          rule.meta.push({ key: t.text, value: v.text, kind: 'boolean' }); // prettier-ignore
        else fail('value');
        i += negative ? 4 : 3;
      } else {
        fail('meta');
        i += 1;
      }
    } else if (section === 'strings') {
      if (t.type !== 'ref' || !t.text.startsWith('$') || tokens[i + 1]?.text !== '=') {
        fail('$name =');
        i += 1;
        continue;
      }
      const v = tokens[i + 2];
      /** @type {YaraString["kind"] | null} */
      const kind = v?.type === 'string' ? 'text' : v?.type === 'hex' ? 'hex' : v?.type === 'regex' ? 'regex' : null; // prettier-ignore
      if (!kind) {
        i += 2;
        fail('"text", { hex } or /regex/');
        continue;
      }
      /** @type {YaraString} */
      const s = { id: t.text, kind, value: kind === 'text' ? unquote(v.text) : v.text, modifiers: [], line: t.line, used: false }; // prettier-ignore
      i += 3;
      while (
        tokens[i] &&
        (tokens[i].type === 'keyword' || tokens[i].type === 'ident') &&
        tokens[i + 1]?.text !== ':' &&
        tokens[i + 1]?.text !== '='
      ) {
        const name = tokens[i].text;
        i += 1;
        let arg = '';
        if (tokens[i]?.text === '(' && (name === 'xor' || name.startsWith('base64'))) {
          const close = tokens.findIndex((x, k) => k > i && x.text === ')');
          if (close < 0) break;
          arg = tokens
            .slice(i + 1, close)
            .map((x) => x.text)
            .join('');
          i = close + 1;
        }
        s.modifiers.push({ name, arg });
      }
      rule.strings.push(s);
    } else if (section === 'condition') {
      if (t.text === '(') depth += 1;
      if (t.text === ')') depth -= 1;
      i += 1;
    } else {
      fail('meta:, strings: or condition:');
      i += 1;
    }
  }
  // The condition, with its spaces and comments, from the tokens of the whole text.
  const first = tokens[start];
  const last = tokens[i - 1];
  const from = all.indexOf(first);
  const to = all.indexOf(last);
  const ruleTokens = all.slice(from, to + 1);
  rule.source = ruleTokens.map((x) => x.text).join('');
  const at = ruleTokens.findIndex((x, k) => x.text === 'condition' && ruleTokens.slice(k + 1).find((y) => y.type !== 'space')?.text === ':'); // prettier-ignore
  if (at >= 0) {
    const colon = ruleTokens.findIndex((x, k) => k > at && x.text === ':');
    let body = ruleTokens.slice(colon + 1);
    if (body.at(-1)?.text === '}') body = body.slice(0, -1);
    while (body[0]?.type === 'space') body.shift();
    while (body.at(-1)?.type === 'space') body.pop();
    rule.condition = body;
  }
  if (last?.text !== '}') fail('}');
  return i;
}

/**
 * Expands `$a*` against the strings of a rule.
 *
 * @param {string} pattern - `$a`, `$a*` or `$*`.
 * @param {YaraString[]} strings
 * @returns {YaraString[]}
 */
export function expand(pattern, strings) {
  const name = `$${pattern.slice(1)}`;
  if (name.endsWith('*')) return strings.filter((s) => s.id.startsWith(name.slice(0, -1)));
  return strings.filter((s) => s.id === name);
}

/**
 * Checks each rule and reads its condition in words.
 *
 * @param {Ruleset} set
 */
function check(set) {
  const names = new Map();
  for (const rule of set.rules) {
    const add = (/** @type {Finding["id"]} */ id, /** @type {Finding["level"]} */ level, /** @type {number} */ line, params = {}) =>
      rule.findings.push({ id, level, line, params }); // prettier-ignore
    if (names.has(rule.name)) add('duplicateRule', 'danger', rule.line, { name: rule.name });
    names.set(rule.name, rule);
    const ids = new Set();
    for (const s of rule.strings) {
      if (s.id !== '$' && ids.has(s.id)) add('duplicateString', 'danger', s.line, { id: s.id });
      ids.add(s.id);
      for (const m of s.modifiers) {
        if (!ALLOWED[s.kind].has(m.name)) add('modifier', 'danger', s.line, { id: s.id, modifier: m.name }); // prettier-ignore
      }
      const has = (/** @type {string} */ name) => s.modifiers.some((m) => m.name === name);
      if (has('nocase') && (has('xor') || has('base64') || has('base64wide')))
        add('modifierClash', 'danger', s.line, { id: s.id });
      if (s.kind === 'text') {
        const length = textLength(s.value);
        if (!length) add('emptyString', 'danger', s.line, { id: s.id });
        else if (length < 4) add('shortString', 'warning', s.line, { id: s.id, length });
      } else if (s.kind === 'hex') {
        const hex = readHex(s.value.slice(1, -1));
        if (!hex.valid) add('hexInvalid', 'danger', s.line, { id: s.id });
        else {
          if (hex.longestRun < 2) add('shortAtom', 'warning', s.line, { id: s.id });
          if (hex.unbounded) add('unboundedJump', 'warning', s.line, { id: s.id });
          if (hex.leadingWildcard) add('leadingWildcard', 'info', s.line, { id: s.id });
        }
      } else if (/^\/(\.\*|\.\+)/.test(s.value)) add('regexLeading', 'warning', s.line, { id: s.id }); // prettier-ignore
      if (s.kind === 'regex') {
        try {
          new RegExp(s.value.slice(1, s.value.lastIndexOf('/')));
        } catch {
          add('regexInvalid', 'warning', s.line, { id: s.id });
        }
      }
    }
    const cond = significant(rule.condition);
    if (!rule.condition.length) add('noCondition', 'danger', rule.line);
    for (const [k, t] of cond.entries()) {
      if (t.type === 'ref') {
        const pattern = t.text.length === 1 ? '$' : t.text;
        if (pattern === '$') continue; // Inside `for … of`: the current string.
        const hits = expand(pattern, rule.strings);
        if (!hits.length) add('undefinedString', 'danger', t.line, { id: `$${pattern.slice(1)}` });
        hits.forEach((s) => (s.used = true));
      } else if (t.text === 'them') rule.strings.forEach((s) => (s.used = true));
      else if (t.type === 'ident' && cond[k + 1]?.text === '.' && cond[k - 1]?.text !== '.') {
        if (MODULES.has(t.text) && !set.imports.includes(t.text))
          add('noImport', 'danger', t.line, { module: t.text });
      }
    }
    // YARA refuses strings never referenced, except anonymous ones and `$_name`.
    for (const s of rule.strings)
      if (!s.used && s.id !== '$' && !s.id.startsWith('$_')) add('unusedString', 'danger', s.line, { id: s.id }); // prettier-ignore
    if (!rule.meta.some((m) => /^(description|desc)$/i.test(m.key))) add('noDescription', 'info', rule.line); // prettier-ignore
    rule.notes = readCondition(cond, rule.strings);
  }
  // Repeated findings (a module used twice) are kept once.
  for (const rule of set.rules) {
    const seen = new Set();
    rule.findings = rule.findings.filter((f) => {
      const key = `${f.id}:${JSON.stringify(f.params)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

/**
 * @param {string} number - A YARA number (`0x1F`, `200KB`).
 * @returns {number}
 */
export function yaraNumber(number) {
  const m = /^(\d+)(KB|MB)$/.exec(number);
  if (m) return Number(m[1]) * (m[2] === 'KB' ? 1024 : 1024 * 1024);
  if (/^0o/.test(number)) return parseInt(number.slice(2), 8);
  return Number(number);
}

/**
 * Reads the parts of a condition that have a plain meaning: file types checked by their
 * first bytes, sizes, counts of strings, offsets and ranges, modules.
 *
 * @param {Token[]} cond - Significant tokens.
 * @param {YaraString[]} strings
 * @returns {Note[]}
 */
export function readCondition(cond, strings) {
  /** @type {Note[]} */
  const notes = [];
  const at = (/** @type {number} */ k) => cond[k]?.text ?? '';
  const list = (/** @type {number} */ k) => {
    // `them` or `( $a, $b* )`, from index k.
    if (at(k) === 'them') return { ids: strings.map((s) => s.id), end: k + 1 };
    if (at(k) !== '(') return null;
    /** @type {string[]} */
    const ids = [];
    let j = k + 1;
    while (j < cond.length && at(j) !== ')') {
      if (cond[j].type === 'ref') ids.push(...expand(at(j), strings).map((s) => s.id));
      j += 1;
    }
    return { ids: [...new Set(ids)], end: j + 1 };
  };
  for (let k = 0; k < cond.length; k += 1) {
    const t = cond[k];
    // uint16(0) == 0x5A4D
    if (
      /^u?int(8|16|32)(be)?$/.test(t.text) &&
      at(k + 1) === '(' &&
      at(k + 3) === ')' &&
      at(k + 4) === '=='
    ) {
      const offset = at(k + 2);
      const value = cond[k + 5];
      if (value?.type === 'number') {
        const hex = `0x${yaraNumber(value.text).toString(16).padStart(t.text.endsWith('8') ? 2 : t.text.includes('16') ? 4 : 8, '0')}`; // prettier-ignore
        const magic = yaraNumber(offset) === 0 ? MAGIC[`${t.text.replace(/^int/, 'uint')}:${hex}`] : undefined; // prettier-ignore
        notes.push(magic ? { id: 'magic', params: { type: magic } } : { id: 'bytes', params: { offset, value: value.text, width: t.text } }); // prettier-ignore
        k += 5;
        continue;
      }
    }
    if (
      t.text === 'filesize' &&
      /^[<>]=?$|^==$/.test(at(k + 1)) &&
      cond[k + 2]?.type === 'number'
    ) {
      notes.push({ id: `size_${{ '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte', '==': 'eq' }[at(k + 1)]}`, params: { size: at(k + 2) } }); // prettier-ignore
      k += 2;
      continue;
    }
    // any of them, 2 of ($a*), all of ($x, $y), 50% of them
    const quantity = ['any', 'all', 'none'].includes(t.text) || (t.type === 'number' && (at(k + 1) === 'of' || (at(k + 1) === '%' && at(k + 2) === 'of'))); // prettier-ignore
    if (quantity) {
      const percent = at(k + 1) === '%';
      const ofAt = k + (percent ? 2 : 1);
      if (at(ofAt) === 'of') {
        const found = list(ofAt + 1);
        if (found && found.ids.length) {
          const ids = found.ids.join(', ');
          if (t.text === 'any') notes.push({ id: 'ofAny', params: { ids, total: found.ids.length } }); // prettier-ignore
          else if (t.text === 'all') notes.push({ id: 'ofAll', params: { ids, total: found.ids.length } }); // prettier-ignore
          else if (t.text === 'none') notes.push({ id: 'ofNone', params: { ids } });
          else if (percent) notes.push({ id: 'ofPercent', params: { count: t.text, ids, total: found.ids.length } }); // prettier-ignore
          else notes.push({ id: 'ofCount', params: { count: t.text, ids, total: found.ids.length } }); // prettier-ignore
          k = found.end - 1;
          continue;
        }
      }
    }
    if (
      t.type === 'ref' &&
      t.text.startsWith('#') &&
      /^[<>]=?$|^==$/.test(at(k + 1)) &&
      cond[k + 2]?.type === 'number'
    ) {
      notes.push({ id: `count_${{ '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte', '==': 'eq' }[at(k + 1)]}`, params: { id: `$${t.text.slice(1)}`, count: at(k + 2) } }); // prettier-ignore
      k += 2;
      continue;
    }
    if (t.type === 'ref' && t.text.startsWith('$') && at(k + 1) === 'at') {
      notes.push({ id: 'at', params: { id: t.text, offset: at(k + 2) } });
      k += 2;
      continue;
    }
    if (
      t.type === 'ref' &&
      t.text.startsWith('$') &&
      at(k + 1) === 'in' &&
      at(k + 2) === '(' &&
      at(k + 4) === '..'
    ) {
      notes.push({ id: 'in', params: { id: t.text, from: at(k + 3), to: at(k + 5) } });
      k += 6;
      continue;
    }
    if (t.text === 'for' && /^(any|all|none|\d+)$/.test(at(k + 1)) && at(k + 2) === 'of') {
      const found = list(k + 3);
      if (found) {
        notes.push({ id: 'forOf', params: { ids: found.ids.join(', ') || '…' } });
        k = found.end - 1;
        continue;
      }
    }
    if (t.type === 'ident' && MODULES.has(t.text) && at(k + 1) === '.' && at(k - 1) !== '.') {
      const member = at(k + 2);
      notes.push({ id: 'module', params: { module: t.text, member: `${t.text}.${member}` } });
      k += 2;
      continue;
    }
    if (t.text === 'entrypoint') notes.push({ id: 'entrypoint', params: {} });
  }
  // The same reading twice (a module used several times) is kept once.
  const seen = new Set();
  return notes.filter((n) => {
    const key = `${n.id}:${JSON.stringify(n.params)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Worst level of a rule: what its card shows.
 *
 * @param {Rule} rule
 * @returns {"danger" | "warning" | "none"}
 */
export function verdict(rule) {
  if (rule.findings.some((f) => f.level === 'danger')) return 'danger';
  if (rule.findings.some((f) => f.level === 'warning')) return 'warning';
  return 'none';
}
