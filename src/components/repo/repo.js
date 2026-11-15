// @ts-check
/**
 * A repository, read from the GitHub API (`/repos/{owner}/{repo}`, with its `/languages`
 * and `/releases/latest` alongside), the GitLab API (`/projects/:id`), or your own JSON.
 *
 * @module components/repo/repo
 */
import { isObject, safeImage, safeLink, text, toNumber, toTime } from '../../core/data.js';

/**
 * @typedef {object} Language
 * @property {string} name
 * @property {number} share - From 0 to 1.
 * @property {string} color - A hex color, from GitHub Linguist.
 */

/**
 * @typedef {object} Repo
 * @property {'github' | 'gitlab' | 'other'} host
 * @property {string} owner
 * @property {string} name
 * @property {string | null} url
 * @property {string} description
 * @property {string | null} homepage
 * @property {string | null} avatar
 * @property {number | null} stars
 * @property {number | null} forks
 * @property {number | null} issues - Open issues (on GitHub, pull requests included).
 * @property {number | null} watchers
 * @property {Language[]} languages
 * @property {{ id: string, name: string, url: string | null } | null} license
 * @property {string[]} topics
 * @property {number | null} created
 * @property {number | null} pushed - Last push or activity.
 * @property {boolean} archived
 * @property {boolean} fork
 * @property {boolean} template
 * @property {string} branch
 * @property {string | null} clone - HTTPS clone address.
 * @property {{ tag: string, name: string, date: number | null, url: string | null } | null} release
 */

export class RepoError extends Error {}

/** Colors of GitHub Linguist for common languages. */
export const LANGUAGE_COLORS = /** @type {Record<string, string>} */ ({
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219', Go: '#00ADD8',
  Rust: '#dea584', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600', PHP: '#4F5D95', Ruby: '#701516',
  Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB', Scala: '#c22d40', Shell: '#89e051',
  PowerShell: '#012456', HTML: '#e34c26', CSS: '#663399', SCSS: '#c6538c', Vue: '#41b883',
  Svelte: '#ff3e00', Astro: '#ff5a03', Lua: '#000080', Perl: '#0298c3', R: '#198CE7',
  'Jupyter Notebook': '#DA5B0B', Haskell: '#5e5086', Elixir: '#6e4a7e', Erlang: '#B83998',
  Clojure: '#db5855', 'Objective-C': '#438eff', Zig: '#ec915c', Nix: '#7e7eff', Dockerfile: '#384d54',
  Makefile: '#427819', CMake: '#DA3434', HCL: '#844FBA', MDX: '#fcb32c', Julia: '#a270ba',
  OCaml: '#ef7a08', 'F#': '#b845fc', Solidity: '#AA6746', Elm: '#60B5CC', Groovy: '#4298b8',
  Assembly: '#6E4C13', WebAssembly: '#04133b', TeX: '#3D6117', Markdown: '#083fa1',
}); // prettier-ignore

/** Languages listed by name before the rest are counted as "Other". */
const MAX_LANGUAGES = 6;

/**
 * @param {unknown} value
 * @returns {number | null} A count, or `null`.
 */
function count(value) {
  const n = toNumber(value);
  return n !== null && n >= 0 ? Math.round(n) : null;
}

/**
 * @param {unknown} value - `{ JavaScript: 12000, CSS: 300 }`, or `[{ name, share | bytes | percent }]`.
 * @returns {Language[]}
 */
export function readLanguages(value) {
  /** @type {[string, number][]} */
  let pairs = [];
  if (isObject(value)) pairs = Object.entries(value).map(([k, v]) => [text(k, 60), toNumber(v) ?? 0]);
  else if (Array.isArray(value))
    pairs = value.filter(isObject).map((l) => [text(l.name, 60), toNumber(l.bytes ?? l.share ?? l.percent ?? l.percentage) ?? 0]); // prettier-ignore
  pairs = pairs.filter(([name, n]) => name && n > 0).sort((a, b) => b[1] - a[1]);
  const total = pairs.reduce((sum, [, n]) => sum + n, 0);
  if (!total) return [];
  const main = pairs.slice(0, MAX_LANGUAGES).map(([name, n]) => ({ name, share: n / total, color: LANGUAGE_COLORS[name] ?? '#8b949e' })); // prettier-ignore
  const rest = pairs.slice(MAX_LANGUAGES).reduce((sum, [, n]) => sum + n, 0);
  if (rest) main.push({ name: 'Other', share: rest / total, color: '#8b949e' });
  return main;
}

