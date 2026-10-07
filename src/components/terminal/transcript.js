// @ts-check
/**
 * Splits a terminal transcript into commands and their output.
 *
 * A line is a command when it starts with one of the prompts (`$` by default), possibly
 * preceded by a context such as `ada@box:~/app` (letters, digits and `@ : ~ . / \ _ -`),
 * and followed by a space or the end of the line. A command ending with a backslash
 * continues on the next line.
 *
 * @module components/terminal/transcript
 */
import { lineText } from './ansi.js';

/** @typedef {import('./ansi.js').Segment} Segment */

/**
 * @typedef {object} CommandEntry
 * @property {"command"} type
 * @property {string} prompt - The prompt as written, context included (`ada@box:~$`).
 * @property {string[]} lines - Command lines without the prompt (continuations included).
 * @property {number} line - 1-based line in the transcript.
 */

/**
 * @typedef {object} OutputEntry
 * @property {"output"} type
 * @property {Segment[][]} lines - Styled output lines.
 * @property {number} line - 1-based line in the transcript.
 */

/** @typedef {CommandEntry | OutputEntry} Entry */

/** Default prompts. */
export const DEFAULT_PROMPTS = Object.freeze(['$', '❯']);

/** At most this many prompts are accepted from the `prompt` attribute. */
const MAX_PROMPTS = 8;

/**
 * Reads the `prompt` attribute: prompts separated by spaces (`"$ > PS>"`), or `none`.
 *
 * @param {string | null} value
 * @returns {string[]}
 */
export function parsePrompts(value) {
  if (value === null) return [...DEFAULT_PROMPTS];
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') return [];
  return trimmed
    .split(/\s+/)
    .filter((p) => p.length <= 16)
    .slice(0, MAX_PROMPTS);
}

/**
 * Builds the matcher for a list of prompts.
 *
 * @param {string[]} prompts
 * @returns {(text: string) => { prompt: string, rest: string } | null}
 */
export function promptMatcher(prompts) {
  if (!prompts.length) return () => null;
  const escaped = prompts
    .slice()
    // Longest first, so "PS>" wins over ">".
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`^([\\w@:~./\\\\-]{0,120}?(?:${escaped.join('|')}))(?: |$)`);
  return (text) => {
    const match = pattern.exec(text);
    if (!match) return null;
    return { prompt: match[1], rest: text.slice(match[0].length) };
  };
}

/**
 * Splits parsed lines into command and output entries.
 *
 * @param {Segment[][]} lines - Lines from `parseAnsi`.
 * @param {string[]} prompts
 * @returns {Entry[]}
 */
export function parseTranscript(lines, prompts) {
  const match = promptMatcher(prompts);
  /** @type {Entry[]} */
  const entries = [];
  /** @type {OutputEntry | null} */
  let output = null;
  /** @type {CommandEntry | null} */
  let continued = null;

  lines.forEach((segments, index) => {
    const text = lineText(segments);
    if (continued) {
      continued.lines.push(text);
      if (!/\\$/.test(text)) continued = null;
      return;
    }
    const command = match(text);
    if (command) {
      output = null;
      /** @type {CommandEntry} */
      const entry = {
        type: 'command',
        prompt: command.prompt,
        lines: [command.rest],
        line: index + 1,
      };
      entries.push(entry);
      if (/\\$/.test(command.rest)) continued = entry;
      return;
    }
    if (!output) {
      output = { type: 'output', lines: [], line: index + 1 };
      entries.push(output);
    }
    output.lines.push(segments);
  });
  return entries;
}

/**
 * The commands of a transcript, ready to paste in a shell (one per line).
 *
 * @param {Entry[]} entries
 * @returns {string}
 */
export function commandsText(entries) {
  return entries
    .filter((e) => e.type === 'command')
    .map((e) => /** @type {CommandEntry} */ (e).lines.join('\n'))
    .join('\n');
}
