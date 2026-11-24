// @ts-check
/**
 * Vitrine — framework-free web components to display code, Markdown and JSON.
 *
 * This module holds the public API shared by the ES module and the classic script builds.
 *
 * @module vitrine
 * @since 0.1.0
 */
import { VtChart } from './components/chart/vt-chart.js';
import { VtCode } from './components/code/vt-code.js';
import { VtCsv } from './components/csv/vt-csv.js';
import { VtDiff } from './components/diff/vt-diff.js';
import { VtEnv } from './components/env/vt-env.js';
import { VtTags } from './components/tags/vt-tags.js';
import { VtHttp } from './components/http/vt-http.js';
import { VtJson } from './components/json/vt-json.js';
import { VtLog } from './components/log/vt-log.js';
import { VtMarkdown } from './components/markdown/vt-markdown.js';
import { VtOpenapi } from './components/openapi/vt-openapi.js';
import { VtFlowtime } from './components/flowtime/vt-flowtime.js';
import { VtTimeline } from './components/timeline/vt-timeline.js';
import { VtGit } from './components/git/vt-git.js';
import { VtJob } from './components/job/vt-job.js';
import { VtHex } from './components/hex/vt-hex.js';
import { VtRegex } from './components/regex/vt-regex.js';
import { VtToml } from './components/toml/vt-toml.js';
import { VtJwt } from './components/jwt/vt-jwt.js';
import { VtXml } from './components/xml/vt-xml.js';
import { VtCert } from './components/cert/vt-cert.js';
import { VtTable } from './components/table/vt-table.js';
import { VtYaml } from './components/yaml/vt-yaml.js';
import { VtCron } from './components/cron/vt-cron.js';
import { VtStatus } from './components/status/vt-status.js';
import { VtCalendar } from './components/calendar/vt-calendar.js';
import { VtPricing } from './components/pricing/vt-pricing.js';
import { VtFaq } from './components/faq/vt-faq.js';
import { VtGallery } from './components/gallery/vt-gallery.js';
import { VtStats } from './components/stats/vt-stats.js';
import { VtField } from './components/field/vt-field.js';
import { VtBoard } from './components/board/vt-board.js';
import { VtSearch } from './components/search/vt-search.js';
import { VtDatePicker } from './components/date-picker/vt-date-picker.js';
import { VtMenu } from './components/menu/vt-menu.js';
import { VtUpload } from './components/upload/vt-upload.js';
import { VtTestimonials } from './components/testimonials/vt-testimonials.js';
import { VtCountdown } from './components/countdown/vt-countdown.js';
import { VtTerminal } from './components/terminal/vt-terminal.js';
import { VtTree } from './components/tree/vt-tree.js';
import { VtCompare } from './components/compare/vt-compare.js';
import { VtInstall } from './components/install/vt-install.js';
import { VtDownload } from './components/download/vt-download.js';
import { VtContributors } from './components/contributors/vt-contributors.js';
import { VtLifecycle } from './components/lifecycle/vt-lifecycle.js';
import { VtAdvisories } from './components/advisories/vt-advisories.js';
import { VtLicenses } from './components/licenses/vt-licenses.js';
import { VtIconPicker, registerIconSet } from './components/icon-picker/vt-icon-picker.js';
import { VtWorkflow } from './components/workflow/vt-workflow.js';
import { VtAccessLog } from './components/access-log/vt-access-log.js';
import { VtPassword } from './components/password/vt-password.js';
import { VtSecret } from './components/secret/vt-secret.js';
import { VtVersion } from './components/version/vt-version.js';
import { VtConsent } from './components/consent/vt-consent.js';
import { VtChangelog } from './components/changelog/vt-changelog.js';
import { VtRepo } from './components/repo/vt-repo.js';
import { VtIoc } from './components/ioc/vt-ioc.js';
import { VtCvss } from './components/cvss/vt-cvss.js';
import { VtHeaders } from './components/headers/vt-headers.js';
import { VtEmail } from './components/email/vt-email.js';
import { VtDns } from './components/dns/vt-dns.js';
import { VtNmap } from './components/nmap/vt-nmap.js';
import { VtUrl } from './components/url/vt-url.js';
import { VtHash } from './components/hash/vt-hash.js';
import { VtWaterfall } from './components/waterfall/vt-waterfall.js';
import { VtYara } from './components/yara/vt-yara.js';
import { VtSigma } from './components/sigma/vt-sigma.js';
import { VtPcap } from './components/pcap/vt-pcap.js';
import { VtSemver } from './components/semver/vt-semver.js';
import { VtContrast } from './components/contrast/vt-contrast.js';
import { VtSbom } from './components/sbom/vt-sbom.js';
import { VtDockerfile } from './components/dockerfile/vt-dockerfile.js';
import { VtLighthouse } from './components/lighthouse/vt-lighthouse.js';
import { VtA11y } from './components/a11y/vt-a11y.js';
import { VtCookies } from './components/cookies/vt-cookies.js';
import { VtRedirects } from './components/redirects/vt-redirects.js';
import { VtMap } from './components/map/vt-map.js';
import { VtLoadingButton } from './components/loading-button/vt-loading-button.js';
import { VtLoadingMessage } from './components/loading-message/vt-loading-message.js';
import { VtLoadingOverlay } from './components/loading-overlay/vt-loading-overlay.js';
import { VtLoadingSteps } from './components/loading-steps/vt-loading-steps.js';
import { VtPageProgress } from './components/page-progress/vt-page-progress.js';
import { VtProgress } from './components/progress/vt-progress.js';
import { VtProgressRing } from './components/progress-ring/vt-progress-ring.js';
import { VtSkeleton } from './components/skeleton/vt-skeleton.js';
import { VtSpinner } from './components/spinner/vt-spinner.js';
import { VtTyping } from './components/typing/vt-typing.js';
import { VtDescribe } from './components/describe/vt-describe.js';
import { VtTreemap } from './components/treemap/vt-treemap.js';
import { VtFlame } from './components/flame/vt-flame.js';
import { VtHeatmap } from './components/heatmap/vt-heatmap.js';
import { VtPivot } from './components/pivot/vt-pivot.js';
import { VtDiagram } from './components/diagram/vt-diagram.js';
import { VtMath } from './components/math/vt-math.js';
import { VtNotebook } from './components/notebook/vt-notebook.js';
import { VtTrace } from './components/trace/vt-trace.js';
import { VtTestReport } from './components/test-report/vt-test-report.js';
import { VtSql } from './components/sql/vt-sql.js';
import { configure, getConfig } from './core/config.js';
import { EVENTS } from './core/events.js';
import { registerLocale } from './core/i18n.js';
import { listSyntaxThemes } from './core/syntax-themes.js';
import { BUILT_IN_THEMES, getTheme, listThemes, registerTheme } from './core/themes.js';

