// @ts-check
/**
 * Reads Jupyter notebooks (`.ipynb`, nbformat 4, and the cells of nbformat 3) for
 * <vt-notebook>: cells, their outputs and the kernel language. Nothing is ever run.
 *
 * @module components/notebook/notebook
 */

/** Cells kept per notebook. */
export const MAX_CELLS = 5000;
/** Outputs kept per cell. */
export const MAX_OUTPUTS = 200;

/**
 * @typedef {object} Output
 * @property {"stream" | "result" | "display" | "error"} type
 * @property {string} name - `stdout` or `stderr` for streams.
 * @property {number | null} count - Execution count of a result.
 * @property {Record<string, string>} data - Text of each MIME type (`image/png` holds base64).
 * @property {string} text - Stream text, or the traceback of an error.
 * @property {string} ename
 * @property {string} evalue
 */

/**
 * @typedef {object} Cell
 * @property {"markdown" | "code" | "raw"} type
 * @property {string} source
 * @property {number | null} count - Execution count of a code cell.
 * @property {Output[]} outputs
 * @property {Record<string, Record<string, string>>} attachments - Images of a Markdown cell, by name.
 * @property {boolean} hidden - Its source is hidden (`jupyter.source_hidden`, `hide_input`).
 * @property {boolean} outputsHidden
 * @property {string[]} tags
 */

/**
 * @typedef {object} Notebook
 * @property {Cell[]} cells
 * @property {string} language - Language of the code cells (`python`, `r`, `julia`…).
 * @property {string} kernel - Display name of the kernel (`Python 3 (ipykernel)`).
 * @property {number} format - nbformat version.
 */

export class NotebookError extends Error {}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Sources are a string or a list of lines that already end with `\n`.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function joinSource(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((line) => (typeof line === 'string' ? line : '')).join(''); // prettier-ignore
  return '';
}

/**
 * Reads a notebook from its JSON text.
 *
 * @param {string} text
 * @returns {Notebook}
 */
export function parseNotebook(text) {
  if (!text.trim()) throw new NotebookError('empty');
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new NotebookError(`json:${error instanceof Error ? error.message : ''}`);
  }
  return readNotebook(value);
}

/**
 * @param {unknown} value
 * @returns {Notebook}
 */
export function readNotebook(value) {
  if (!isObject(value)) throw new NotebookError('format');
  const metadata = isObject(value.metadata) ? value.metadata : {};
  const kernelspec = isObject(metadata.kernelspec) ? metadata.kernelspec : {};
  const info = isObject(metadata.language_info) ? metadata.language_info : {};
  const language = String(info.name ?? kernelspec.language ?? metadata.language ?? 'python').slice(0, 40).toLowerCase(); // prettier-ignore
  /** @type {unknown[]} */
  let cells;
  if (Array.isArray(value.cells)) cells = value.cells;
  else if (
    Array.isArray(value.worksheets) &&
    isObject(value.worksheets[0]) &&
    Array.isArray(value.worksheets[0].cells)
  )
    cells = value.worksheets[0].cells; // nbformat 3
  else throw new NotebookError('format');
  return {
    cells: cells.slice(0, MAX_CELLS).filter(isObject).map(readCell),
    language,
    kernel: String(kernelspec.display_name ?? '').slice(0, 100),
    format: Number(value.nbformat) || 4,
  };
}

/**
 * @param {Record<string, unknown>} cell
 * @returns {Cell}
 */
function readCell(cell) {
  const kind = cell.cell_type === 'markdown' || cell.cell_type === 'heading' ? 'markdown' : cell.cell_type === 'code' ? 'code' : 'raw'; // prettier-ignore
  const metadata = isObject(cell.metadata) ? cell.metadata : {};
  const jupyter = isObject(metadata.jupyter) ? metadata.jupyter : {};
  const tags = Array.isArray(metadata.tags) ? metadata.tags.filter((t) => typeof t === 'string').slice(0, 50) : []; // prettier-ignore
  let source = joinSource(cell.source ?? cell.input);
  // nbformat 3 headings: a level and a line of text.
  if (cell.cell_type === 'heading') source = `${'#'.repeat(Math.min(6, Math.max(1, Number(cell.level) || 1)))} ${source}`; // prettier-ignore
  /** @type {Record<string, Record<string, string>>} */
  const attachments = {};
  if (isObject(cell.attachments)) {
    for (const [name, bundle] of Object.entries(cell.attachments).slice(0, 100))
      if (isObject(bundle)) attachments[name] = mimeBundle(bundle);
  }
  const count = cell.execution_count ?? cell.prompt_number;
  return {
    type: kind,
    source,
    count: typeof count === 'number' && Number.isFinite(count) ? count : null,
    outputs: kind === 'code' && Array.isArray(cell.outputs) ? cell.outputs.slice(0, MAX_OUTPUTS).filter(isObject).map(readOutput) : [], // prettier-ignore
    attachments,
    hidden: jupyter.source_hidden === true || metadata.hide_input === true || tags.includes('hide-input') || tags.includes('remove-input'), // prettier-ignore
    outputsHidden: jupyter.outputs_hidden === true || tags.includes('hide-output') || tags.includes('remove-output'), // prettier-ignore
    tags,
  };
}

