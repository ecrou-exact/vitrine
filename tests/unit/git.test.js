// @ts-check
import { describe, expect, it } from 'vitest';
import {
  findCommit,
  layoutGraph,
  parseRefs,
  parseTime,
  reachable,
  readCommits,
} from '../../src/components/git/history.js';

/** @param {string} hash @param {string[]} parents */
const c = (hash, parents = []) => ({
  hash,
  parents,
  author: '',
  date: '',
  time: null,
  subject: hash,
  body: '',
  refs: [],
});

describe('layoutGraph', () => {
  it('keeps a linear history on one lane', () => {
    const { rows, width } = layoutGraph([c('c', ['b']), c('b', ['a']), c('a')]);
    expect(width).toBe(1);
    expect(rows.map((r) => r.col)).toEqual([0, 0, 0]);
    expect(rows[0].into).toEqual([]);
    expect(rows[1].into).toEqual([0]);
    expect(rows[2].out).toEqual([]);
  });

  it('opens a lane for the second parent of a merge and closes it at the fork', () => {
    // m merges f into main; f and b both come from a.
    const { rows, width } = layoutGraph([c('m', ['b', 'f']), c('f', ['a']), c('b', ['a']), c('a')]);
    expect(width).toBe(2);
    expect(rows[0]).toMatchObject({ col: 0, out: [0, 1] });
    expect(rows[1]).toMatchObject({ col: 1, passes: [0], out: [1] });
    expect(rows[2]).toMatchObject({ col: 0, passes: [1] });
    // Both lanes end on a: the branch point.
    expect(rows[3]).toMatchObject({ col: 0, into: [0, 1] });
  });

  it('gives a separate lane to each branch tip', () => {
    const { rows } = layoutGraph([c('x', ['a']), c('y', ['a']), c('a')]);
    expect(rows[0].col).toBe(0);
    expect(rows[1].col).toBe(1);
    expect(rows[1].into).toEqual([]);
    expect(rows[2].into).toEqual([0, 1]);
  });

  it('reuses a freed lane', () => {
    const { rows, width } = layoutGraph([
      c('m2', ['m1', 'g']),
      c('g', ['m1']),
      c('m1', ['b', 'f']),
      c('f', ['a']),
      c('b', ['a']),
      c('a'),
    ]);
    expect(width).toBe(2);
    expect(rows[3].col).toBe(1);
  });

  it('ignores parents outside the history', () => {
    const { rows } = layoutGraph([c('b', ['a']), c('a', ['missing'])]);
    expect(rows[1].out).toEqual([]);
  });

  it('keeps colors per lane', () => {
    const { rows } = layoutGraph([c('m', ['b', 'f']), c('f', ['a']), c('b', ['a']), c('a')]);
    expect(rows[0].bottom[0]).not.toBe(rows[0].bottom[1]);
    expect(rows[1].top[1]).toBe(rows[0].bottom[1]);
  });
});

describe('readCommits', () => {
  it('reads the pretty format with parents and refs', () => {
    const commits = readCommits(
      [
        'cc33|cc22 ff11|Ada|2026-10-07T18:00:00Z|HEAD -> main, origin/main, tag: v2|Merge | feature',
        'ff11|cc11|Bob|2026-10-06T10:00:00Z|feature|Add feature',
        'cc22|cc11|Ada|2026-10-05T10:00:00Z||Fix',
        'cc11||Ada|1759000000|origin/HEAD|Init',
      ].join('\n'),
    );
    expect(commits.map((x) => x.hash)).toEqual(['cc33', 'ff11', 'cc22', 'cc11']);
    expect(commits[0].parents).toEqual(['cc22', 'ff11']);
    expect(commits[0].subject).toBe('Merge | feature');
    expect(commits[0].refs).toEqual([
      { name: 'main', type: 'branch', head: true },
      { name: 'origin/main', type: 'remote', head: false },
      { name: 'v2', type: 'tag', head: false },
    ]);
    expect(commits[3].refs).toEqual([]);
    expect(commits[3].time).toBe(1759000000000);
  });

  it('follows parents along a --graph drawing', () => {
    const commits = readCommits(
      [
        '*   d4e5f6a (HEAD -> main) Merge branch feature',
        '|\\',
        '| * b2cc33d4e (feature) Add feature',
        '* | a1b2cc33d Fix typo',
        '|/',
        '* 9f8e7d6 (tag: v1.0) Initial commit',
      ].join('\n'),
    );
    const by = Object.fromEntries(commits.map((x) => [x.hash, x.parents]));
    // The parent straight below comes first, the merged branch second.
    expect(by.d4e5f6a).toEqual(['a1b2cc33d', 'b2cc33d4e']);
    expect(by.b2cc33d4e).toEqual(['9f8e7d6']);
    expect(by.a1b2cc33d).toEqual(['9f8e7d6']);
    expect(commits[0].refs[0]).toEqual({ name: 'main', type: 'branch', head: true });
  });

  it('chains --oneline output without a drawing', () => {
    const commits = readCommits('aaaa111 Third\nbbbb222 Second\nccccc3333 First');
    expect(commits.map((x) => x.parents)).toEqual([['bbbb222'], ['ccccc3333'], []]);
  });

  it('reads JSON', () => {
    const commits = readCommits(
      JSON.stringify([
        {
          hash: 'b',
          parents: ['a'],
          author: 'Ada',
          date: '2026-10-07',
          subject: 'Two',
          refs: ['main'],
        },
        { sha: 'a', parents: [], author: { name: 'Bob' }, message: 'One\n\nBody text' },
      ]),
    );
    expect(commits[0].refs).toEqual([{ name: 'main', type: 'branch', head: false }]);
    expect(commits[1]).toMatchObject({
      hash: 'a',
      author: 'Bob',
      subject: 'One',
      body: 'Body text',
    });
  });

  it('rejects text without commits', () => {
    expect(() => readCommits('hello world')).toThrow();
    expect(() => readCommits('{"nope": 1}')).toThrow();
  });
});

describe('helpers', () => {
  it('parses refs with a detached HEAD and other remotes', () => {
    expect(parseRefs('HEAD, fork/HEAD, fork/fix, feature/login')).toEqual([
      { name: 'HEAD', type: 'head', head: true },
      { name: 'fork/fix', type: 'remote', head: false },
      { name: 'feature/login', type: 'branch', head: false },
    ]);
  });

  it('parses git default dates', () => {
    expect(parseTime('Tue Oct 7 18:00:00 2026 +0200')).toBe(Date.parse('2026-10-07T16:00:00Z'));
    expect(parseTime('nope')).toBeNull();
  });

  it('finds reachable commits and hash prefixes', () => {
    const commits = [c('m', ['b', 'f']), c('f', ['a']), c('b', ['a']), c('a')];
    expect([...reachable(commits, 'f')].sort()).toEqual(['a', 'f']);
    const long = [c('abcdeff11234')];
    expect(findCommit(long, 'abcd')?.hash).toBe('abcdeff11234');
    expect(findCommit(long, 'abc')).toBeUndefined();
  });
});
