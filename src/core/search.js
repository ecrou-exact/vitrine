// @ts-check
/**
 * Text search with match highlighting inside rendered content.
 *
 * Matches are wrapped in `<mark>` elements built with DOM APIs. A match may span
 * several text nodes (for example across syntax highlighting tokens); it is then
 * wrapped in several marks that share the same index.
 *
 * @module core/search
 */

/** Maximum number of matches highlighted. Further matches are counted as "capped". */
export const MAX_MATCHES = 5000;

/** Longest query accepted. */
export const MAX_QUERY_LENGTH = 200;

/**
 * @typedef {object} SearchResult
 * @property {number} total - Number of highlighted matches.
 * @property {boolean} capped - `true` when more matches exist than were highlighted.
 */

/**
 * Escapes a string for literal use in a regular expression.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds the start offsets of a query in a text (case-insensitive, literal).
 *
 * @param {string} text
 * @param {string} query
 * @param {number} [limit=MAX_MATCHES]
 * @returns {{ starts: number[], capped: boolean }}
 */
export function findMatches(text, query, limit = MAX_MATCHES) {
  /** @type {number[]} */
  const starts = [];
  if (!query) return { starts, capped: false };
  const pattern = new RegExp(escapeRegExp(query), 'gi');
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (starts.length === limit) return { starts, capped: true };
    starts.push(match.index);
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  return { starts, capped: false };
}

/**
 * Highlights matches of a query inside a DOM subtree.
 */
export class TextSearch {
  /**
   * @param {Element} root - Element whose text is searched.
   * @param {{ skip?: string }} [options] - `skip`: selector of subtrees to ignore.
   */
  constructor(root, options = {}) {
    this.root = root;
    this.skip = options.skip ?? '';
    /** @type {HTMLElement[][]} */
    this.matches = [];
    this.current = -1;
  }

  /**
   * Clears previous marks and highlights every match of `query`.
   *
   * @param {string} query
   * @returns {SearchResult}
   */
  run(query) {
    this.clear();
    const q = query.slice(0, MAX_QUERY_LENGTH);
    if (!q) return { total: 0, capped: false };
    const { nodes, starts: nodeStarts, text } = this.collectText();
    const { starts, capped } = findMatches(text, q);
    /** @type {HTMLElement[][]} */
    const matches = starts.map(() => []);
    // Wrap from the end so earlier offsets stay valid while text nodes are split.
    for (let m = starts.length - 1; m >= 0; m -= 1) {
      const start = starts[m];
      const end = start + q.length;
      let index = findNodeIndex(nodeStarts, end - 1);
      while (index >= 0 && nodeStarts[index] + (nodes[index].nodeValue ?? '').length > start) {
        const nodeStart = nodeStarts[index];
        const from = Math.max(start, nodeStart) - nodeStart;
        const to = Math.min(end, nodeStart + (nodes[index].nodeValue ?? '').length) - nodeStart;
        if (to > from) matches[m].unshift(wrap(nodes[index], from, to, m));
        index -= 1;
      }
    }
    this.matches = matches;
    return { total: matches.length, capped };
  }

  /**
   * Collects searchable text nodes and their offsets in the concatenated text.
   *
   * @returns {{ nodes: Text[], starts: number[], text: string }}
   */
  collectText() {
    const skip = this.skip;
    const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (skip && parent && parent.closest(skip)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    /** @type {Text[]} */
    const nodes = [];
    /** @type {number[]} */
    const starts = [];
    /** @type {string[]} */
    const chunks = [];
    let offset = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.nodeValue ?? '';
      if (!value) continue;
      nodes.push(/** @type {Text} */ (node));
      starts.push(offset);
      chunks.push(value);
      offset += value.length;
    }
    return { nodes, starts, text: chunks.join('') };
  }

  /**
   * Makes a match the current one and scrolls it into view.
   *
   * @param {number} index - Match index; wraps around.
   * @returns {HTMLElement | null} The first mark of the current match.
   */
  go(index) {
    if (!this.matches.length) return null;
    const count = this.matches.length;
    const next = ((index % count) + count) % count;
    for (const mark of this.matches[this.current] ?? []) mark.classList.remove('current');
    this.current = next;
    for (const mark of this.matches[next]) mark.classList.add('current');
    return this.matches[next][0] ?? null;
  }

  /** Removes the "current" state without clearing the matches. */
  unsetCurrent() {
    for (const mark of this.matches[this.current] ?? []) mark.classList.remove('current');
    this.current = -1;
  }

  /**
   * Removes every mark and restores the original text nodes.
   */
  clear() {
    /** @type {Set<Node>} */
    const parents = new Set();
    for (const group of this.matches) {
      for (const mark of group) {
        const parent = mark.parentNode;
        if (!parent) continue;
        mark.replaceWith(...Array.from(mark.childNodes));
        parents.add(parent);
      }
    }
    for (const parent of parents) parent.normalize();
    this.matches = [];
    this.current = -1;
  }
}

/**
 * Binary search: index of the text node containing `offset`.
 *
 * @param {number[]} starts
 * @param {number} offset
 * @returns {number}
 */
function findNodeIndex(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Wraps `[from, to)` of a text node in a `<mark>`.
 *
 * @param {Text} node
 * @param {number} from
 * @param {number} to
 * @param {number} index
 * @returns {HTMLElement}
 */
function wrap(node, from, to, index) {
  const middle = node.splitText(from);
  middle.splitText(to - from);
  const mark = document.createElement('mark');
  mark.className = 'match';
  mark.setAttribute('part', 'match');
  mark.dataset.match = String(index);
  middle.replaceWith(mark);
  mark.appendChild(middle);
  return mark;
}

/**
 * @typedef {object} SearchTarget
 * @property {(query: string) => SearchResult} run
 * @property {(index: number) => void} go
 * @property {() => void} clear
 */

/**
 * Combines several text searches into one target (e.g. the two panes of a split view).
 * Matches are numbered pane after pane.
 *
 * @param {TextSearch[]} searches
 * @param {(mark: HTMLElement) => void} reveal - Brings the current match into view.
 * @returns {SearchTarget}
 */
export function combineSearches(searches, reveal) {
  /** @type {number[]} */
  let totals = [];
  return {
    run(query) {
      let capped = false;
      totals = searches.map((search) => {
        const result = search.run(query);
        capped ||= result.capped;
        return result.total;
      });
      return { total: totals.reduce((a, b) => a + b, 0), capped };
    },
    go(index) {
      let offset = index;
      for (let i = 0; i < searches.length; i += 1) {
        if (offset < totals[i]) {
          for (const other of searches) if (other !== searches[i]) other.unsetCurrent();
          const mark = searches[i].go(offset);
          if (mark) reveal(mark);
          return;
        }
        offset -= totals[i];
      }
    },
    clear() {
      for (const search of searches) search.clear();
    },
  };
}