export {
  VtCode,
  VtCsv,
  VtDiff,
  VtTags,
  VtMarkdown,
  VtJson,
  VtTerminal,
  VtTree,
  VtHttp,
  VtLog,
  VtEnv,
  VtChart,
  VtOpenapi,
  VtTimeline,
  VtFlowtime,
  VtGit,
  VtJob,
  VtHex,
  VtRegex,
  VtToml,
  VtJwt,
  VtXml,
  VtCert,
  VtTable,
  VtYaml,
  VtCron,
  VtStatus,
  VtCalendar,
  VtPricing,
  VtFaq,
  VtGallery,
  VtStats,
  VtField,
  VtBoard,
  VtSearch,
  VtDatePicker,
  VtMenu,
  VtUpload,
  VtTestimonials,
  VtCountdown,
  VtSql,
  VtTestReport,
  VtTrace,
  VtNotebook,
  VtMath,
  VtDiagram,
  VtPivot,
  VtHeatmap,
  VtFlame,
  VtTreemap,
  VtDescribe,
  VtCompare,
  VtInstall,
  VtDownload,
  VtContributors,
  VtLifecycle,
  VtAdvisories,
  VtLicenses,
  VtIconPicker,
  VtWorkflow,
  VtAccessLog,
  VtPassword,
  VtSecret,
  VtVersion,
  VtConsent,
  VtChangelog,
  VtRepo,
  VtIoc,
  VtCvss,
  VtHeaders,
  VtEmail,
  VtDns,
  VtNmap,
  VtUrl,
  VtHash,
  VtWaterfall,
  VtYara,
  VtSigma,
  VtPcap,
  VtSemver,
  VtContrast,
  VtSbom,
  VtDockerfile,
  VtLighthouse,
  VtA11y,
  VtCookies,
  VtRedirects,
  VtMap,
  VtLoadingButton,
  VtLoadingMessage,
  VtLoadingOverlay,
  VtLoadingSteps,
  VtPageProgress,
  VtProgress,
  VtProgressRing,
  VtSkeleton,
  VtSpinner,
  VtTyping,
  registerIconSet,
  configure,
  getConfig,
  EVENTS,
  registerLocale,
  registerTheme,
  getTheme,
  listThemes,
  BUILT_IN_THEMES,
  listSyntaxThemes,
};

