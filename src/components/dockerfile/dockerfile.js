// @ts-check
/**
 * Reads a Dockerfile: instructions with their continuation lines and heredocs, build stages
 * (`FROM … AS`), what each stage copies from another, and what the final image runs as. Checks
 * what reviewers and linters flag: unpinned or `latest` base images, running as root, `ADD`
 * where `COPY` does, package caches left in layers, `curl | sh`, secrets in `ENV` or `ARG`,
 * shell-form `CMD`, `cd` instead of `WORKDIR`, and more.
 *
 * @module components/dockerfile/dockerfile
 */

/** Longest text read (characters). */
export const MAX_TEXT = 512 * 1024;

export const INSTRUCTIONS = new Set(['FROM', 'RUN', 'CMD', 'LABEL', 'MAINTAINER', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL']); // prettier-ignore

/**
 * @typedef {{ id: string, level: "danger" | "warning" | "info", line: number, params: Record<string, string> }} Finding
 * @typedef {object} Instruction
 * @property {string} keyword - Upper case.
 * @property {string} args - Arguments, continuation lines joined.
 * @property {string} raw - As written, with its continuation lines.
 * @property {string[]} flags - `--from=build`, `--chown=…`, `--mount=…`.
 * @property {number} line - First line, 1-based.
 * @property {number} lines - Number of lines.
 * @property {boolean} json - Exec form (`["a", "b"]`).
 * @property {string[]} heredocs - Bodies of `<<EOF` heredocs.
 * @typedef {object} Stage
 * @property {number} index
 * @property {string} name - `AS` name, or empty.
 * @property {string} image - Base image as written.
 * @property {string} platform
 * @property {Instruction[]} instructions - After `FROM`.
 * @property {string[]} from - Stages or images it copies from (`COPY --from`).
 * @property {string} user - Last `USER`, empty for root by default.
 * @property {string[]} ports
 * @property {boolean} final
 * @property {number} parent - Index of the stage it is built on (`FROM build`), or -1.
 * @property {Instruction} origin - Its `FROM` instruction.
 * @typedef {object} Dockerfile
 * @property {Instruction[]} instructions
 * @property {Stage[]} stages
 * @property {string[]} args - Global `ARG` names (before the first `FROM`).
 * @property {Finding[]} findings
 * @property {string} escape - Escape character.
 */

/**
 * Splits a Dockerfile into instructions.
 *
 * @param {string} input
 * @returns {{ instructions: Instruction[], escape: string, unknown: { line: number, text: string }[] }}
 */
export function splitInstructions(input) {
  const text = input.length > MAX_TEXT ? input.slice(0, MAX_TEXT) : input;
  const lines = text.split(/\r?\n/);
  let escape = '\\';
  // Parser directives: comments at the very top.
  for (const line of lines) {
    const m = /^#\s*escape\s*=\s*(\S)\s*$/i.exec(line);
    if (m) escape = m[1];
    if (!/^#\s*\w+\s*=/.test(line)) break;
  }
  /** @type {Instruction[]} */
  const instructions = [];
  /** @type {{ line: number, text: string }[]} */
  const unknown = [];
  for (let i = 0; i < lines.length; i += 1) {
    const first = lines[i];
    if (!first.trim() || /^\s*#/.test(first)) continue;
    const start = i;
    const parts = [first];
    // Continuation lines; comment lines inside are skipped, as Docker does.
    while (parts.at(-1)?.trimEnd().endsWith(escape) && i + 1 < lines.length) {
      i += 1;
      if (/^\s*#/.test(lines[i])) continue;
      parts.push(lines[i]);
    }
    const joined = parts
      .map((p, k) => (k < parts.length - 1 ? p.trimEnd().slice(0, -1) : p))
      .join(' ');
    const m = /^\s*([A-Za-z]+)(?:\s+([\s\S]*))?$/.exec(joined);
    if (!m || !INSTRUCTIONS.has(m[1].toUpperCase())) {
      unknown.push({ line: start + 1, text: first.trim().slice(0, 60) });
      continue;
    }
    const keyword = m[1].toUpperCase();
    let args = (m[2] ?? '').trim();
    /** @type {string[]} */
    const heredocs = [];
    // Heredocs: RUN <<EOF … EOF (BuildKit), possibly several.
    for (const h of [...args.matchAll(/<<-?\s*["']?([A-Za-z_][A-Za-z0-9_]*)["']?/g)]) {
      const end = h[1];
      /** @type {string[]} */
      const body = [];
      while (i + 1 < lines.length && lines[i + 1].trim() !== end) body.push(lines[++i]);
      if (i + 1 < lines.length) i += 1;
      heredocs.push(body.join('\n'));
      parts.push(...body, end);
    }
    /** @type {string[]} */
    const flags = [];
    while (/^--[a-z-]+(=\S*)?(\s|$)/.test(args)) {
      const flag = /** @type {RegExpExecArray} */ (
        /^(--[a-z-]+(?:=(?:"[^"]*"|\S*))?)\s*/.exec(args)
      );
      flags.push(flag[1]);
      args = args.slice(flag[0].length);
    }
    instructions.push({ keyword, args, raw: parts.join('\n'), flags, line: start + 1, lines: i - start + 1, json: /^\[.*\]$/s.test(args), heredocs }); // prettier-ignore
  }
  return { instructions, escape, unknown };
}

/**
 * @param {string} args - Exec form or shell form.
 * @returns {string[]}
 */
export function words(args) {
  if (/^\[.*\]$/s.test(args)) {
    try {
      const list = JSON.parse(args);
      if (Array.isArray(list)) return list.map(String);
    } catch {
      // Not valid JSON: Docker runs it as a shell command.
    }
  }
  return args.match(/"[^"]*"|'[^']*'|\S+/g)?.map((w) => w.replace(/^["']|["']$/g, '')) ?? [];
}

/**
 * Reads an image reference: `registry/name:tag@digest`.
 *
 * @param {string} ref
 * @returns {{ name: string, tag: string, digest: string, variable: boolean }}
 */
export function imageRef(ref) {
  const digest = /@(sha256:[0-9a-f]{64})$/i.exec(ref)?.[1] ?? '';
  const rest = digest ? ref.slice(0, ref.length - digest.length - 1) : ref;
  const slash = rest.lastIndexOf('/');
  const colon = rest.lastIndexOf(':');
  const tag = colon > slash ? rest.slice(colon + 1) : '';
  return {
    name: colon > slash ? rest.slice(0, colon) : rest,
    tag,
    digest,
    variable: /\$/.test(ref),
  };
}

const SECRET = /(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIALS?)\b/i;

/**
 * Reads a Dockerfile and checks it.
 *
 * @param {string} input
 * @returns {Dockerfile}
 */
export function parseDockerfile(input) {
  const { instructions, escape, unknown } = splitInstructions(input);
  /** @type {Finding[]} */
  const findings = [];
  const add = (/** @type {string} */ id, /** @type {Finding["level"]} */ level, /** @type {number} */ line, /** @type {Record<string, string>} */ params = {}) =>
    findings.push({ id, level, line, params }); // prettier-ignore
  for (const u of unknown) add('unknown', 'danger', u.line, { text: u.text });
  /** @type {Stage[]} */
  const stages = [];
  /** @type {string[]} */
  const args = [];
  /** @type {Stage | null} */
  let stage = null;
  for (const ins of instructions) {
    if (ins.keyword === 'FROM') {
      const w = words(ins.args);
      const image = w[0] ?? '';
      const as = w[1]?.toUpperCase() === 'AS' ? (w[2] ?? '') : '';
      const platform = ins.flags.find((f) => f.startsWith('--platform='))?.slice(11) ?? '';
      const parent = stages.findIndex(
        (s) => s.name && s.name.toLowerCase() === image.toLowerCase(),
      );
      stage = { index: stages.length, name: as, image, platform, instructions: [], from: [], user: '', ports: [], final: false, parent, origin: ins }; // prettier-ignore
      if (parent >= 0) stage.user = stages[parent].user;
      stages.push(stage);
      if (parent < 0 && image.toLowerCase() !== 'scratch') {
        const ref = imageRef(image);
        if (ref.variable) add('variableImage', 'info', ins.line, { image });
        else if (!ref.tag && !ref.digest) add('untagged', 'warning', ins.line, { image });
        else if (ref.tag === 'latest') add('latest', 'warning', ins.line, { image });
      }
      if (as && stages.slice(0, -1).some((s) => s.name.toLowerCase() === as.toLowerCase())) add('duplicateStage', 'danger', ins.line, { name: as }); // prettier-ignore
      continue;
    }
    if (!stage) {
      if (ins.keyword === 'ARG') args.push(words(ins.args)[0]?.split('=')[0] ?? '');
      else add('beforeFrom', 'danger', ins.line, { keyword: ins.keyword });
      continue;
    }
    stage.instructions.push(ins);
    checkInstruction(ins, stage, stages, add);
  }
  if (!stages.length && instructions.length) add('noFrom', 'danger', 1);
  const last = stages.at(-1);
  if (last) {
    last.final = true;
    const runs = last.instructions.some((i) => i.keyword === 'CMD' || i.keyword === 'ENTRYPOINT');
    if (!last.user || /^(root|0)(:|$)/.test(last.user)) {
      const userLine = [...last.instructions].reverse().find((i) => i.keyword === 'USER')?.line;
      add(
        last.user ? 'rootUser' : 'noUser',
        'warning',
        userLine ?? last.instructions.at(-1)?.line ?? 1,
      );
    }
    for (const keyword of ['CMD', 'ENTRYPOINT']) {
      const list = last.instructions.filter((i) => i.keyword === keyword);
      if (list.length > 1) add('several', 'warning', list[1].line, { keyword });
    }
    if (runs && !last.instructions.some((i) => i.keyword === 'HEALTHCHECK') && last.image !== 'scratch') add('noHealthcheck', 'info', last.instructions.at(-1)?.line ?? 1); // prettier-ignore
  }
  // Stages never used by the final image.
  const used = new Set(last ? [last.index] : []);
  for (let k = stages.length - 1; k >= 0; k -= 1) {
    if (!used.has(k)) continue;
    const s = stages[k];
    if (s.parent >= 0) used.add(s.parent);
    for (const f of s.from) {
      const j = stages.findIndex(
        (x) => x.name.toLowerCase() === f.toLowerCase() || String(x.index) === f,
      );
      if (j >= 0) used.add(j);
    }
  }
  for (const s of stages) if (!used.has(s.index)) add('unusedStage', 'info', s.instructions[0]?.line ?? 1, { name: s.name || String(s.index) }); // prettier-ignore
  findings.sort((a, b) => a.line - b.line);
  return { instructions, stages, args, findings, escape };
}

/**
 * @param {Instruction} ins
 * @param {Stage} stage
 * @param {Stage[]} stages
 * @param {(id: string, level: Finding["level"], line: number, params?: Record<string, string>) => void} add
 */
function checkInstruction(ins, stage, stages, add) {
  const { keyword, args, line } = ins;
  const cmd = [args, ...ins.heredocs].join('\n');
  if (keyword === 'MAINTAINER') add('maintainer', 'info', line);
  if (keyword === 'USER') stage.user = args.trim();
  if (keyword === 'EXPOSE') {
    for (const port of args.split(/\s+/).filter(Boolean)) {
      stage.ports.push(port);
      if (/^22(\/tcp)?$/.test(port)) add('ssh', 'warning', line);
    }
  }
  if (keyword === 'WORKDIR' && !/^(\/|\$|[A-Za-z]:[\\/])/.test(args.trim())) add('relativeWorkdir', 'warning', line, { dir: args.trim() }); // prettier-ignore
  if (keyword === 'ADD') {
    const w = words(args).filter((x) => !x.startsWith('--'));
    const sources = w.slice(0, -1);
    if (sources.some((s) => /^https?:\/\//i.test(s))) add('addUrl', 'warning', line);
    else if (!sources.some((s) => /\.(tar|tar\.gz|tgz|tar\.bz2|tar\.xz|txz)$/i.test(s) || /^git@|\.git(#|$)/.test(s))) add('addCopy', 'warning', line); // prettier-ignore
  }
  if (keyword === 'COPY' || keyword === 'ADD') {
    const from = ins.flags.find((f) => f.startsWith('--from='))?.slice(7);
    if (from) {
      stage.from.push(from);
      const known =
        stages.some((s) => s.name.toLowerCase() === from.toLowerCase()) || /^\d+$/.test(from);
      if (!known && !/[/:.]/.test(from)) add('unknownStage', 'danger', line, { name: from });
    }
    const w = words(args);
    if (w.length >= 2 && w[0] === '.' && !ins.flags.some((f) => f.startsWith('--from='))) {
      const later = stage.instructions.slice(stage.instructions.indexOf(ins) + 1);
      if (
        later.some(
          (i) =>
            i.keyword === 'RUN' &&
            /\b(npm (ci|install)|yarn( install)?\b|pnpm install|pip3? install|poetry install|bundle install|go mod download|composer install|mvn |gradle )/.test(
              i.args,
            ),
        )
      )
        // prettier-ignore
        add('copyAllFirst', 'info', line);
    }
  }
  if (keyword === 'ENV' || keyword === 'ARG') {
    const names = keyword === 'ENV' && !/=/.test(args) ? [args.split(/\s+/)[0]] : (args.match(/(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)(?==|\s|$)/g) ?? []).map((s) => s.trim()); // prettier-ignore
    for (const name of names)
      if (SECRET.test(name)) add('secret', 'danger', line, { keyword, name });
  }
  if ((keyword === 'CMD' || keyword === 'ENTRYPOINT') && !ins.json && args.trim()) add('shellForm', 'info', line, { keyword }); // prettier-ignore
  if (keyword !== 'RUN') return;
  if (/\bsudo\b/.test(cmd)) add('sudo', 'warning', line);
  if (/(^|[;&|]\s*)cd\s+\S/.test(cmd) && !/&&\s*cd\s+-/.test(cmd)) add('cd', 'info', line);
  if (/\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(cmd))
    add('pipeShell', 'warning', line);
  if (/\bchmod\s+(-R\s+)?0?777\b/.test(cmd)) add('chmod777', 'warning', line);
  if (/\bapt-get\s+(-\S+\s+)*upgrade\b|\bapt-get\s+dist-upgrade\b/.test(cmd)) add('upgrade', 'info', line); // prettier-ignore
  if (/\bapt-get\s+(-\S+\s+)*install\b/.test(cmd)) {
    if (!/--no-install-recommends/.test(cmd)) add('aptRecommends', 'info', line);
    if (!/rm\s+-[rf]+\s+\/var\/lib\/apt\/lists/.test(cmd) && !ins.flags.some((f) => /--mount=type=cache/.test(f))) add('aptLists', 'warning', line); // prettier-ignore
    if (!/\s-y\b|--yes|--assume-yes|-qq?y/.test(cmd)) add('aptYes', 'danger', line);
  }
  if (/\bapt-get\s+update\b/.test(cmd) && !/\binstall\b/.test(cmd)) add('aptUpdateAlone', 'warning', line); // prettier-ignore
  if (/\bapk\s+add\b/.test(cmd) && !/--no-cache/.test(cmd)) add('apkCache', 'info', line);
  if (/\bpip3?\s+install\b/.test(cmd) && !/--no-cache-dir/.test(cmd) && !ins.flags.some((f) => /--mount=type=cache/.test(f))) add('pipCache', 'info', line); // prettier-ignore
  // `npm install` with no package names: `npm ci` installs the lockfile exactly.
  if (/\bnpm\s+install\b/.test(cmd) && !/\bnpm\s+install\s+(?:-g\b|--global\b|[^-\s&;|])/.test(cmd)) add('npmCi', 'info', line); // prettier-ignore
  // A pipe hides the failure of its first command unless pipefail is set.
  if (!ins.json && /[^|]\|[^|]/.test(cmd) && !/pipefail/.test(cmd)) add('pipefail', 'info', line);
}

/**
 * Worst level of a list of findings.
 *
 * @param {Finding[]} findings
 * @returns {"danger" | "warning" | "info" | "none"}
 */
export function worst(findings) {
  for (const level of /** @type {const} */ (['danger', 'warning', 'info'])) if (findings.some((f) => f.level === level)) return level; // prettier-ignore
  return 'none';
}
