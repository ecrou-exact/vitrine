// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import pricingCss from '../../styles/pricing.css?raw';
import { parseEnum } from '../../core/attributes.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { noticeView } from '../../core/ui.js';
import { parsePricing, priceOf, savings } from './model.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./model.js').Pricing} Pricing */
/** @typedef {import('./model.js').Plan} Plan */
/** @typedef {import('./model.js').Period} Period */
/** @typedef {import('./model.js').CompareRow} CompareRow */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const TARGETS = /** @type {const} */ (['_self', '_blank']);
const DISPLAYS = /** @type {const} */ (['monthly', 'total']);

/**
 * Displays pricing plans as cards, with a billing period switch, several currencies, what a
 * longer period saves, and a table comparing the plans.
 *
 * Every value is rendered with DOM text APIs. Button links keep safe URL schemes only.
 *
 * @element vt-pricing
 * @since 0.10.0
 *
 * @attr {string} period - Id of the first billing period. Default: the first of the source.
 * @attr {string} currency - First currency (ISO 4217, such as `EUR`). Default: the first of the source.
 * @attr {"monthly"|"total"} display - Shows prices per month (default), or as billed.
 * @attr {boolean} compare - The table comparing the plans. Default: on.
 * @attr {"_self"|"_blank"} link-target - Where the plan buttons open (default `_self`).
 *
 * @prop {string} content - The JSON text.
 * @prop {Pricing | null} pricing - The parsed plans (read-only), `null` when they cannot be read.
 * @prop {string | null} selectedPeriod - Id of the billing period shown.
 * @prop {string} selectedCurrency - The currency shown.
 *
 * @fires vt-ready - Plans rendered. Detail: `{ type: "pricing" }`.
 * @fires vt-copy - JSON copied. Detail: `{ text }`.
 * @fires vt-pricing-change - The period or currency changed. Detail: `{ period, currency }`.
 * @fires vt-plan-select - A plan button was pressed; cancel it to stop the link (cancelable).
 *   Detail: `{ plan, name, period, currency, amount, url }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart controls - The period and currency controls.
 * @csspart period - A billing period.
 * @csspart currency - The currency list.
 * @csspart plans - The list of cards.
 * @csspart plan - A card.
 * @csspart plan-highlight - The card of a highlighted plan.
 * @csspart price - The price of a card.
 * @csspart saving - What a period saves.
 * @csspart cta - The button of a card.
 * @csspart feature - A feature of a card.
 * @csspart compare - The table comparing the plans.
 *
 * @example
 * <vt-pricing src="/pricing.json" period="yearly" currency="EUR"></vt-pricing>
 */
export class VtPricing extends VtDataElement {
  static type = 'pricing';

