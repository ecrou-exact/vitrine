// @ts-check
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  commitUrl,
  layoutGraph,
  readCommits,
  topoOrder,
} from '../../src/components/git/history.js';

const fixture = (/** @type {string} */ name) =>
  readFileSync(join(import.meta.dirname, 'fixtures', 'git', name), 'utf8');

/** The real history of the fixtures: a branch merged into main, then one more commit. */
const HASHES = {
  after: 'd9f7810e7d903e9dcf16ef44b09ddbe669757a62',
  merge: '344980da3f4c6ba0988476b301eae6e063431b68',
  feature: 'b8a88b79dad4d78715fca02aa4e4191d520a4543',
  fix: 'ed52ca3b7f53ff617f2557d732cba27ed5206481',
  initial: '84f5fbf359c21caefeb297aa77bdbe4000c2a41d',
};

/** @param {import('../../src/components/git/history.js').Commit[]} commits */
const shape = (commits) =>
  Object.fromEntries(
    commits.map((commit) => [commit.subject, commit.parents.map((p) => p.slice(0, 7))]),
  );

const EXPECTED = {
  'After the merge': ['344980d'],
  "Merge branch 'feature'": ['ed52ca3', 'b8a88b7'],
  'Add feature': ['84f5fbf'],
  'Fix on main': ['84f5fbf'],
  'Initial commit': [],
};

describe('git log in its default format', () => {
  it('reads git log --graph, with authors, dates, bodies and refs', () => {
    const commits = readCommits(fixture('log-graph.txt'));
    expect(shape(commits)).toEqual(EXPECTED);
    const feature = commits.find((commit) => commit.hash === HASHES.feature);
    expect(feature).toMatchObject({ author: 'Ada', body: 'With a body line.' });
    expect(feature?.time).toBe(Date.parse('2026-11-07T09:08:00Z'));
    expect(feature?.refs).toEqual([{ name: 'feature', type: 'branch', head: false }]);
    expect(commits[0].refs[0]).toMatchObject({ name: 'main', head: true });
    expect(layoutGraph(commits).width).toBe(2);
  });

  it('reads git log --parents', () => {
    expect(shape(readCommits(fixture('log-parents.txt')))).toEqual(EXPECTED);
  });

  it('reads plain git log, with merge parents from the Merge line', () => {
    const commits = readCommits(fixture('log-default.txt'));
    expect(commits).toHaveLength(5);
    const merge = commits.find((commit) => commit.hash === HASHES.merge);
    expect(merge?.parents).toEqual([HASHES.fix, HASHES.feature]);
    expect(merge?.subject).toBe("Merge branch 'feature'");
  });

  it('keeps messages that look like headers or hashes', () => {
    const commits = readCommits(
      'commit aaaaaaa\nAuthor: A <a@b.c>\n\n    Author: not a header\n    commit bbbbbbb inside\n',
    );
    expect(commits).toHaveLength(1);
    expect(commits[0].subject).toBe('Author: not a header');
    expect(commits[0].body).toBe('commit bbbbbbb inside');
  });
});

