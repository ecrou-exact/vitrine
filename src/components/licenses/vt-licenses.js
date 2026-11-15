// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import csvCss from '../../styles/csv.css?raw';
import licensesCss from '../../styles/licenses.css?raw';
import { parseEnum } from '../../core/attributes.js';
import { csvText } from '../../core/csv.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { TextSearch } from '../../core/search.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { CATEGORIES, LicenseError, byLicense, isAllowed, readLicenses } from './licenses.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./licenses.js').Dependency} Dependency */
/** @typedef {import('./licenses.js').Category} Category */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const VIEWS = /** @type {const} */ (['licenses', 'packages']);
/** Rows drawn in the Packages view. */
const MAX_ROWS = 2000;

/**
 * The licenses of a project's dependencies: how many packages each license covers, permissive
 * or copyleft, and the packages whose license is not in an allowed list, from a CycloneDX or
 * SPDX SBOM, `license-checker --json`, `pip-licenses --format=json` or a plain list.
 *
 * A dual license (`MIT OR GPL-3.0`) counts as its most permissive choice, `AND` as the least;
 * a GPL with the Classpath or GCC exception is a weak copyleft. This is a summary to review,
 * not legal advice.
 *
 * @element vt-licenses
 * @since 0.15.0
 *
 * @attr {string} allow - Allowed licenses, separated by commas: SPDX ids or kinds (`permissive,MPL-2.0`).
 * @attr {"licenses"|"packages"} view - What is shown at first (default `licenses`).
 * @attr {boolean} filters - Buttons that keep one kind of license. Full variant: on.
 * @attr {boolean} tabs - Licenses / Packages tabs. Full variant: on.
 *
 * @prop {string} content - The JSON text.
 * @prop {any} data - The dependencies, as a value.
 * @prop {Dependency[]} dependencies - The dependencies read (read-only).
 * @prop {Dependency[]} violations - Those whose license is not allowed (read-only).
 *
 * @fires vt-filter-change - A kind of license was chosen. Detail: `{ category }` (`null`: all, `"denied"`: not allowed).
 * @fires vt-tab-change - The view changed. Detail: `{ tab }`.
 *
 * @csspart bar - The share of each kind.
 * @csspart filters - The kinds of licenses.
 * @csspart table - A table.
 *
 * @example
 * <vt-licenses variant="full" allow="permissive,MPL-2.0" src="/sbom.cdx.json"></vt-licenses>
 */
export class VtLicenses extends VtDataElement {
  static type = 'licenses';