export { Flowtime } from './components/flowtime/engine/flowtime.js';

/* global __VITRINE_VERSION__ */

/**
 * Library version, injected at build time.
 * @type {string}
 */
export const version =
  // @ts-ignore -- replaced by esbuild `define`
  typeof __VITRINE_VERSION__ !== 'undefined' ? __VITRINE_VERSION__ : '0.0.0-dev';

/**
 * Element tag names and their classes.
 *
 * @type {ReadonlyMap<string, CustomElementConstructor>}
 */
export const registry = new Map(
  /** @type {[string, CustomElementConstructor][]} */ ([
    ['vt-code', VtCode],
    ['vt-markdown', VtMarkdown],
    ['vt-json', VtJson],
    ['vt-csv', VtCsv],
    ['vt-tags', VtTags],
    ['vt-diff', VtDiff],
    ['vt-terminal', VtTerminal],
    ['vt-tree', VtTree],
    ['vt-http', VtHttp],
    ['vt-log', VtLog],
    ['vt-env', VtEnv],
    ['vt-chart', VtChart],
    ['vt-openapi', VtOpenapi],
    ['vt-timeline', VtTimeline],
    ['vt-flowtime', VtFlowtime],
    ['vt-git', VtGit],
    ['vt-job', VtJob],
    ['vt-hex', VtHex],
    ['vt-regex', VtRegex],
    ['vt-toml', VtToml],
    ['vt-jwt', VtJwt],
    ['vt-xml', VtXml],
    ['vt-cert', VtCert],
    ['vt-table', VtTable],
    ['vt-yaml', VtYaml],
    ['vt-cron', VtCron],
    ['vt-status', VtStatus],
    ['vt-calendar', VtCalendar],
    ['vt-pricing', VtPricing],
    ['vt-faq', VtFaq],
    ['vt-gallery', VtGallery],
    ['vt-stats', VtStats],
    ['vt-field', VtField],
    ['vt-board', VtBoard],
    ['vt-search', VtSearch],
    ['vt-date-picker', VtDatePicker],
    ['vt-menu', VtMenu],
    ['vt-upload', VtUpload],
    ['vt-testimonials', VtTestimonials],
    ['vt-countdown', VtCountdown],
    ['vt-sql', VtSql],
    ['vt-test-report', VtTestReport],
    ['vt-trace', VtTrace],
    ['vt-notebook', VtNotebook],
    ['vt-math', VtMath],
    ['vt-diagram', VtDiagram],
    ['vt-pivot', VtPivot],
    ['vt-heatmap', VtHeatmap],
    ['vt-flame', VtFlame],
    ['vt-treemap', VtTreemap],
    ['vt-describe', VtDescribe],
    ['vt-compare', VtCompare],
    ['vt-install', VtInstall],
    ['vt-download', VtDownload],
    ['vt-contributors', VtContributors],
    ['vt-lifecycle', VtLifecycle],
    ['vt-advisories', VtAdvisories],
    ['vt-licenses', VtLicenses],
    ['vt-icon-picker', VtIconPicker],
    ['vt-workflow', VtWorkflow],
    ['vt-access-log', VtAccessLog],
    ['vt-password', VtPassword],
    ['vt-secret', VtSecret],
    ['vt-version', VtVersion],
    ['vt-consent', VtConsent],
    ['vt-changelog', VtChangelog],
    ['vt-repo', VtRepo],
    ['vt-ioc', VtIoc],
    ['vt-cvss', VtCvss],
    ['vt-headers', VtHeaders],
    ['vt-email', VtEmail],
    ['vt-dns', VtDns],
    ['vt-nmap', VtNmap],
    ['vt-url', VtUrl],
    ['vt-hash', VtHash],
    ['vt-waterfall', VtWaterfall],
    ['vt-yara', VtYara],
    ['vt-sigma', VtSigma],
    ['vt-pcap', VtPcap],
    ['vt-semver', VtSemver],
    ['vt-contrast', VtContrast],
    ['vt-sbom', VtSbom],
    ['vt-dockerfile', VtDockerfile],
    ['vt-lighthouse', VtLighthouse],
    ['vt-a11y', VtA11y],
    ['vt-cookies', VtCookies],
    ['vt-redirects', VtRedirects],
    ['vt-map', VtMap],
    ['vt-loading-button', VtLoadingButton],
    ['vt-loading-message', VtLoadingMessage],
    ['vt-loading-overlay', VtLoadingOverlay],
    ['vt-loading-steps', VtLoadingSteps],
    ['vt-page-progress', VtPageProgress],
    ['vt-progress', VtProgress],
    ['vt-progress-ring', VtProgressRing],
    ['vt-skeleton', VtSkeleton],
    ['vt-spinner', VtSpinner],
    ['vt-typing', VtTyping],
  ]),
);

