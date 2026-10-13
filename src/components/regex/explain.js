// @ts-check
/**
 * Explanation of a parsed pattern in plain words, as a tree of lines.
 *
 * @module components/regex/explain
 */

/** @typedef {import('./pattern.js').RegexNode} RegexNode */
/** @typedef {import('../../core/ui.js').Translate} Translate */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/**
 * @typedef {object} Explanation
 * @property {string} text - What the part does.
 * @property {string} source - The part of the pattern it explains.
 * @property {number} start
 * @property {number} end
 * @property {Explanation[]} children
 */

const GROUP_KEYS = /** @type {Record<string, StringKey>} */ ({
  capture: 'regexGroup', named: 'regexNamedGroup', 'non-capture': 'regexNonCapture',
  lookahead: 'regexLookahead', 'negative-lookahead': 'regexNegLookahead',
  lookbehind: 'regexLookbehind', 'negative-lookbehind': 'regexNegLookbehind',
  modifiers: 'regexModifiers',
}); // prettier-ignore

const ESCAPE_KEYS = /** @type {Record<string, StringKey>} */ ({
  digit: 'regexDigit', 'not-digit': 'regexNotDigit', word: 'regexWord', 'not-word': 'regexNotWord',
  space: 'regexSpace', 'not-space': 'regexNotSpace', property: 'regexProperty',
  'not-property': 'regexNotProperty', control: 'regexControl', code: 'regexCode',
}); // prettier-ignore

/**
 * @param {RegexNode} tree
 * @param {string} pattern
 * @param {string} flags
 * @param {Translate} t
 * @returns {Explanation[]}
 */
export function explain(tree, pattern, flags, t) {
  const multiline = flags.includes('m');
  const dotAll = flags.includes('s');

  /**
   * @param {RegexNode} node
   * @param {string} text
   * @param {Explanation[]} [children]
   * @returns {Explanation}
   */
  const line = (node, text, children = []) => ({
    text,
    source: pattern.slice(node.start, node.end),
    start: node.start,
    end: node.end,
    children,
  });

  /**
   * @param {number} min
   * @param {number} max
   * @param {boolean} lazy
   * @returns {string}
   */
  const times = (min, max, lazy) => {
    let text;
    if (min === 0 && max === Infinity) text = t('regexZeroOrMore');
    else if (min === 1 && max === Infinity) text = t('regexOneOrMore');
    else if (min === 0 && max === 1) text = t('regexOptional');
    else if (min === max) text = t('regexExactly', { n: min });
    else if (max === Infinity) text = t('regexAtLeast', { n: min });
    else text = t('regexBetween', { min, max });
    return lazy ? `${text} ${t('regexLazy')}` : text;
  };

  /**
   * @param {RegexNode} node
   * @returns {Explanation[]}
   */
  const walk = (node) => {
    switch (node.type) {
      case 'seq':
        return node.items.flatMap(walk);
      case 'alt':
        return [
          line(
            node,
            t('regexAlternation'),
            node.alternatives.map((alt, i) => ({
              ...line(alt, t('regexAlternative', { n: i + 1 }), walk(alt)),
            })),
          ),
        ];
      case 'group':
        return [
          line(node, t(GROUP_KEYS[node.kind], { n: node.n, name: node.name }), walk(node.body)),
        ];
      case 'quant': {
        const inner = walk(node.target);
        const what = times(node.min, node.max, node.lazy);
        if (inner.length === 1 && !inner[0].children.length)
          return [line(node, `${inner[0].text}, ${what}`)];
        return [line(node, t('regexRepeat', { times: what }), inner)];
      }
      case 'class': {
        const items = node.items.join(' ');
        return [line(node, t(node.negate ? 'regexNegClass' : 'regexClass', { items }))];
      }
      case 'any':
        return [line(node, t(dotAll ? 'regexAny' : 'regexAnyNoBreak'))];
      case 'anchor': {
        /** @type {Record<string, StringKey>} */
        const keys = {
          start: multiline ? 'regexLineStart' : 'regexTextStart',
          end: multiline ? 'regexLineEnd' : 'regexTextEnd',
          boundary: 'regexBoundary',
          'not-boundary': 'regexNotBoundary',
        };
        return [line(node, t(keys[node.kind]))];
      }
      case 'escape':
        return [line(node, t(ESCAPE_KEYS[node.kind] ?? 'regexCode', { text: node.text }))];
      case 'backref':
        return [line(node, t('regexBackref', { ref: node.ref }))];
      case 'literal':
        return node.text ? [line(node, t('regexLiteral', { text: node.text }))] : [];
      default:
        return [];
    }
  };
  return walk(tree);
}
