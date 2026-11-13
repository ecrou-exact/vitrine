// @vitest-environment jsdom
// DOMPurify does not support happy-dom: the sanitized outputs are checked in jsdom.
// @ts-check
import { describe, expect, it } from 'vitest';
import {
  NotebookError,
  cleanBase64,
  parseNotebook,
  pickMime,
  toScript,
} from '../../src/components/notebook/notebook.js';
import { VtNotebook, withAttachments } from '../../src/components/notebook/vt-notebook.js';

if (!customElements.get('vt-notebook')) customElements.define('vt-notebook', VtNotebook);

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const NOTEBOOK = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {
    kernelspec: { name: 'python3', display_name: 'Python 3 (ipykernel)', language: 'python' },
    language_info: { name: 'python' },
  },
  cells: [
    { cell_type: 'markdown', metadata: {}, source: ['# Analysis\n', '\n', 'Some *text*.'] },
    {
      cell_type: 'code',
      execution_count: 3,
      metadata: {},
      source: ['import pandas as pd\n', 'df.head()'],
      outputs: [
        { output_type: 'stream', name: 'stdout', text: ['loading\n'] },
        {
          output_type: 'execute_result',
          execution_count: 3,
          metadata: {},
          data: {
            'text/plain': ['   a\n0  1'],
            'text/html': [
              '<table class="dataframe"><tr><th>a</th></tr><tr><td>1</td></tr></table>',
            ],
          },
        },
        {
          output_type: 'display_data',
          metadata: {},
          data: {
            'image/png': `${PNG.slice(0, 40)}\n${PNG.slice(40)}`,
            'text/plain': ['<Figure>'],
          },
        },
      ],
    },
    {
      cell_type: 'code',
      execution_count: 4,
      metadata: { jupyter: { source_hidden: true } },
      source: '1 / 0',
      outputs: [
        {
          output_type: 'error',
          ename: 'ZeroDivisionError',
          evalue: 'division by zero',
          traceback: ['\u001b[0;31mZeroDivisionError\u001b[0m: division by zero'],
        },
      ],
    },
    { cell_type: 'raw', metadata: {}, source: 'raw text' },
  ],
};

/**
 * @param {Record<string, string>} attributes
 * @param {unknown} value
 * @returns {Promise<VtNotebook>}
 */