  static componentAttributes = Object.freeze([
    'period',
    'currency',
    'display',
    'compare',
    'link-target',
  ]);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true },
  };

  static styles = [syntaxCss, codeCss, pricingCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    this.groupName = uid('period');
    this.currencyId = uid('currency');
    /** @type {string | null} Period chosen by the reader; `null` follows `period`. */
    this.periodState = null;
    /** @type {string | null} Currency chosen by the reader; `null` follows `currency`. */
    this.currencyState = null;
  }

  /** @type {Pricing | null} */
  get pricing() {
    const result = parsePricing(this.text ?? '');
    return result.ok ? result.pricing : null;
  }

  /** @type {string | null} */
  get selectedPeriod() {
    return this.activePeriod(this.pricing)?.id ?? null;
  }

  set selectedPeriod(id) {
    this.periodState = id;
    this.requestRender();
  }

  /** @type {string} */
  get selectedCurrency() {
    return this.activeCurrency(this.pricing);
  }

  set selectedCurrency(code) {
    this.currencyState = code;
    this.requestRender();
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'period' && oldValue !== newValue) this.periodState = null;
    if (name === 'currency' && oldValue !== newValue) this.currencyState = null;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  /**
   * @param {Pricing | null} pricing
   * @returns {Period | null}
   */
  activePeriod(pricing) {
    if (!pricing?.periods.length) return null;
    const wanted = this.periodState ?? this.getAttribute('period');
    return pricing.periods.find((period) => period.id === wanted) ?? pricing.periods[0];
  }

  /**
   * @param {Pricing | null} pricing
   * @returns {string}
   */
  activeCurrency(pricing) {
    const list = pricing?.currencies ?? [];
    const wanted = (this.currencyState ?? this.getAttribute('currency') ?? '').toUpperCase();
    return list.includes(wanted) ? wanted : (list[0] ?? 'USD');
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = parsePricing(this.text ?? '');
    const body = h('div', { class: 'body pricing-body', part: 'body' });
    if (!result.ok) {
      body.append(
        noticeView(
          result.error === 'json'
            ? t('pricingInvalidJson', { message: result.message })
            : t('pricingInvalidShape'),
        ),
      );
    } else if (!result.pricing.plans.length) {
      body.append(h('p', { class: 'pricing-note', text: t('pricingEmpty') }));
    } else {
      this.renderPlans(body, result.pricing);
    }
    const { panel, history } = this.previewPanel(body, this.panelId);
    frame.append(
      ...this.chrome({
        badge: 'JSON',
        actions: [
          ...history,
          this.editToggleButton(),
          this.fullscreenButton(),
          this.feature('download')
            ? this.downloadButton(
                () => this.text ?? '',
                this.downloadName('pricing.json'),
                'application/json',
              )
            : null,
          this.feature('copy') ? this.copyButton(() => this.text ?? '') : null,
        ],
      }),
      panel,
    );
    this.editor?.align();
  }

  /**
   * @param {HTMLElement} body
   * @param {Pricing} pricing
   */
  renderPlans(body, pricing) {
    const period = this.activePeriod(pricing);
    const currency = this.activeCurrency(pricing);
    const controls = this.controls(pricing, period, currency);
    if (controls) body.append(controls);
    body.append(
      h(
        'ul',
        { class: 'pricing-plans', part: 'plans' },
        ...pricing.plans.map((plan) => this.planCard(plan, pricing, period, currency)),
      ),
    );
    if (pricing.rows.length && this.flag('compare')) body.append(this.compareTable(pricing));
    if (pricing.note) body.append(h('p', { class: 'pricing-note', text: pricing.note }));
  }

  // ---------------------------------------------------------------- controls

  /**
   * @param {Pricing} pricing
   * @param {Period | null} period
   * @param {string} currency
   * @returns {HTMLElement | null}
   */
  controls(pricing, period, currency) {
    const switcher = pricing.periods.length > 1 ? this.periodSwitch(pricing, period) : null;
    const picker = pricing.currencies.length > 1 ? this.currencyPicker(pricing, currency) : null;
    return switcher || picker
      ? h('div', { class: 'pricing-controls', part: 'controls' }, switcher, picker)
      : null;
  }

  /**
   * Radio buttons: arrows move between the periods, as everywhere else on the web.
   *
   * @param {Pricing} pricing
   * @param {Period | null} active
   * @returns {HTMLElement}
   */
  periodSwitch(pricing, active) {
    return h(
      'fieldset',
      { class: 'pricing-periods' },
      h('legend', { class: 'sr-only', text: this.t('pricingPeriod') }),
      ...pricing.periods.map((period) => {
        const checked = period.id === active?.id;
        return h(
          'label',
          {
            class: `pricing-period${checked ? ' active' : ''}`,
            part: 'period',
          },
          h('input', {
            attrs: {
              type: 'radio',
              name: this.groupName,
              value: period.id,
              checked,
              'data-focus-key': `period-${period.id}`,
            },
            on: {
              change: () => {
                this.periodState = period.id;
                this.changed(pricing);
              },
            },
          }),
          h('span', { text: this.periodLabel(period) }),
          period.note ? h('span', { class: 'pricing-period-note', text: period.note }) : null,
        );
      }),
    );
  }

  /**
   * @param {Period} period
   * @returns {string}
   */
  periodLabel(period) {
    if (period.label) return period.label;
    const key = { month: 'monthly', monthly: 'monthly', quarter: 'quarterly', quarterly: 'quarterly', year: 'yearly', yearly: 'yearly', annual: 'yearly', annually: 'yearly' }[period.id.toLowerCase()]; // prettier-ignore
    return key
      ? this.t(/** @type {StringKey} */ (`pricingPeriod_${key}`))
      : period.id.charAt(0).toUpperCase() + period.id.slice(1);
  }

  /**
   * @param {Pricing} pricing
   * @param {string} currency
   * @returns {HTMLElement}
   */
  currencyPicker(pricing, currency) {
    return h(
      'div',
      { class: 'pricing-currency' },
      h('label', {
        class: 'sr-only',
        text: this.t('pricingCurrency'),
        attrs: { for: this.currencyId },
      }),
      h(
        'select',
        {
          part: 'currency',
          attrs: { id: this.currencyId, 'data-focus-key': 'currency' },
          on: {
            change: (event) => {
              this.currencyState = /** @type {HTMLSelectElement} */ (event.target).value;
              this.changed(pricing);
            },
          },
        },
        ...pricing.currencies.map((code) =>
          h('option', {
            text: code,
            attrs: { value: code, selected: code === currency },
          }),
        ),
      ),
    );
  }

  /**
   * @param {Pricing} pricing
   */
  changed(pricing) {
    this.render();
    const period = this.activePeriod(pricing)?.id ?? null;
    const currency = this.activeCurrency(pricing);
    emit(this, EVENTS.PRICING_CHANGE, { period, currency });
  }

  // ---------------------------------------------------------------- cards

  /**
   * @param {Plan} plan
   * @param {Pricing} pricing
   * @param {Period | null} period
   * @param {string} currency
   * @returns {HTMLElement}
   */
  planCard(plan, pricing, period, currency) {
    const t = this.t;
    const saved = period ? savings(plan, pricing, period, currency) : 0;
    return h(
      'li',
      {
        class: `pricing-plan${plan.highlight ? ' highlight' : ''}`,
        part: plan.highlight ? 'plan plan-highlight' : 'plan',
      },
      plan.badge ? h('span', { class: 'pricing-badge', text: plan.badge }) : null,
      h('h3', { class: 'pricing-name', text: plan.name }),
      plan.description ? h('p', { class: 'pricing-description', text: plan.description }) : null,
      this.priceView(plan, period, currency),
      saved
        ? h('p', {
            class: 'pricing-saving',
            part: 'saving',
            text: t('pricingSave', { percent: saved }),
          })
        : null,
      this.ctaView(plan, period, currency),
      plan.features.length
        ? h(
            'ul',
            { class: 'pricing-features' },
            ...plan.features.map((feature) =>
              h(
                'li',
                {
                  class: feature.included ? 'included' : 'excluded',
                  part: 'feature',
                },
                icon(feature.included ? 'check' : 'close'),
                h('span', {
                  class: 'sr-only',
                  text: t(feature.included ? 'pricingIncluded' : 'pricingExcluded'),
                }),
                h('span', { text: feature.text }),
              ),
            ),
          )
        : null,
    );
  }

  /**
   * @param {Plan} plan
   * @param {Period | null} period
   * @param {string} currency
   * @returns {HTMLElement}
   */
  priceView(plan, period, currency) {
    const t = this.t;
    const price = priceOf(plan, period?.id ?? null, currency);
    const box = h('div', { class: 'pricing-price', part: 'price' });
    if (price.kind === 'none') {
      box.append(h('span', { class: 'pricing-amount small', text: t('pricingNoPrice') }));
      return box;
    }
    if (price.kind === 'text') {
      box.append(h('span', { class: 'pricing-amount small', text: price.text }));
      return box;
    }
    if (price.amount === 0) {
      box.append(h('span', { class: 'pricing-amount', text: t('pricingFree') }));
      return box;
    }
    const months = period?.months ?? 0;
    const perMonth =
      months > 0 && parseEnum(this.getAttribute('display'), DISPLAYS, 'monthly') === 'monthly';
    const shown = perMonth ? price.amount / months : price.amount;
    box.append(h('span', { class: 'pricing-amount', text: this.money(shown, currency) }));
    const suffix = [
      perMonth || months === 1 ? t('pricingPerMonth') : months === 12 ? t('pricingPerYear') : '',
      plan.unit,
    ]
      .filter(Boolean)
      .join(' ');
    if (suffix) box.append(h('span', { class: 'pricing-unit', text: suffix }));
    if (perMonth && months > 1) {
      const amount = this.money(price.amount, currency);
      box.append(
        h('span', {
          class: 'pricing-billed',
          text:
            months === 12
              ? t('pricingBilledYearly', { amount })
              : t('pricingBilled', { amount, months }),
        }),
      );
    }
    return box;
  }

  /**
   * The button of a plan: a link when the plan has a URL.
   *
   * @param {Plan} plan
   * @param {Period | null} period
   * @param {string} currency
   * @returns {HTMLElement}
   */
  ctaView(plan, period, currency) {
    const label = plan.cta || this.t('pricingChoose', { name: plan.name });
    const className = `pricing-cta${plan.highlight ? ' primary' : ''}`;
    /** @param {Event} event */
    const onClick = (event) => {
      const price = priceOf(plan, period?.id ?? null, currency);
      const allowed = emit(this, EVENTS.PLAN_SELECT, {
        plan: plan.id,
        name: plan.name,
        period: period?.id ?? null,
        currency,
        amount: price.kind === 'amount' ? price.amount : null,
        url: plan.url,
      });
      if (!allowed) event.preventDefault();
    };
    if (!plan.url) {
      return h('button', {
        class: className,
        part: 'cta',
        text: label,
        attrs: { type: 'button', 'data-focus-key': `cta-${plan.id}` },
        on: { click: onClick },
      });
    }
    const target = parseEnum(this.getAttribute('link-target'), TARGETS, '_self');
    return h('a', {
      class: className,
      part: 'cta',
      text: label,
      attrs: {
        href: plan.url,
        'data-focus-key': `cta-${plan.id}`,
        target: target === '_blank' ? '_blank' : null,
        rel: target === '_blank' ? 'noopener noreferrer' : null,
      },
      on: { click: onClick },
    });
  }

  /**
   * @param {number} amount
   * @param {string} currency
   * @returns {string} Cents only for amounts that have some.
   */
  money(amount, currency) {
    const rounded = Math.round(amount * 100) / 100;
    const digits = Number.isInteger(rounded) ? 0 : 2;
    try {
      return new Intl.NumberFormat(this.locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(rounded);
    } catch {
      return `${rounded} ${currency}`;
    }
  }

  // ---------------------------------------------------------------- comparison

  /**
   * @param {Pricing} pricing
   * @returns {HTMLElement}
   */
  compareTable(pricing) {
    const t = this.t;
    const { plans, rows } = pricing;
    /** @type {HTMLElement[]} */
    const lines = [];
    let group = '';
    for (const row of rows) {
      if (row.group && row.group !== group) {
        group = row.group;
        lines.push(
          h(
            'tr',
            { class: 'pricing-group' },
            h('th', { text: group, attrs: { colspan: plans.length + 1, scope: 'colgroup' } }),
          ),
        );
      }
      lines.push(this.compareRow(row, plans));
    }
    return h(
      'section',
      { class: 'pricing-compare', attrs: { 'aria-label': t('pricingCompare') } },
      h('h3', { class: 'pricing-compare-title', text: t('pricingCompare') }),
      h(
        'div',
        {
          class: 'pricing-scroll',
          attrs: { role: 'region', tabindex: '0', 'aria-label': t('pricingCompare') },
        },
        h(
          'table',
          { part: 'compare' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', { text: t('pricingFeature'), attrs: { scope: 'col' } }),
              ...plans.map((plan) =>
                h('th', {
                  class: plan.highlight ? 'highlight' : undefined,
                  text: plan.name,
                  attrs: { scope: 'col' },
                }),
              ),
            ),
          ),
          h('tbody', {}, ...lines),
        ),
      ),
    );
  }

  /**
   * @param {CompareRow} row
   * @param {Plan[]} plans
   * @returns {HTMLElement}
   */
  compareRow(row, plans) {
    return h(
      'tr',
      {},
      h(
        'th',
        { attrs: { scope: 'row' } },
        h('span', { text: row.name }),
        row.description ? h('span', { class: 'pricing-row-note', text: row.description }) : null,
      ),
      ...plans.map((plan) =>
        h(
          'td',
          { class: plan.highlight ? 'highlight' : undefined },
          this.compareValue(row.values[plan.id]),
        ),
      ),
    );
  }

  /**
   * @param {boolean | string | undefined} value
   * @returns {HTMLElement}
   */
  compareValue(value) {
    const t = this.t;
    if (value === true || value === false || value === undefined || value === '') {
      const included = value === true;
      return h(
        'span',
        { class: `pricing-mark ${included ? 'included' : 'excluded'}` },
        icon(included ? 'check' : 'close'),
        h('span', { class: 'sr-only', text: t(included ? 'pricingIncluded' : 'pricingExcluded') }),
      );
    }
    return h('span', { text: value });
  }
}