/** Maps `render()` types to tag names. */
const TYPES = /** @type {const} */ ({
  code: 'vt-code',
  markdown: 'vt-markdown',
  json: 'vt-json',
  csv: 'vt-csv',
  tags: 'vt-tags',
  diff: 'vt-diff',
  terminal: 'vt-terminal',
  tree: 'vt-tree',
  http: 'vt-http',
  log: 'vt-log',
  env: 'vt-env',
  chart: 'vt-chart',
  openapi: 'vt-openapi',
  timeline: 'vt-timeline',
  flowtime: 'vt-flowtime',
  git: 'vt-git',
  job: 'vt-job',
  hex: 'vt-hex',
  regex: 'vt-regex',
  toml: 'vt-toml',
  jwt: 'vt-jwt',
  xml: 'vt-xml',
  cert: 'vt-cert',
  table: 'vt-table',
  yaml: 'vt-yaml',
  cron: 'vt-cron',
  status: 'vt-status',
  calendar: 'vt-calendar',
  pricing: 'vt-pricing',
  faq: 'vt-faq',
  gallery: 'vt-gallery',
  stats: 'vt-stats',
  field: 'vt-field',
  board: 'vt-board',
  search: 'vt-search',
  'date-picker': 'vt-date-picker',
  menu: 'vt-menu',
  upload: 'vt-upload',
  testimonials: 'vt-testimonials',
  countdown: 'vt-countdown',
  sql: 'vt-sql',
  'test-report': 'vt-test-report',
  trace: 'vt-trace',
  notebook: 'vt-notebook',
  math: 'vt-math',
  diagram: 'vt-diagram',
  pivot: 'vt-pivot',
  heatmap: 'vt-heatmap',
  flame: 'vt-flame',
  treemap: 'vt-treemap',
  describe: 'vt-describe',
  compare: 'vt-compare',
  install: 'vt-install',
  download: 'vt-download',
  contributors: 'vt-contributors',
  lifecycle: 'vt-lifecycle',
  advisories: 'vt-advisories',
  licenses: 'vt-licenses',
  'icon-picker': 'vt-icon-picker',
  workflow: 'vt-workflow',
  'access-log': 'vt-access-log',
  password: 'vt-password',
  secret: 'vt-secret',
  version: 'vt-version',
  consent: 'vt-consent',
  changelog: 'vt-changelog',
  repo: 'vt-repo',
  ioc: 'vt-ioc',
  cvss: 'vt-cvss',
  headers: 'vt-headers',
  email: 'vt-email',
  dns: 'vt-dns',
  nmap: 'vt-nmap',
  url: 'vt-url',
  hash: 'vt-hash',
  waterfall: 'vt-waterfall',
  yara: 'vt-yara',
  sigma: 'vt-sigma',
  pcap: 'vt-pcap',
  semver: 'vt-semver',
  contrast: 'vt-contrast',
  sbom: 'vt-sbom',
  dockerfile: 'vt-dockerfile',
  lighthouse: 'vt-lighthouse',
  a11y: 'vt-a11y',
  cookies: 'vt-cookies',
  redirects: 'vt-redirects',
  map: 'vt-map',
  'loading-button': 'vt-loading-button',
  'loading-message': 'vt-loading-message',
  'loading-overlay': 'vt-loading-overlay',
  'loading-steps': 'vt-loading-steps',
  'page-progress': 'vt-page-progress',
  progress: 'vt-progress',
  'progress-ring': 'vt-progress-ring',
  skeleton: 'vt-skeleton',
  spinner: 'vt-spinner',
  typing: 'vt-typing',
});