describe('JSON from hosting services', () => {
  it('reads the GitHub REST API (newest first)', () => {
    const json = JSON.stringify([
      {
        sha: 'b'.repeat(40),
        html_url: 'https://github.com/o/r/commit/bbbb',
        commit: {
          author: { name: 'Ada Lovelace', email: 'ada@example.com', date: '2026-11-02T10:00:00Z' },
          message: 'Second\n\nDetails here.',
        },
        author: { login: 'ada', avatar_url: 'https://avatars.example.com/1' },
        parents: [{ sha: 'a'.repeat(40), url: 'https://api.github.com/x' }],
      },
      {
        sha: 'a'.repeat(40),
        commit: {
          author: { name: 'Ada Lovelace', date: '2026-11-01T10:00:00Z' },
          message: 'First',
        },
        author: null,
        parents: [],
      },
    ]);
    const [second, first] = readCommits(json);
    expect(second).toMatchObject({
      author: 'Ada Lovelace',
      subject: 'Second',
      body: 'Details here.',
      parents: ['a'.repeat(40)],
      url: 'https://github.com/o/r/commit/bbbb',
      time: Date.parse('2026-11-02T10:00:00Z'),
    });
    expect(first.subject).toBe('First');
  });

  it('reads a GitHub GraphQL answer', () => {
    const json = JSON.stringify({
      data: {
        repository: {
          ref: {
            target: {
              history: {
                nodes: [
                  {
                    oid: 'c'.repeat(40),
                    messageHeadline: 'Merge',
                    messageBody: '',
                    committedDate: '2026-11-03T10:00:00Z',
                    author: { name: 'Grace', user: { login: 'grace' } },
                    parents: { nodes: [{ oid: 'a'.repeat(40) }, { oid: 'b'.repeat(40) }] },
                    url: 'https://github.com/o/r/commit/cccc',
                  },
                  {
                    oid: 'b'.repeat(40),
                    messageHeadline: 'Side',
                    parents: { nodes: [{ oid: 'a'.repeat(40) }] },
                  },
                  { oid: 'a'.repeat(40), messageHeadline: 'Root', parents: { nodes: [] } },
                ],
              },
            },
          },
        },
      },
    });
    const commits = readCommits(json);
    expect(commits.map((commit) => commit.subject)).toEqual(['Merge', 'Side', 'Root']);
    expect(commits[0]).toMatchObject({
      author: 'Grace',
      parents: ['a'.repeat(40), 'b'.repeat(40)],
    });
  });

  it('reads GitLab and Bitbucket commits', () => {
    const gitlab = readCommits(
      JSON.stringify([
        { id: 'd'.repeat(40), title: 'Fix', message: 'Fix\n\nMore', author_name: 'Linus', committed_date: '2026-11-04T10:00:00Z', parent_ids: ['a'.repeat(40)], web_url: 'https://gitlab.com/o/r/-/commit/dddd' }, // prettier-ignore
      ]),
    );
    expect(gitlab[0]).toMatchObject({ author: 'Linus', subject: 'Fix', body: 'More', url: 'https://gitlab.com/o/r/-/commit/dddd' }); // prettier-ignore
    const bitbucket = readCommits(
      JSON.stringify({
        values: [
          { hash: 'e'.repeat(40), message: 'Start', date: '2026-11-05T10:00:00Z', author: { raw: 'Margaret <m@example.com>' }, parents: [], links: { html: { href: 'https://bitbucket.org/o/r/commits/eeee' } } }, // prettier-ignore
        ],
      }),
    );
    expect(bitbucket[0]).toMatchObject({ author: 'Margaret', subject: 'Start', url: 'https://bitbucket.org/o/r/commits/eeee' }); // prettier-ignore
  });

  it('puts branches and tags given beside the commits on them', () => {
    const commits = readCommits(
      JSON.stringify({
        head: 'main',
        commits: [
          { sha: 'b'.repeat(40), message: 'Two', parents: [{ sha: 'a'.repeat(40) }] },
          { sha: 'a'.repeat(40), message: 'One', parents: [] },
        ],
        branches: [
          { name: 'main', commit: { sha: 'b'.repeat(40) } },
          { name: 'old', sha: 'a'.repeat(7) },
        ],
        tags: { 'v1.0': 'a'.repeat(40) },
      }),
    );
    expect(commits[0].refs).toEqual([{ name: 'main', type: 'branch', head: true }]);
    expect(commits[1].refs.map((ref) => ref.name)).toEqual(['old', 'v1.0']);
  });

  it('keeps unsafe links out', () => {
    const [commit] = readCommits(
      JSON.stringify([{ sha: 'a'.repeat(40), message: 'x', html_url: 'javascript:alert(1)' }]),
    );
    expect(commit.url).toBeNull();
    expect(commitUrl(commit, 'javascript:alert({hash})')).toBeNull();
    expect(commitUrl(commit, 'https://github.com/o/r/commit/{hash}')).toBe(
      `https://github.com/o/r/commit/${'a'.repeat(40)}`,
    );
    expect(commitUrl(commit, 'https://example.com/no-placeholder')).toBeNull();
  });

  it('never shows an object as an author', () => {
    const [commit] = readCommits(
      JSON.stringify([{ sha: 'a'.repeat(40), message: 'x', author: { login: 'ada' } }]),
    );
    expect(commit.author).toBe('ada');
  });
});

describe('order', () => {
  /** @param {string} hash @param {string[]} parents @param {number} time */
  const c = (hash, parents, time) => ({
    hash, parents, author: '', date: '', time, subject: hash, body: '', refs: [], url: null,
  }); // prettier-ignore

  it('puts commits listed oldest first in git log order', () => {
    const json = JSON.stringify([
      { sha: 'aaaa', message: 'one', date: '2026-11-01', parents: [] },
      { sha: 'bbbb', message: 'two', date: '2026-11-02', parents: ['aaaa'] },
      { sha: 'cccc', message: 'side', date: '2026-11-03', parents: ['aaaa'] },
      { sha: 'dddd', message: 'merge', date: '2026-11-04', parents: ['bbbb', 'cccc'] },
    ]);
    expect(readCommits(json).map((commit) => commit.subject)).toEqual([
      'merge',
      'side',
      'two',
      'one',
    ]);
  });

  it('leaves commits already in order as they are, and survives cycles', () => {
    const list = [c('c', ['b'], 1), c('b', ['a'], 3), c('a', [], 2)];
    expect(topoOrder(list)).toBe(list);
    expect(topoOrder([c('a', ['b'], 1), c('b', ['a'], 2)])).toHaveLength(2);
  });

  it('orders 20,000 commits quickly', () => {
    const list = Array.from({ length: 20000 }, (_, i) => c(`h${i}`, i ? [`h${i - 1}`] : [], i));
    const started = performance.now();
    const ordered = topoOrder(list);
    expect(ordered[0].hash).toBe('h19999');
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