  static componentAttributes = Object.freeze(['allow', 'view', 'filters', 'tabs']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, search: true, download: true, fullscreen: true, filters: true, tabs: true }, // prettier-ignore
  };

  static styles = [syntaxCss, codeCss, dataCss, csvCss, licensesCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {Category | 'denied' | null} */
    this.filter = null;
    /** @type {"licenses" | "packages" | null} */
    this.viewChoice = null;
  }

  contentChanged() {
    this.filter = null;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'view') this.viewChoice = null;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  /** @returns {string[]} */
  get allowed() {
    return (this.getAttribute('allow') ?? '').split(',').map((a) => a.trim()).filter(Boolean).slice(0, 200); // prettier-ignore
  }

  /** @returns {{ deps: Dependency[], error: string | null }} */
  read() {
    try {
      return { deps: readLicenses(JSON.parse(this.text ?? '')), error: null };
    } catch (error) {
      const message = error instanceof LicenseError ? this.t('licensesShape') : this.t('jsonInvalid', { message: error instanceof Error ? error.message : '' }); // prettier-ignore
      return { deps: [], error: message };
    }
  }

  /** @returns {Dependency[]} */
  get dependencies() {
    return this.read().deps;
  }

  /** @returns {Dependency[]} */
  get violations() {
    const allowed = this.allowed;
    return this.dependencies.filter((d) => !isAllowed(d, allowed));
  }

  /** @returns {"licenses" | "packages"} */
  get view() {
    return this.viewChoice ?? parseEnum(this.getAttribute('view'), VIEWS, 'licenses');
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { deps, error } = this.read();
    const allowed = this.allowed;
    const denied = new Set(deps.filter((d) => !isAllowed(d, allowed)));
    const body = h('div', { class: 'body data-body lic-body', part: 'body' });
    if (error) body.append(noticeView(error));
    else if (!deps.length) body.append(h('p', { class: 'data-none', text: t('licensesEmpty') }));
    else {
      body.append(this.barView(deps));
      if (this.feature('filters')) body.append(this.filtersView(deps, denied));
      const f = this.filter;
      const shown = f === 'denied' ? deps.filter((d) => denied.has(d)) : f ? deps.filter((d) => d.category === f) : deps; // prettier-ignore
      if (!shown.length) body.append(h('p', { class: 'data-none', text: t('licensesNoMatch') }));
      else body.append(this.view === 'packages' ? this.packagesView(shown, denied) : this.licensesView(shown, denied)); // prettier-ignore
    }
    const tabs =
      this.feature('tabs') && deps.length
        ? createTabs({
            tabs: [{ id: 'licenses', label: t('licensesByLicense'), icon: 'list' }, { id: 'packages', label: t('licensesPackages'), icon: 'table' }], // prettier-ignore
            selected: this.view,
            label: t('tabs'),
            panelId: this.panelId,
            onSelect: (id) => {
              this.viewChoice = /** @type {"licenses" | "packages"} */ (id);
              this.render();
              /** @type {HTMLElement | null} */ (
                this.root.querySelector(`[data-tab="${id}"]`)
              )?.focus();
              emit(this, EVENTS.TAB_CHANGE, { tab: id });
            },
          })
        : null;
    const { panel, history } = this.previewPanel(body, this.panelId);
    if (tabs) panel.setAttribute('role', 'tabpanel');
    const searchable = /** @type {HTMLElement | null} */ (body.querySelector('.lic-wrap'));
    const csv = () => csvText([['package', 'version', 'license', 'kind', 'allowed', 'url'], ...deps.map((d) => [d.name, d.version, d.license, d.category, denied.has(d) ? 'no' : 'yes', d.url ?? ''])]); // prettier-ignore
    const count = deps.length === 1 ? t('licensesOne') : t('licensesCount', { count: formatNumber(deps.length, this.locale) }); // prettier-ignore
    frame.append(
      ...this.chrome({
        badge: deps.length ? (denied.size ? t('licensesViolations', { count: formatNumber(denied.size, this.locale) }) : count) : '', // prettier-ignore
        tabs,
        actions: [
          ...history,
          this.editToggleButton(),
          searchable ? this.searchButton(new TextSearch(searchable)) : null,
          this.fullscreenButton(),
          this.feature('download') && deps.length ? this.downloadButton(csv, this.downloadName('licenses.csv'), 'text/csv') : null, // prettier-ignore
          this.feature('copy') && deps.length ? this.copyButton(csv, t('licensesCopyCsv')) : null,
        ],
      }),
      panel,
    );
    this.editor?.align();
  }

  /**
   * @param {Category} category
   * @returns {string}
   */
  kind(category) {
    return this.t(/** @type {StringKey} */ (`licensesCategory_${category}`));
  }

  /**
   * One bar split by kind of license, with its legend.
   *
   * @param {Dependency[]} deps
   * @returns {HTMLElement}
   */
  barView(deps) {
    const t = this.t;
    const bar = h('div', { class: 'lic-bar', attrs: { 'aria-hidden': 'true' } });
    const legend = h('ul', { class: 'lic-legend' });
    for (const category of CATEGORIES) {
      const count = deps.filter((d) => d.category === category).length;
      if (!count) continue;
      const share = count / deps.length;
      const part = h('span', { class: `lic-part c-${category}` });
      part.style.setProperty('--_share', String(share));
      bar.append(part);
      const percent = new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: share < 0.01 ? 1 : 0 }).format(share); // prettier-ignore
      legend.append(h('li', { class: `lic-key c-${category}`, text: t('licensesShare', { category: this.kind(category), count: formatNumber(count, this.locale), percent }) })); // prettier-ignore
    }
    return h('div', { class: 'lic-summary', part: 'bar' }, bar, legend);
  }

  /**
   * @param {Dependency[]} deps
   * @param {Set<Dependency>} denied
   * @returns {HTMLElement}
   */
  filtersView(deps, denied) {
    const t = this.t;
    const box = h('div', { class: 'lic-filters', part: 'filters', attrs: { role: 'group', 'aria-label': t('licensesFilter') } }); // prettier-ignore
    /** @type {(Category | 'denied' | null)[]} */
    const choices = [null, ...(denied.size ? /** @type {const} */ (['denied']) : []), ...CATEGORIES.filter((c) => deps.some((d) => d.category === c))]; // prettier-ignore
    for (const choice of choices) {
      const count = choice === null ? deps.length : choice === 'denied' ? denied.size : deps.filter((d) => d.category === choice).length; // prettier-ignore
      const label = choice === null ? t('licensesAll') : choice === 'denied' ? t('licensesNotAllowed') : this.kind(choice); // prettier-ignore
      box.append(
        h(
          'button',
          {
            class: `lic-filter${choice ? ` c-${choice}` : ''}`,
            attrs: { type: 'button', 'aria-pressed': String(this.filter === choice), 'data-focus-key': `filter-${choice ?? 'all'}` }, // prettier-ignore
            on: {
              click: () => {
                this.filter = choice;
                this.render();
                emit(this, EVENTS.FILTER_CHANGE, { category: choice });
              },
            },
          },
          h('span', { text: label }),
          h('span', { class: 'lic-count', text: formatNumber(count, this.locale) }),
        ),
      );
    }
    return box;
  }

  /**
   * @param {Dependency} dep
   * @param {Set<Dependency>} denied
   * @returns {HTMLElement}
   */
  packageName(dep, denied) {
    const name = `${dep.name}${dep.version ? `@${dep.version}` : ''}`;
    return h(
      'span',
      { class: `lic-pkg${denied.has(dep) ? ' denied' : ''}` },
      dep.url ? h('a', { text: name, attrs: { href: dep.url, rel: 'noopener' } }) : name,
      denied.has(dep) ? h('span', { class: 'lic-denied', text: this.t('licensesNotAllowed') }) : null, // prettier-ignore
      dep.guessed ? h('span', { class: 'lic-guessed', text: '*', attrs: { title: this.t('licensesGuessed') } }) : null, // prettier-ignore
    );
  }

  /**
   * One row per license: its kind, its count, and its packages.
   *
   * @param {Dependency[]} deps
   * @param {Set<Dependency>} denied
   * @returns {HTMLElement}
   */
  licensesView(deps, denied) {
    const t = this.t;
    const list = h('ul', { class: 'lic-groups' });
    for (const group of byLicense(deps)) {
      const bad = group.deps.filter((d) => denied.has(d)).length;
      list.append(
        h(
          'li',
          {},
          h(
            'details',
            { class: `lic-group c-${group.category}`, attrs: { open: bad ? '' : null } },
            h(
              'summary',
              { attrs: { 'data-focus-key': `license-${group.license}` } },
              h('code', { class: 'lic-name', text: group.license }),
              h('span', { class: `lic-kind c-${group.category}`, text: this.kind(group.category) }),
              h('span', { class: 'lic-count', text: group.deps.length === 1 ? t('licensesOne') : t('licensesCount', { count: formatNumber(group.deps.length, this.locale) }) }), // prettier-ignore
            ),
            h('p', { class: 'lic-members' }, ...group.deps.slice(0, 500).flatMap((d, n) => [n ? ', ' : '', this.packageName(d, denied)])), // prettier-ignore
          ),
        ),
      );
    }
    return h('div', { class: 'lic-wrap' }, list);
  }

  /**
   * @param {Dependency[]} deps
   * @param {Set<Dependency>} denied
   * @returns {HTMLElement}
   */
  packagesView(deps, denied) {
    const t = this.t;
    const head = h('tr', {}, ...['licensesPackage', 'licensesLicense', 'licensesKind'].map((k) => h('th', { attrs: { scope: 'col' }, text: t(/** @type {StringKey} */ (k)) }))); // prettier-ignore
    const rows = h('tbody');
    for (const dep of deps.slice(0, MAX_ROWS))
      rows.append(
        h(
          'tr',
          { class: denied.has(dep) ? 'denied' : '' },
          h('td', {}, this.packageName(dep, denied)),
          h('td', {}, h('code', { text: dep.license })),
          h('td', {}, h('span', { class: `lic-kind c-${dep.category}`, text: this.kind(dep.category) })), // prettier-ignore
        ),
      );
    return h(
      'div',
      { class: 'lic-wrap lic-table-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': t('licensesPackages') } }, // prettier-ignore
      h('table', { class: 'grid lic-table', part: 'table' }, h('thead', {}, head), rows),
    );
  }
}