/**
 * Defines every Vitrine custom element that is not already defined.
 * Safe to call several times, and safe when another copy of Vitrine already
 * defined the elements.
 *
 * @since 0.1.0
 * @returns {string[]} The tag names defined by this call.
 *
 * @example
 * import { defineAll } from './vitrine.esm.js';
 * defineAll();
 */
export function defineAll() {
  /** @type {string[]} */
  const defined = [];
  for (const [tag, ctor] of registry) {
    if (!customElements.get(tag)) {
      customElements.define(tag, ctor);
      defined.push(tag);
    }
  }
  return defined;
}

/**
 * @typedef {object} RenderOptions
 * @property {keyof typeof TYPES} type - Component type.
 * @property {string} [content] - Content to display (set as a property, never parsed as HTML).
 * @property {unknown} [data] - Content as a value (an object, a list…), like the `data` property.
 * @property {"simple"|"full"} [variant] - Feature preset.
 * @property {Record<string, string | number | boolean | null | undefined>} [options] -
 *   Attributes, in camelCase or kebab-case (`lineNumbers` or `line-numbers`).
 *   `true` sets an empty attribute, `false` sets `"false"`, `null`/`undefined` skip it.
 *   Event handler names (`onclick`…) are ignored.
 */

/**
 * Creates a Vitrine element, configures it and puts it in `target` (replacing its children).
 *
 * @since 0.1.0
 * @param {Element} target - Container element.
 * @param {RenderOptions} options
 * @returns {HTMLElement} The created element.
 *
 * @example
 * Vitrine.render(document.querySelector('#target'), {
 *   type: 'code',
 *   content: source,
 *   variant: 'full',
 *   options: { language: 'python', highlightLines: '2-3' },
 * });
 */
export function render(target, options) {
  if (!(target instanceof Element))
    throw new TypeError('[vitrine] render(): target must be an Element.');
  const tag = TYPES[/** @type {keyof typeof TYPES} */ (options?.type)];
  if (!tag) throw new TypeError(`[vitrine] render(): unknown type "${options?.type}".`);
  defineAll();
  const element = document.createElement(tag);
  if (options.variant) element.setAttribute('variant', options.variant);
  for (const [key, value] of Object.entries(options.options ?? {})) {
    const name = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    // Event handler attributes (onclick, onmouseover…) are never set. Vitrine's own
    // attributes that start with "on" contain a dash (on-invalid), handlers never do.
    if (!/^[a-z][a-z0-9-]*$/.test(name) || /^on[a-z]*$/.test(name)) continue;
    if (value === null || value === undefined) continue;
    element.setAttribute(name, value === true ? '' : String(value));
  }
  if (options.content !== undefined) /** @type {any} */ (element).content = options.content;
  else if (options.data !== undefined) /** @type {any} */ (element).data = options.data;
  target.replaceChildren(element);
  return element;
}