/**
 * @param {unknown} value
 * @returns {Repo['release']}
 */
function readRelease(value) {
  if (!isObject(value)) return null;
  const tag = text(value.tag_name ?? value.tag ?? value.version, 100);
  if (!tag) return null;
  return { tag, name: text(value.name, 200), date: toTime(value.published_at ?? value.released_at ?? value.date), url: safeLink(value.html_url ?? value.url ?? value._links?.self) }; // prettier-ignore
}

/**
 * @param {unknown} value
 * @returns {Repo}
 */
export function readRepo(value) {
  if (!isObject(value)) throw new RepoError('shape');
  const repo = isObject(value.repo) ? value.repo : isObject(value.repository) ? value.repository : value; // prettier-ignore
  const gitlab = 'path_with_namespace' in repo || 'star_count' in repo;
  const github = !gitlab && ('full_name' in repo || 'stargazers_count' in repo);
  const full = text(repo.full_name ?? repo.path_with_namespace ?? repo.fullName, 300);
  const [ownerFromFull, ...rest] = full.split('/');
  const owner = text(repo.owner?.login ?? repo.namespace?.full_path ?? repo.owner, 200) || (rest.length ? ownerFromFull : ''); // prettier-ignore
  const name = text(repo.name ?? repo.path, 200) || rest.at(-1) || full;
  if (!name) throw new RepoError('shape');
  const license = isObject(repo.license)
    ? { id: text(repo.license.spdx_id ?? repo.license.id, 60).replace(/^NOASSERTION$/, ''), name: text(repo.license.name, 200), url: safeLink(repo.license.html_url ?? repo.license.url) } // prettier-ignore
    : typeof repo.license === 'string' && repo.license.trim()
      ? { id: text(repo.license, 60), name: text(repo.license, 60), url: null }
      : null;
  const topics = (Array.isArray(repo.topics) ? repo.topics : Array.isArray(repo.tag_list) ? repo.tag_list : []).map((t) => text(t, 50)).filter(Boolean).slice(0, 20); // prettier-ignore
  const url = safeLink(repo.html_url ?? repo.web_url ?? repo.url);
  const clone = safeLink(repo.clone_url ?? repo.http_url_to_repo ?? repo.clone ?? (url && (github || gitlab) ? `${url}.git` : null)); // prettier-ignore
  return {
    host: github ? 'github' : gitlab ? 'gitlab' : url && /github\.com/.test(url) ? 'github' : url && /gitlab/.test(url) ? 'gitlab' : 'other', // prettier-ignore
    owner,
    name,
    url,
    description: text(repo.description, 1000),
    homepage: safeLink(repo.homepage ?? repo.website),
    avatar: safeImage(repo.owner?.avatar_url ?? repo.avatar_url ?? repo.namespace?.avatar_url ?? repo.avatar), // prettier-ignore
    stars: count(repo.stargazers_count ?? repo.star_count ?? repo.stars),
    forks: count(repo.forks_count ?? repo.forks),
    issues: count(repo.open_issues_count ?? repo.open_issues ?? repo.issues),
    watchers: count(repo.subscribers_count ?? repo.watchers),
    languages: readLanguages(value.languages ?? repo.languages ?? (typeof repo.language === 'string' ? { [repo.language]: 1 } : null)), // prettier-ignore
    license: license && (license.id || license.name) ? license : null,
    topics,
    created: toTime(repo.created_at ?? repo.created),
    pushed: toTime(repo.pushed_at ?? repo.last_activity_at ?? repo.updated_at ?? repo.updated),
    archived: repo.archived === true,
    fork: repo.fork === true || isObject(repo.forked_from_project),
    template: repo.is_template === true,
    branch: text(repo.default_branch, 100),
    clone: clone && /^https:\/\//.test(clone) ? clone : null,
    release: readRelease(value.release ?? value.latest_release ?? repo.release),
  };
}

/**
 * @param {number} n
 * @param {string} locale
 * @returns {string} 12.3k, 1.2M.
 */
export function compact(n, locale) {
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
      n,
    );
  } catch {
    return String(n);
  }
}
