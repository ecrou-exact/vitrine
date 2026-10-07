// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import chartCss from '../../styles/chart.css?raw';
import { parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { createTabs, loadingView, noticeView } from '../../core/ui.js';
import { loadECharts } from './echarts-loader.js';
import { ChartDataError, parseChartData, toCsvText } from './data.js';

/** @typedef {import('./data.js').ChartData} ChartData */
/** @typedef {import('./data.js').Series} Series */

const TYPES = /** @type {const} */ (['line', 'area', 'bar', 'pie']);
const VIEWS = /** @type {const} */ (['chart', 'table']);
/** Series colors cycle through this many theme colors. */
const COLORS = 8;

/** @typedef {typeof TYPES[number]} ChartType */

/**
 * Charts from CSV or JSON, drawn with Apache ECharts in the theme colors: line, area,
 * bar (vertical or horizontal, grouped or stacked) and donut.
 *
 * ECharts is loaded on demand (`dist/vendor/echarts.js`) the first time a chart is shown,
 * so pages without charts never download it. Values can be read with the pointer or the
 * arrow keys, which also announce them; a Table tab shows the same data as a table.
 *
 * @element vt-chart
 * @since 0.8.0
 *
 * @attr {"line"|"area"|"bar"|"pie"} type - Chart type (default `line`). `pie` draws a donut of the first series.
 * @attr {boolean} stacked - Stacks the series (area and bar).
 * @attr {boolean} smooth - Smooth curves (line and area).
 * @attr {boolean} horizontal - Horizontal bars.
 * @attr {boolean} zoom - Zoom and pan along the labels (wheel, drag, slider).
 * @attr {string} x - Column holding the labels (default: the first non-numeric column).
 * @attr {string} y - Columns to plot, separated by spaces (default: every numeric column).
 * @attr {number} height - Height of the plot in pixels, 120–800 (default 300).
 * @attr {boolean} legend - Legend buttons to show or hide each series (default: on with two series or more).
 * @attr {boolean} grid - Grid lines (default on).
 * @attr {boolean} points - Dots on line and area points (default: on up to 60 points).
 * @attr {string} unit - Suffix of values (`ms`, `%`, `€`…).
 * @attr {boolean} compact - Compact numbers (`1.2K`, `3.4M`).
 * @attr {number} min - Lowest value of the axis.
 * @attr {number} max - Highest value of the axis.
 * @attr {boolean} tabs - Chart / Table tabs. Full variant: on.
 * @attr {"chart"|"table"} view - Initial view (default `chart`).
 *
 * @prop {string} content - The data as CSV or JSON.
 * @prop {ChartData} data - The data read from the content (read-only).
 *
 * @fires vt-select - A point, bar or slice was clicked (or chosen with Enter). Detail: `{ index, label, values }`.
 *
 * @csspart plot - The drawing area.
 * @csspart legend - The legend.
 * @csspart legend-item - A legend button.
 * @csspart table - The data table.
 *
 * @example
 * <vt-chart type="bar" variant="full" label="Visits">
 *   <template>
 *     month,desktop,mobile
 *     Jan,120,80
 *     Feb,140,110
 *   </template>
 * </vt-chart>
 */
export class VtChart extends VtBase {
  static type = 'chart';

  static componentAttributes = Object.freeze([
    'type', 'stacked', 'smooth', 'horizontal', 'zoom', 'x', 'y', 'height', 'legend', 'grid',
    'points', 'unit', 'compact', 'min', 'max', 'tabs', 'view',
  ]); // prettier-ignore

  static presets = {
    simple: { grid: true },
    full: {
      header: true, dot: true, copy: true, download: true, fullscreen: true, tabs: true,
      grid: true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, chartCss];

  constructor() {
    super();
    /** @type {{ key: string, data: ChartData | null, error: Error | null } | null} */
    this.parsed = null;
    /** @type {Set<number>} Series hidden with the legend. */
    this.hiddenSeries = new Set();
    /** @type {"chart" | "table" | null} */
    this.viewState = null;
    this.panelId = uid('panel');
    /** @type {HTMLElement | null} */
    this.plot = null;
    /** @type {any} ECharts instance. */
    this.instance = null;
    /** @type {ResizeObserver | null} */
    this.resize = null;
    /** Index of the point chosen with the keyboard, or -1. */
    this.active = -1;
    /** First drawing of this data: animate it in. */
    this.animateIn = true;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  disconnectedCallback() {
    this.dispose();
    clearTimeout(this.previewTimer);
    this.editor?.destroy();
    super.disconnectedCallback();
  }

  dispose() {
    this.resize?.disconnect();
    this.resize = null;
    this.instance?.dispose();
    this.instance = null;
  }

  contentChanged() {
    this.parsed = null;
    this.hiddenSeries.clear();
    this.animateIn = true;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'x' || name === 'y') this.parsed = null;
    if (name === 'view') this.viewState = null;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  // ------------------------------------------------------------------ model

  /** @returns {{ data: ChartData | null, error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    const x = this.getAttribute('x');
    const y = this.getAttribute('y');
    const key = `${x}\u0000${y}\u0000${text}`;
    if (this.parsed?.key !== key) {
      try {
        this.parsed = { key, data: parseChartData(text, { x, y }), error: null };
      } catch (error) {
        this.parsed = {
          key,
          data: null,
          error: error instanceof Error ? error : new ChartDataError(String(error)),
        };
      }
    }
    return this.parsed;
  }

  /** @returns {ChartData} */
  get data() {
    const data = this.parse().data;
    return data
      ? {
          labels: [...data.labels],
          series: data.series.map((s) => ({ name: s.name, values: [...s.values] })),
          truncated: data.truncated,
        }
      : { labels: [], series: [], truncated: false };
  }

  /** @returns {ChartType} */
  get chartType() {
    return parseEnum(this.getAttribute('type'), TYPES, 'line');
  }

  /** @returns {"chart" | "table"} */
  get view() {
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, 'chart');
  }

  /**
   * Formats a value with the `unit` and `compact` options.
   *
   * @param {number | null | undefined} value
   * @returns {string}
   */
  format(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '–';
    const compact = this.feature('compact');
    const text = new Intl.NumberFormat(this.locale, {
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 2,
    }).format(value);
    const unit = (this.getAttribute('unit') ?? '').slice(0, 12);
    return unit ? `${text}${/^[%‰]$/.test(unit) ? '' : ' '}${unit}` : text;
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { data, error } = this.parse();
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLElement[]} */
    let extra = [];
    this.dispose();
    this.plot = null;

    /** @type {HTMLElement} */
    let body;
    if (error) {
      body = h(
        'div',
        { class: 'body chart-body', part: 'body' },
        noticeView(t('chartError', { message: error.message })),
      );
    } else if (!data || !data.labels.length) {
      body = h(
        'div',
        { class: 'body chart-body', part: 'body' },
        h('div', { class: 'empty', part: 'empty', text: t('empty') }),
      );
    } else if (this.view === 'table' && !this.editing) {
      body = h('div', { class: 'body chart-body', part: 'body' }, this.table(data));
    } else {
      body = h('div', { class: 'body chart-body', part: 'body' }, ...this.chart(data));
    }

    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('chart-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        body,
      );
      extra = this.historyButtons(editor);
    } else panel.append(body);
    if (data?.truncated) panel.prepend(noticeView(t('chartTruncated')));

    const tabs =
      this.feature('tabs') && !this.editing && data && !error
        ? createTabs({
            tabs: [
              { id: 'chart', label: t('chartView'), icon: 'chart' },
              { id: 'table', label: t('table'), icon: 'table' },
            ],
            selected: this.view,
            label: t('tabs'),
            panelId: this.panelId,
            onSelect: (id) => {
              this.viewState = /** @type {"chart" | "table"} */ (id);
              this.animateIn = id === 'chart';
              this.render();
              emit(this, EVENTS.TAB_CHANGE, { tab: id });
            },
          })
        : null;
    if (tabs) panel.setAttribute('role', 'tabpanel');

    const csv = () => (data ? toCsvText(data) : (this.text ?? ''));
    const actions = [
      ...extra,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(csv, this.downloadName('chart.csv'), 'text/csv')
        : null,
      this.feature('copy') ? this.copyButton(csv, t('copyData')) : null,
    ];
    frame.append(...this.chrome({ badge: tabs ? '' : t('chartView'), tabs, actions }), panel);
    this.editor?.align();
    if (this.plot) this.draw();
  }

  /**
   * Legend and plot.
   *
   * @param {ChartData} data
   * @returns {HTMLElement[]}
   */
  chart(data) {
    const t = this.t;
    const height = parseInteger(this.getAttribute('height'), {
      min: 120,
      max: 800,
      fallback: 300,
    });
    const pie = this.chartType === 'pie';
    const legendOn = !pie && booleanOr(this, 'legend', data.series.length > 1);
    /** @type {HTMLElement[]} */
    const parts = [];
    if (legendOn) {
      const legend = h('div', {
        class: 'legend',
        part: 'legend',
        attrs: { role: 'group', 'aria-label': t('legend') },
      });
      data.series.forEach((series, index) => {
        legend.append(
          h(
            'button',
            {
              class: `legend-item s-${index % COLORS}`,
              part: 'legend-item',
              attrs: {
                type: 'button',
                'aria-pressed': String(!this.hiddenSeries.has(index)),
                'data-focus-key': `series-${index}`,
                title: t('seriesToggle', { name: series.name }),
              },
              on: { click: () => this.toggleSeries(index) },
            },
            h('span', { class: 'swatch', attrs: { 'aria-hidden': 'true' } }),
            series.name,
          ),
        );
      });
      parts.push(legend);
    }
    this.plot = h('div', {
      class: 'plot',
      part: 'plot',
      attrs: {
        tabindex: '0',
        role: 'img',
        'aria-roledescription': t('chartView'),
        'aria-label': this.summary(data),
      },
      on: {
        keydown: (event) => this.onKeyDown(/** @type {KeyboardEvent} */ (event)),
        blur: () => this.hideTip(),
      },
    });
    this.plot.style.height = `${height}px`;
    parts.push(this.plot);
    return parts;
  }

  /**
   * @param {number} index
   */
  toggleSeries(index) {
    const data = this.parse().data;
    if (!data) return;
    if (this.hiddenSeries.has(index)) this.hiddenSeries.delete(index);
    // At least one series stays visible.
    else if (this.hiddenSeries.size < data.series.length - 1) this.hiddenSeries.add(index);
    const button = this.root.querySelector(`[data-focus-key="series-${index}"]`);
    button?.setAttribute('aria-pressed', String(!this.hiddenSeries.has(index)));
    // ECharts animates from the current chart to the new one.
    if (this.instance) this.instance.setOption(this.option(data), { notMerge: true });
  }

  /**
   * One-sentence description of the chart for assistive technologies.
   *
   * @param {ChartData} data
   * @returns {string}
   */
  summary(data) {
    const t = this.t;
    const ranges = data.series.map((series) => {
      const values = /** @type {number[]} */ (series.values.filter((v) => v !== null));
      return t('chartRange', {
        name: series.name,
        min: this.format(values.length ? Math.min(...values) : null),
        max: this.format(values.length ? Math.max(...values) : null),
      });
    });
    return `${this.heading ? `${this.heading}. ` : ''}${t('chartSummary', {
      type: t(`chart_${this.chartType}`),
      series: formatNumber(data.series.length, this.locale),
      points: formatNumber(data.labels.length, this.locale),
    })} ${ranges.join('; ')}.`;
  }

  /** Loads ECharts if needed, then draws the chart in the plot. */
  draw() {
    const plot = this.plot;
    if (!plot) return;
    const library = loadECharts();
    if (!library.ready) {
      plot.replaceChildren(loadingView(this.t));
      library.promise.then(
        () => {
          if (this.plot === plot) this.draw();
        },
        (error) => {
          if (this.plot === plot)
            plot.replaceChildren(
              noticeView(this.t('chartLoadFailed', { message: String(error?.message ?? error) })),
            );
        },
      );
      return;
    }
    const data = this.parse().data;
    if (!data) return;
    plot.replaceChildren();
    const echarts = library.echarts;
    this.instance = echarts.init(plot, null, {
      renderer: 'canvas',
      locale: this.locale.startsWith('fr') ? 'FR' : 'EN',
    });
    this.instance.setOption(this.option(data));
    this.animateIn = false;
    this.instance.on('click', (/** @type {any} */ params) => {
      this.active = params.dataIndex ?? -1;
      this.select();
    });
    this.resize = new ResizeObserver(() => this.instance?.resize());
    this.resize.observe(plot);
  }

  /**
   * Theme colors and fonts, resolved from the component's tokens.
   *
   * @returns {{ series: string[], fg: string, muted: string, border: string, surface: string, font: string, mono: string }}
   */
  palette() {
    const probe = h('span', { attrs: { 'aria-hidden': 'true' } });
    probe.style.display = 'none';
    this.frame.append(probe);
    const read = (/** @type {string} */ variable) => {
      probe.style.color = `var(${variable})`;
      return getComputedStyle(probe).color;
    };
    const series = Array.from({ length: COLORS }, (_, i) => read(`--_chart-${i + 1}`));
    const colors = {
      series,
      fg: read('--_fg'),
      muted: read('--_fg-muted'),
      border: read('--_border'),
      surface: read('--_surface-raised'),
      font: getComputedStyle(this.frame).fontFamily,
      mono: getComputedStyle(probe).getPropertyValue('--_font-mono') || 'monospace',
    };
    probe.remove();
    return colors;
  }

  /**
   * ECharts option for the data.
   *
   * @param {ChartData} data
   * @returns {object}
   */
  option(data) {
    const type = this.chartType;
    const colors = this.palette();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const visible = data.series.map((_, i) => !this.hiddenSeries.has(i));
    const shown = data.series
      .map((series, index) => ({ series, index }))
      .filter(({ index }) => visible[index]);
    const tooltip = {
      // Drawn on the canvas, never as HTML: labels from the data cannot inject markup.
      renderMode: 'richText',
      confine: true,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: colors.fg, fontFamily: colors.font, fontSize: 12 },
      valueFormatter: (/** @type {number} */ value) => this.format(value),
    };
    const base = {
      animation: !still,
      animationDuration: this.animateIn ? 900 : 400,
      animationEasing: 'cubicOut',
      animationDurationUpdate: 450,
      textStyle: { fontFamily: colors.font, color: colors.muted },
      aria: { enabled: true, label: { description: this.summary(data) } },
    };

    if (type === 'pie') {
      const first = shown[0]?.series ?? data.series[0];
      return {
        ...base,
        color: colors.series,
        tooltip: { ...tooltip, trigger: 'item' },
        series: [
          {
            name: first.name,
            type: 'pie',
            radius: ['46%', '74%'],
            center: ['50%', '52%'],
            avoidLabelOverlap: true,
            itemStyle: { borderColor: colors.surface, borderWidth: 2, borderRadius: 4 },
            label: { color: colors.fg, formatter: '{b}' },
            labelLine: { lineStyle: { color: colors.border } },
            emphasis: { scaleSize: 6 },
            data: data.labels.map((label, i) => ({ name: label, value: first.values[i] ?? 0 })),
          },
        ],
      };
    }

    const horizontal = type === 'bar' && this.feature('horizontal');
    const stacked = this.feature('stacked') && type !== 'line';
    const showPoints = booleanOr(this, 'points', data.labels.length <= 60);
    const zoom = this.feature('zoom');
    const categoryAxis = {
      type: 'category',
      data: data.labels,
      boundaryGap: type === 'bar',
      axisLine: { lineStyle: { color: colors.border } },
      axisTick: { show: false },
      axisLabel: { color: colors.muted, hideOverlap: true },
    };
    const valueAxis = {
      type: 'value',
      min: numberAttribute(this, 'min') ?? undefined,
      max: numberAttribute(this, 'max') ?? undefined,
      scale: type === 'line',
      splitLine: {
        show: this.feature('grid'),
        lineStyle: { color: colors.border, type: 'dashed' },
      },
      axisLabel: {
        color: colors.muted,
        formatter: (/** @type {number} */ value) => this.format(value),
      },
    };
    return {
      ...base,
      color: shown.map(({ index }) => colors.series[index % COLORS]),
      grid: { left: 12, right: 20, top: 20, bottom: zoom ? 52 : 12, containLabel: true },
      tooltip: {
        ...tooltip,
        trigger: 'axis',
        axisPointer: {
          type: type === 'bar' ? 'shadow' : 'line',
          lineStyle: { color: colors.muted, type: 'dashed' },
          shadowStyle: { color: 'rgba(127, 127, 127, 0.08)' },
        },
      },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? { ...categoryAxis, inverse: true } : valueAxis,
      dataZoom: zoom
        ? [
            { type: 'inside', [horizontal ? 'yAxisIndex' : 'xAxisIndex']: 0 },
            {
              type: 'slider',
              height: 18,
              bottom: 10,
              borderColor: colors.border,
              fillerColor: 'rgba(20, 184, 166, 0.12)',
              handleStyle: { color: colors.series[0] },
              textStyle: { color: colors.muted },
              dataBackground: {
                lineStyle: { color: colors.border },
                areaStyle: { color: colors.border },
              },
            },
          ]
        : [],
      series: shown.map(({ series }) => ({
        name: series.name,
        type: type === 'bar' ? 'bar' : 'line',
        data: series.values.map((value) => (value === null ? '-' : value)),
        stack: stacked ? 'total' : undefined,
        smooth: type !== 'bar' && this.feature('smooth') ? 0.35 : false,
        showSymbol: showPoints,
        symbolSize: 6,
        connectNulls: false,
        lineStyle: { width: 2.2 },
        areaStyle: type === 'area' ? { opacity: stacked ? 0.55 : 0.16 } : undefined,
        barMaxWidth: 38,
        itemStyle:
          type === 'bar' ? { borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] } : undefined,
        emphasis: { focus: 'series' },
        universalTransition: true,
      })),
    };
  }

  /**
   * Arrow keys move between points and announce their values.
   *
   * @param {KeyboardEvent} event
   */
  onKeyDown(event) {
    const data = this.parse().data;
    const n = data?.labels.length ?? 0;
    if (!data || !n || !this.instance) return;
    const current = this.active;
    /** @type {number | null} */
    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = Math.min(n - 1, current + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, current - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = n - 1;
    else if (event.key === 'Escape') {
      this.hideTip();
      return;
    } else if ((event.key === 'Enter' || event.key === ' ') && current >= 0) {
      event.preventDefault();
      this.select();
      return;
    }
    if (next === null) return;
    event.preventDefault();
    this.active = next;
    this.instance.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: next });
    this.announce(
      `${data.labels[next]}: ${data.series
        .filter((_, i) => !this.hiddenSeries.has(i))
        .map((s) => `${s.name} ${this.format(s.values[next] ?? null)}`)
        .join(', ')}`,
    );
  }

  hideTip() {
    this.active = -1;
    this.instance?.dispatchAction({ type: 'hideTip' });
  }

  /** Fires `vt-select` for the chosen point. */
  select() {
    const data = this.parse().data;
    if (!data || this.active < 0) return;
    emit(this, EVENTS.SELECT, {
      index: this.active,
      label: data.labels[this.active],
      values: Object.fromEntries(data.series.map((s) => [s.name, s.values[this.active] ?? null])),
    });
  }

  /**
   * The data as a table.
   *
   * @param {ChartData} data
   * @returns {HTMLElement}
   */
  table(data) {
    return h(
      'table',
      {
        class: 'data-table',
        part: 'table',
        attrs: { 'aria-label': this.heading || this.t('chartView') },
      },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { attrs: { scope: 'col' }, text: this.getAttribute('x') || '' }),
          ...data.series.map((s) => h('th', { attrs: { scope: 'col' }, text: s.name })),
        ),
      ),
      h(
        'tbody',
        {},
        ...data.labels.map((label, i) =>
          h(
            'tr',
            {},
            h('th', { attrs: { scope: 'row' }, text: label }),
            ...data.series.map((s) => h('td', { text: this.format(s.values[i] ?? null) })),
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------------ editing

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: /^\s*[[{]/.test(this.text ?? '') ? 'json' : 'plaintext',
      lineNumbers: false,
      wrap: false,
      highlightLimit: getConfig().highlightLimit,
      label: this.heading || this.t('editor'),
      placeholder: this.getAttribute('placeholder') ?? undefined,
      onInput: (text) => this.edited(text),
      onChange: (text) => emit(this, EVENTS.CHANGE, { value: text }),
      history: this.editHistory ?? undefined,
    });
    return this.editor;
  }

  contentEdited() {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      this.parsed = null;
      const data = this.parse().data;
      // The chart updates in place, animating to the new values.
      if (data && this.instance) this.instance.setOption(this.option(data), { notMerge: true });
      else this.render();
    }, 250);
  }
}

/**
 * A boolean attribute with a default that depends on the data.
 *
 * @param {VtBase} element
 * @param {string} name
 * @param {boolean} fallback
 * @returns {boolean}
 */
function booleanOr(element, name, fallback) {
  return element.getAttribute(name) === null ? fallback : element.feature(name);
}

/**
 * @param {VtBase} element
 * @param {string} name
 * @returns {number | null}
 */
function numberAttribute(element, name) {
  const value = element.getAttribute(name);
  if (value === null || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
