// @ts-check
import { describe, expect, it } from 'vitest';
import { fenceToHtml, parseInfo } from '../../src/integrations/fences.js';
import markdownIt from '../../src/integrations/markdown-it.js';
import remarkVitrine from '../../src/integrations/remark.js';

describe('fenceToHtml', () => {
  it('maps languages to elements, with the code escaped in a template', () => {
    expect(fenceToHtml('sql', 'SELECT 1 < 2;\n')).toBe(
      '<vt-sql><template>SELECT 1 &lt; 2;</template></vt-sql>\n',
    );
    expect(fenceToHtml('mermaid', 'flowchart LR\n  A --> B')).toBe(
      '<vt-diagram><template>flowchart LR\n  A --&gt; B</template></vt-diagram>\n',
    );
    expect(fenceToHtml('pgsql', 'x')).toContain('<vt-sql dialect="postgresql">');
    expect(fenceToHtml('tsv', 'a\tb')).toContain('<vt-csv delimiter="\t">');
    expect(fenceToHtml('Math', 'x^2')).toContain('<vt-math>');
  });

  it('turns other languages into <vt-code>, or leaves them with code: false', () => {
    expect(fenceToHtml('rust', 'fn main() {}')).toBe(
      '<vt-code language="rust"><template>fn main() {}</template></vt-code>\n',
    );
    expect(fenceToHtml('', 'plain')).toBe('<vt-code><template>plain</template></vt-code>\n');
    expect(fenceToHtml('rust', 'x', { code: false })).toBeNull();
  });

  it('reads a title, and options for the variant, languages and attributes', () => {
    expect(parseInfo('sql title="Active users" {1,3}')).toEqual({ language: 'sql', label: 'Active users' }); // prettier-ignore
    expect(
      fenceToHtml('js label=app.js', 'x', {
        variant: 'full',
        attributes: { 'vt-code': { 'line-numbers': '' } },
      }),
    ).toBe('<vt-code variant="full" language="js" label="app.js" line-numbers><template>x</template></vt-code>\n'); // prettier-ignore
    expect(fenceToHtml('sql', 'x', { elements: { sql: 'vt-code' } })).toContain(
      '<vt-code language="sql">',
    );
    expect(fenceToHtml('mermaid', 'x', { elements: { mermaid: false } })).toBeNull();
  });

  it('never writes markup from the content, the title or the options', () => {
    const html = /** @type {string} */ (
      fenceToHtml('sql title="</template><script>alert(1)</script>"', '</template><img src=x onerror=alert(1)>', {
        attributes: { 'vt-sql': { onclick: 'alert(1)', 'bad name': 'x', label: '"><b>' } },
      })
    ); // prettier-ignore
    expect(html).not.toMatch(/<script|<img|onclick|bad name|"><b>/);
    expect(html.match(/<\/template>/g)).toHaveLength(1);
    expect(fenceToHtml('sql', 'x', { elements: { sql: 'script' } })).toBeNull();
  });
});

describe('markdown-it plugin', () => {
  it('renders fences as elements, and leaves others to the default rule', () => {
    const md = { renderer: { rules: { fence: () => '<pre>default</pre>' } } };
    markdownIt(md, { code: false });
    const render = (/** @type {string} */ info, /** @type {string} */ content) =>
      md.renderer.rules.fence([{ info, content }], 0, {}, {}, {});
    expect(render('json', '{"a":1}\n')).toBe('<vt-json><template>{&quot;a&quot;:1}</template></vt-json>\n'); // prettier-ignore
    expect(render('rust', 'fn')).toBe('<pre>default</pre>');
  });
});

describe('remark plugin', () => {
  it('replaces code nodes by html nodes, at any depth', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'code', lang: 'sql', meta: 'title=q.sql', value: 'SELECT 1;' },
        {
          type: 'blockquote',
          children: [{ type: 'code', lang: 'mermaid', meta: null, value: 'pie' }],
        },
        { type: 'paragraph', children: [{ type: 'text', value: 'text' }] },
      ],
    };
    remarkVitrine()(tree);
    expect(tree.children[0]).toEqual({
      type: 'html',
      value: '<vt-sql label="q.sql"><template>SELECT 1;</template></vt-sql>\n',
    });
    expect(/** @type {any} */ (tree.children[1]).children[0].value).toContain('<vt-diagram>');
    expect(tree.children[2].type).toBe('paragraph');
  });
});