/**
 * @param {Record<string, unknown>} bundle
 * @returns {Record<string, string>}
 */
function mimeBundle(bundle) {
  /** @type {Record<string, string>} */
  const data = {};
  for (const [type, value] of Object.entries(bundle).slice(0, 30)) {
    if (!/^[\w.+-]+\/[\w.+-]+$/.test(type)) continue;
    data[type] = typeof value === 'string' || Array.isArray(value) ? joinSource(value) : JSON.stringify(value) ?? ''; // prettier-ignore
  }
  return data;
}

/**
 * @param {Record<string, unknown>} output
 * @returns {Output}
 */
function readOutput(output) {
  const kind = String(output.output_type ?? '');
  /** @type {Output} */
  const result = {
    type: 'display',
    name: '',
    count: null,
    data: {},
    text: '',
    ename: '',
    evalue: '',
  };
  if (kind === 'stream') {
    result.type = 'stream';
    result.name = output.name === 'stderr' || output.stream === 'stderr' ? 'stderr' : 'stdout';
    result.text = joinSource(output.text);
  } else if (kind === 'error' || kind === 'pyerr') {
    result.type = 'error';
    result.ename = String(output.ename ?? '').slice(0, 200);
    result.evalue = String(output.evalue ?? '').slice(0, 4000);
    result.text = Array.isArray(output.traceback) ? output.traceback.map((line) => String(line)).join('\n') : ''; // prettier-ignore
  } else {
    result.type = kind === 'execute_result' || kind === 'pyout' ? 'result' : 'display';
    const count = output.execution_count ?? output.prompt_number;
    result.count = typeof count === 'number' ? count : null;
    if (isObject(output.data)) result.data = mimeBundle(output.data);
    else {
      // nbformat 3 kept the types at the top level, by short name.
      const short = { text: 'text/plain', html: 'text/html', png: 'image/png', jpeg: 'image/jpeg', svg: 'image/svg+xml', latex: 'text/latex', json: 'application/json', markdown: 'text/markdown' }; // prettier-ignore
      for (const [key, type] of Object.entries(short))
        if (key in output) result.data[type] = joinSource(output[key]);
    }
  }
  return result;
}

/** Types shown, richest first. */
export const MIME_ORDER = Object.freeze([
  'application/vnd.jupyter.widget-view+json',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'text/html',
  'text/markdown',
  'text/latex',
  'application/json',
  'text/plain',
]);

/**
 * The type of a bundle to show: the richest known one. Widgets need a live kernel, so their
 * plain text stands in for them.
 *
 * @param {Record<string, string>} data
 * @returns {string | null}
 */
export function pickMime(data) {
  for (const type of MIME_ORDER) {
    if (!(type in data)) continue;
    if (type === 'application/vnd.jupyter.widget-view+json') continue;
    return type;
  }
  return Object.keys(data).find((type) => type.startsWith('text/')) ?? null;
}

/**
 * Base64 of an image output, without the line breaks notebooks keep in it; `null` when it
 * is not base64.
 *
 * @param {string} value
 * @returns {string | null}
 */
export function cleanBase64(value) {
  const compact = value.replace(/\s+/g, '');
  return /^[A-Za-z0-9+/]+={0,2}$/.test(compact) && compact.length % 4 === 0 ? compact : null;
}

/**
 * The code cells as one script, with the Markdown cells as comments.
 *
 * @param {Notebook} notebook
 * @returns {string}
 */
export function toScript(notebook) {
  const comment = ['python', 'r', 'julia', 'ruby', 'perl', 'bash', 'sh', 'powershell'].includes(notebook.language) ? '# ' : notebook.language === 'sql' ? '-- ' : '// '; // prettier-ignore
  return notebook.cells
    .filter((cell) => cell.type !== 'raw' && cell.source.trim())
    .map(
      (cell) =>
      cell.type === 'code'
        ? cell.source.replace(/\s+$/, '')
        : cell.source.trim().split('\n').map((line) => `${comment}${line}`.trimEnd()).join('\n'), // prettier-ignore
    )
    .join('\n\n');
}