async function mount(attributes, value) {
  const el = /** @type {VtNotebook} */ (document.createElement('vt-notebook'));
  for (const [name, v] of Object.entries(attributes)) el.setAttribute(name, v);
  el.content = typeof value === 'string' ? value : JSON.stringify(value);
  document.body.replaceChildren(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

describe('parseNotebook', () => {
  it('reads cells, sources as lists of lines, counts, outputs and the kernel', () => {
    const notebook = parseNotebook(JSON.stringify(NOTEBOOK));
    expect(notebook.language).toBe('python');
    expect(notebook.kernel).toBe('Python 3 (ipykernel)');
    expect(notebook.cells.map((c) => c.type)).toEqual(['markdown', 'code', 'code', 'raw']);
    const code = notebook.cells[1];
    expect(code.source).toBe('import pandas as pd\ndf.head()');
    expect(code.count).toBe(3);
    expect(code.outputs.map((o) => o.type)).toEqual(['stream', 'result', 'display']);
    expect(code.outputs[1].data['text/html']).toContain('<table');
    expect(notebook.cells[2].hidden).toBe(true);
    expect(notebook.cells[2].outputs[0]).toMatchObject({
      type: 'error',
      ename: 'ZeroDivisionError',
    });
  });

  it('reads the cells of nbformat 3', () => {
    const notebook = parseNotebook(
      JSON.stringify({
        nbformat: 3,
        metadata: { language: 'python' },
        worksheets: [
          {
            cells: [
              { cell_type: 'heading', level: 2, source: 'Title' },
              { cell_type: 'code', input: 'x', prompt_number: 1, outputs: [{ output_type: 'pyout', prompt_number: 1, text: ['1'] }] },
            ],
          },
        ],
      }),
    ); // prettier-ignore
    expect(notebook.cells[0].source).toBe('## Title');
    expect(notebook.cells[1]).toMatchObject({ source: 'x', count: 1 });
    expect(notebook.cells[1].outputs[0]).toMatchObject({
      type: 'result',
      data: { 'text/plain': '1' },
    });
  });

  it('refuses what is not a notebook', () => {
    expect(() => parseNotebook('')).toThrow(NotebookError);
    expect(() => parseNotebook('{oops')).toThrow(/^json:/);
    expect(() => parseNotebook('{"a":1}')).toThrow('format');
  });
});

describe('helpers', () => {
  it('picks the richest type, never a widget', () => {
    expect(pickMime({ 'text/plain': 'x', 'image/png': 'y' })).toBe('image/png');
    expect(pickMime({ 'text/plain': 'x', 'text/html': '<b>' })).toBe('text/html');
    expect(pickMime({ 'application/vnd.jupyter.widget-view+json': '{}', 'text/plain': 'w' })).toBe('text/plain'); // prettier-ignore
    expect(pickMime({ 'application/x-unknown': 'z' })).toBeNull();
  });

  it('accepts only base64 for images', () => {
    expect(cleanBase64('aGVs\nbG8=')).toBe('aGVsbG8=');
    expect(cleanBase64('"><script>')).toBeNull();
  });

  it('writes the code as a script, Markdown as comments', () => {
    expect(toScript(parseNotebook(JSON.stringify(NOTEBOOK)))).toBe(
      '# # Analysis\n#\n# Some *text*.\n\nimport pandas as pd\ndf.head()\n\n1 / 0',
    );
  });

  it('puts the images of a cell in its Markdown', () => {
    expect(withAttachments('![plot](attachment:a.png)', { 'a.png': { 'image/png': PNG } })).toBe(
      `![plot](data:image/png;base64,${PNG})`,
    );
    expect(withAttachments('![x](attachment:none.png)', {})).toBe('![x](attachment:none.png)');
  });
});

describe('<vt-notebook>', () => {
  it('renders Markdown, code with prompts, and every kind of output', async () => {
    const el = await mount({}, NOTEBOOK);
    expect(el.root.querySelector('.nb-markdown h1')?.textContent).toBe('Analysis');
    expect(el.root.querySelector('.nb-markdown em')?.textContent).toBe('text');
    const prompts = Array.from(el.root.querySelectorAll('.nb-prompt'), (p) => p.textContent);
    expect(prompts).toContain('In [3]:');
    expect(prompts).toContain('Out [3]:');
    expect(el.root.querySelector('.nb-stream')?.textContent).toBe('loading');
    expect(el.root.querySelector('.nb-html table td')?.textContent).toBe('1');
    expect(el.root.querySelector('.nb-img')?.getAttribute('src')).toBe(
      `data:image/png;base64,${PNG}`,
    );
    expect(el.root.querySelector('.nb-error .fg-1')?.textContent).toBe('ZeroDivisionError');
    // The hidden cell shows a button instead of its code.
    expect(el.root.querySelector('.nb-hidden')?.textContent).toContain('Code hidden');
  });

  it('sanitizes HTML outputs and shows SVG only as an image', async () => {
    const el = await mount({}, {
      cells: [
        {
          cell_type: 'code',
          source: 'x',
          outputs: [
            { output_type: 'display_data', data: { 'text/html': '<img src=x onerror=alert(1)><script>alert(2)</script><b>ok</b>' } },
            { output_type: 'display_data', data: { 'image/svg+xml': '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(3)</script></svg>' } },
            { output_type: 'display_data', data: { 'image/png': '"><script>alert(4)</script>', 'text/plain': 'fallback' } },
          ],
        },
      ],
    }); // prettier-ignore
    expect(el.root.querySelector('script, svg script')).toBeNull();
    expect(el.root.querySelector('[onerror]')).toBeNull();
    expect(el.root.querySelector('.nb-html b')?.textContent).toBe('ok');
    const svg = el.root.querySelector('.nb-img');
    expect(svg?.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/);
    // Not base64: the plain text stands in for the image.
    expect(el.root.textContent).toContain('fallback');
  });

  it('hides the code like a report', async () => {
    const el = await mount({ variant: 'full' }, NOTEBOOK);
    expect(el.root.querySelectorAll('.nb-source')).toHaveLength(1);
    /** @type {HTMLButtonElement} */ (
      el.root.querySelector('[data-focus-key="code-toggle"]')
    ).click();
    expect(el.root.querySelectorAll('.nb-source')).toHaveLength(0);
    expect(el.root.querySelector('.nb-html table')).not.toBeNull();
  });
});
