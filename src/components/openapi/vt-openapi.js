// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import openapiCss from '../../styles/openapi.css?raw';
import { parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { MAX_MATCHES, MAX_QUERY_LENGTH } from '../../core/search.js';
import { iconButton, loadingView, noticeView } from '../../core/ui.js';
import {
  MAX_DEPTH,
  SpecError,
  exampleFor,
  mergeAllOf,
  readSpec,
  refName,
  resolve,
  typeLabel,
} from './spec.js';
import { loadYaml } from './yaml-loader.js';

/** @typedef {import('./spec.js').ApiModel} ApiModel */
/** @typedef {import('./spec.js').Operation} Operation */
/** @typedef {import('./spec.js').Media} Media */
/** @typedef {import('./spec.js').Json} Json */

/**
 * Documents an HTTP API from its OpenAPI description (3.0, 3.1, or Swagger 2.0), in JSON
 * or YAML: endpoints grouped by tag, parameters, request bodies, responses, schemas and
 * generated examples.
 *
 * Every endpoint opens to show its details. With `<vt-http>` on the page, each endpoint
 * also gets an example request and response, with code for curl, fetch, Python and HTTPie.
 * Nothing is ever sent to the API.
 *
 * @element vt-openapi
 * @since 0.8.0
 *
 * @attr {string} tags - Tags shown at first, separated by spaces (default: all).
 * @attr {boolean} expand - Opens every endpoint.
 * @attr {number} server - Index of the server used in examples (default 0).
 * @attr {boolean} examples - Example requests with `<vt-http>` (default on).
 * @attr {boolean} markdown - Descriptions as Markdown with `<vt-markdown>` (default on).
 *
 * @prop {string} content - The OpenAPI document, as JSON or YAML.
 * @prop {object | null} spec - The document read from the content (read-only).
 *
 * @fires vt-select - An endpoint was opened. Detail: `{ method, path, operationId }`.
 *
 * @csspart intro - Description, servers and authentication.
 * @csspart tag - A group of endpoints.
 * @csspart operation - An endpoint.
 * @csspart method - The method badge of an endpoint.
 * @csspart path - The path of an endpoint.
 * @csspart schema - A schema tree.
 *
 * @example
 * <vt-openapi variant="full" src="/openapi.yaml"></vt-openapi>
 */
export class VtOpenapi extends VtBase {
  static type = 'openapi';

  static componentAttributes = Object.freeze([
    'tags', 'expand', 'server', 'examples', 'markdown',
  ]); // prettier-ignore

  static presets = {
    simple: { examples: true, markdown: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      examples: true, markdown: true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, openapiCss];

  constructor() {
    super();
    /** @type {{ text: string, model: ApiModel | null, error: Error | null, pending: boolean } | null} */
    this.parsed = null;
    /** @type {Set<string>} Endpoints opened by the reader. */
    this.opened = new Set();
    /** @type {string | null} Tag chosen with the tag buttons (`null`: the `tags` attribute). */
    this.tagChoice = null;
    this.query = '';
    this.matchCount = 0;
    this.panelId = uid('panel');
    /** @type {HTMLElement | null} */
    this.listHost = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  disconnectedCallback() {
    clearTimeout(this.previewTimer);
    this.editor?.destroy();
    super.disconnectedCallback();
  }

  contentChanged() {
    this.parsed = null;
    this.opened.clear();
  }

  // ------------------------------------------------------------------ model

  /** @returns {{ model: ApiModel | null, error: Error | null, pending: boolean }} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text === text && !this.parsed.pending) return this.parsed;
    const trimmed = text.trim();
    /** @type {unknown} */
    let document;
    try {
      if (!trimmed) {
        this.parsed = { text, model: null, error: null, pending: false };
        return this.parsed;
      }
      if (/^[[{]/.test(trimmed)) document = JSON.parse(trimmed);
      else {
        const yaml = loadYaml();
        if (!yaml.ready || !yaml.parse) {
          yaml.promise.then(
            () => this.requestRender(),
            (error) => {
              this.parsed = {
                text,
                model: null,
                error: new SpecError(
                  this.t('openapiYamlFailed', { message: String(error?.message ?? error) }),
                ),
                pending: false,
              };
              this.requestRender();
            },
          );
          this.parsed = { text, model: null, error: null, pending: true };
          return this.parsed;
        }
        document = yaml.parse(trimmed);
      }
      this.parsed = { text, model: readSpec(document), error: null, pending: false };
    } catch (error) {
      this.parsed = {
        text,
        model: null,
        error: error instanceof Error ? error : new SpecError(String(error)),
        pending: false,
      };
    }
    return this.parsed;
  }

  /** @returns {object | null} */
  get spec() {
    const model = this.parse().model;
    return model ? structuredClone(model.root) : null;
  }

  /** @returns {Set<string> | null} Tags shown, or `null` for all. */
  get shownTags() {
    if (this.tagChoice !== null) return this.tagChoice ? new Set([this.tagChoice]) : null;
    const value = this.getAttribute('tags');
    return value?.trim() ? new Set(value.split(/[\s,]+/)) : null;
  }

  /**
   * @param {Operation} op
   * @returns {boolean}
   */
  visible(op) {
    const tags = this.shownTags;
    if (tags && !op.tags.some((tag) => tags.has(tag))) return false;
    if (!this.query) return true;
    const q = this.query.toLowerCase();
    return [op.method, op.path, op.summary, op.operationId, op.description, ...op.tags].some(
      (value) => value.toLowerCase().includes(q),
    );
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { model, error, pending } = this.parse();
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLElement[]} */
    let extra = [];
    const body = h('div', { class: 'body api-body', part: 'body' });

    if (pending) body.append(loadingView(t));
    else if (error) body.append(noticeView(t('openapiInvalid', { message: error.message })));
    else if (!model) body.append(h('div', { class: 'empty', part: 'empty', text: t('empty') }));
    else {
      body.append(this.intro(model));
      if (model.truncated) body.append(noticeView(t('openapiTruncated')));
      if (model.tags.length > 1) body.append(this.tagBar(model));
      this.listHost = h('div', { class: 'api-groups' });
      body.append(this.listHost);
      this.renderGroups();
    }

    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('api-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        body,
      );
      extra = this.historyButtons(editor);
    } else panel.append(body);

    const target = {
      /** @param {string} query */
      run: (query) => {
        this.query = query.slice(0, MAX_QUERY_LENGTH).trim();
        this.renderGroups();
        return { total: this.matchCount, capped: this.matchCount >= MAX_MATCHES };
      },
      /** @param {number} index */
      go: (index) => {
        const ops = this.listHost?.querySelectorAll('.op') ?? [];
        ops[index]?.scrollIntoView({ block: 'nearest' });
        /** @type {HTMLElement | null} */ (ops[index]?.querySelector('.op-head') ?? null)?.focus({
          preventScroll: true,
        });
      },
      clear: () => {
        this.query = '';
        this.renderGroups();
      },
    };

    const json = /^\s*[[{]/.test(this.text ?? '');
    const actions = [
      this.searchButton(target),
      ...extra,
      model && !this.editing
        ? iconButton({
            icon: 'expand-all',
            label: t('expandAll'),
            key: 'expand-all',
            onClick: () => this.openAll(true),
          })
        : null,
      model && !this.editing
        ? iconButton({
            icon: 'collapse-all',
            label: t('collapseAll'),
            key: 'collapse-all',
            onClick: () => this.openAll(false),
          })
        : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.text ?? '',
            this.downloadName(json ? 'openapi.json' : 'openapi.yaml'),
            json ? 'application/json' : 'application/yaml',
          )
        : null,
      this.feature('copy') ? this.copyButton(() => this.text ?? '', t('copy')) : null,
    ];
    const badge = model
      ? model.apiVersion
        ? `v${model.apiVersion}`
        : `OpenAPI ${model.version}`
      : '';
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /** Header title: the label, else the API title. */
  get heading() {
    return super.heading || this.parse().model?.title || '';
  }

  /**
   * Title, description, servers and authentication.
   *
   * @param {ApiModel} model
   * @returns {HTMLElement}
   */
  intro(model) {
    const t = this.t;
    const intro = h('div', { class: 'api-intro', part: 'intro' });
    const title = h('div', { class: 'api-title' }, h('h2', { text: model.title }));
    if (model.apiVersion) title.append(h('span', { class: 'api-version', text: model.apiVersion }));
    title.append(
      h('span', {
        class: 'api-spec',
        text: `${model.version.startsWith('2') ? 'Swagger' : 'OpenAPI'} ${model.version}`,
      }),
    );
    intro.append(title);
    if (model.description) intro.append(this.prose(model.description));

    const facts = h('dl', { class: 'api-facts' });
    if (model.servers.length) {
      const index = Math.min(
        model.servers.length - 1,
        parseInteger(this.getAttribute('server'), { min: 0, max: 50, fallback: 0 }),
      );
      facts.append(
        h(
          'div',
          {},
          h('dt', { text: t('openapiServers') }),
          h(
            'dd',
            {},
            ...model.servers.map((server, i) =>
              h(
                'span',
                { class: `server${i === index ? ' current' : ''}` },
                h('code', { text: server.url }),
                server.description
                  ? h('span', { class: 'server-note', text: server.description })
                  : null,
              ),
            ),
          ),
        ),
      );
    }
    if (model.securitySchemes.length) {
      facts.append(
        h(
          'div',
          {},
          h('dt', { text: t('openapiAuth') }),
          h(
            'dd',
            {},
            ...model.securitySchemes.map((scheme) =>
              h(
                'span',
                { class: 'auth', attrs: { title: scheme.description || null } },
                icon('lock'),
                h('code', { text: scheme.name }),
                h('span', { class: 'server-note', text: scheme.type }),
              ),
            ),
          ),
        ),
      );
    }
    facts.append(
      h(
        'div',
        {},
        h('dt', { text: t('openapiEndpoints') }),
        h('dd', { text: formatNumber(model.operations.length, this.locale) }),
      ),
    );
    intro.append(facts);
    return intro;
  }

  /**
   * Buttons to show every tag or one.
   *
   * @param {ApiModel} model
   * @returns {HTMLElement}
   */
  tagBar(model) {
    const bar = h('div', {
      class: 'tag-bar',
      attrs: { role: 'group', 'aria-label': this.t('openapiTags') },
    });
    const current = this.tagChoice ?? '';
    const button = (
      /** @type {string} */ name,
      /** @type {string} */ label,
      /** @type {number} */ count,
    ) =>
      h(
        'button',
        {
          class: 'tag-chip',
          attrs: {
            type: 'button',
            'aria-pressed': String(current === name),
            'data-focus-key': `tag-${name}`,
          },
          on: {
            click: () => {
              this.tagChoice = name;
              this.render();
            },
          },
        },
        label,
        h('span', { class: 'chip-count', text: formatNumber(count, this.locale) }),
      );
    bar.append(button('', this.t('openapiAllTags'), model.operations.length));
    for (const tag of model.tags) {
      bar.append(
        button(
          tag.name,
          tag.name,
          model.operations.filter((op) => op.tags.includes(tag.name)).length,
        ),
      );
    }
    return bar;
  }

  /** Renders the endpoint groups for the current tag filter and search. */
  renderGroups() {
    const host = this.listHost;
    const model = this.parse().model;
    if (!host || !model) return;
    this.matchCount = 0;
    const groups = model.tags.length ? model.tags : [{ name: 'default', description: '' }];
    /** @type {HTMLElement[]} */
    const sections = [];
    const placed = new Set();
    for (const tag of groups) {
      const ops = model.operations.filter((op) => op.tags.includes(tag.name) && this.visible(op));
      if (!ops.length) continue;
      const section = h(
        'section',
        { class: 'api-tag', part: 'tag', attrs: { 'aria-label': tag.name } },
        h('h3', { class: 'tag-name', text: tag.name }),
      );
      if (tag.description) section.append(this.prose(tag.description, 'tag-description'));
      for (const op of ops) {
        // An endpoint with several tags is listed in each group, but counted once.
        if (!placed.has(op.key)) {
          placed.add(op.key);
          this.matchCount += 1;
        }
        section.append(this.operation(op, model));
      }
      sections.push(section);
    }
    host.replaceChildren(
      ...(sections.length
        ? sections
        : [h('div', { class: 'empty', part: 'empty', text: this.t('openapiNoMatch') })]),
    );
  }

  /**
   * @param {boolean} open
   */
  openAll(open) {
    const model = this.parse().model;
    if (!model) return;
    if (open) for (const op of model.operations) this.opened.add(op.key);
    else this.opened.clear();
    this.renderGroups();
  }

  /**
   * An endpoint: a header button that opens its details.
   *
   * @param {Operation} op
   * @param {ApiModel} model
   * @returns {HTMLElement}
   */
  operation(op, model) {
    const open = this.opened.has(op.key) || this.feature('expand');
    const detailsId = uid('op');
    const wrapper = h('div', {
      class: `op method-${op.method.toLowerCase()}${op.deprecated ? ' deprecated' : ''}`,
      part: 'operation',
      attrs: { 'data-key': op.key },
    });
    const head = h(
      'button',
      {
        class: 'op-head',
        attrs: { type: 'button', 'aria-expanded': String(open), 'aria-controls': detailsId },
        on: {
          click: () => {
            const next = head.getAttribute('aria-expanded') !== 'true';
            if (next) this.opened.add(op.key);
            else this.opened.delete(op.key);
            head.setAttribute('aria-expanded', String(next));
            const existing = wrapper.querySelector(':scope > .op-details');
            if (next && !existing) wrapper.append(this.details(op, model, detailsId));
            else existing?.toggleAttribute('hidden', !next);
            if (next)
              emit(this, EVENTS.SELECT, {
                method: op.method,
                path: op.path,
                operationId: op.operationId,
              });
          },
        },
      },
      h('span', { class: 'op-method', part: 'method', text: op.method }),
      this.pathNode(op.path),
      h('span', { class: 'op-summary', text: op.summary || op.operationId }),
      op.deprecated ? h('span', { class: 'op-flag', text: this.t('openapiDeprecated') }) : null,
      op.security.length
        ? h('span', { class: 'op-lock', attrs: { title: op.security.join(', ') } }, icon('lock'))
        : null,
      h('span', { class: 'op-chevron', attrs: { 'aria-hidden': 'true' } }, icon('chevron-down')),
    );
    wrapper.append(head);
    // Details are built when the endpoint is opened: large APIs stay fast.
    if (open) wrapper.append(this.details(op, model, detailsId));
    return wrapper;
  }

  /**
   * Path with its `{parameters}` highlighted.
   *
   * @param {string} path
   * @returns {HTMLElement}
   */
  pathNode(path) {
    const node = h('code', { class: 'op-path', part: 'path' });
    let rest = path;
    while (rest) {
      const open = rest.indexOf('{');
      const close = open >= 0 ? rest.indexOf('}', open) : -1;
      if (open < 0 || close < 0) {
        node.append(rest);
        break;
      }
      if (open > 0) node.append(rest.slice(0, open));
      node.append(h('span', { class: 'path-param', text: rest.slice(open, close + 1) }));
      rest = rest.slice(close + 1);
    }
    return node;
  }

  /**
   * Description, parameters, request body, responses and example of an endpoint.
   *
   * @param {Operation} op
   * @param {ApiModel} model
   * @param {string} id
   * @returns {HTMLElement}
   */
  details(op, model, id) {
    const t = this.t;
    const root = model.root;
    const box = h('div', { class: 'op-details', attrs: { id } });
    if (op.description) box.append(this.prose(op.description));

    if (op.parameters.length) {
      const table = h(
        'table',
        { class: 'params', attrs: { 'aria-label': t('openapiParameters') } },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { attrs: { scope: 'col' }, text: t('openapiName') }),
            h('th', { attrs: { scope: 'col' }, text: t('openapiIn') }),
            h('th', { attrs: { scope: 'col' }, text: t('openapiType') }),
            h('th', { attrs: { scope: 'col' }, text: t('openapiDescription') }),
          ),
        ),
        h(
          'tbody',
          {},
          ...op.parameters.map((param) =>
            h(
              'tr',
              { class: param.deprecated ? 'deprecated' : '' },
              h(
                'th',
                { attrs: { scope: 'row' } },
                h('code', { text: param.name }),
                param.required
                  ? h('span', { class: 'required', text: t('openapiRequired') })
                  : null,
              ),
              h('td', { text: param.in }),
              h(
                'td',
                {},
                h('code', {
                  class: 'type',
                  text: param.schema ? typeLabel(root, param.schema) : 'string',
                }),
              ),
              h('td', { text: param.description }),
            ),
          ),
        ),
      );
      box.append(this.section(t('openapiParameters'), table));
    }

    if (op.requestBody) {
      const content = h('div', { class: 'media-list' });
      if (op.requestBody.description) content.append(this.prose(op.requestBody.description));
      for (const media of op.requestBody.content) content.append(this.media(media, root));
      box.append(
        this.section(
          `${t('openapiRequestBody')}${op.requestBody.required ? ` (${t('openapiRequired')})` : ''}`,
          content,
        ),
      );
    }

    if (op.responses.length) {
      const list = h('div', { class: 'responses' });
      for (const response of op.responses) {
        const kind = /^\d/.test(response.status) ? `${response.status[0]}xx` : 'default';
        const item = h('details', { class: `response status-${kind}` });
        item.append(
          h(
            'summary',
            {},
            h('span', { class: `status-code status-${kind}`, text: response.status }),
            h('span', { class: 'response-description', text: firstLine(response.description) }),
          ),
        );
        for (const media of response.content) item.append(this.media(media, root));
        if (!response.content.length) item.append(h('p', { class: 'none', text: t('httpNoBody') }));
        list.append(item);
      }
      box.append(this.section(t('openapiResponses'), list));
    }

    if (this.feature('examples') && customElements.get('vt-http')) {
      const http = document.createElement('vt-http');
      http.setAttribute('variant', 'full');
      http.setAttribute('label', t('openapiExample'));
      http.setAttribute('layout', 'columns');
      if (this.getAttribute('theme'))
        http.setAttribute('theme', /** @type {string} */ (this.getAttribute('theme')));
      /** @type {any} */ (http).exchange = this.exampleExchange(op, model);
      box.append(this.section(t('openapiExample'), http));
    }
    return box;
  }

  /**
   * @param {string} title
   * @param {Node} content
   * @returns {HTMLElement}
   */
  section(title, content) {
    return h('div', { class: 'op-section' }, h('h4', { text: title }), content);
  }

  /**
   * One media type: its schema tree and an example.
   *
   * @param {Media} media
   * @param {Json} root
   * @returns {HTMLElement}
   */
  media(media, root) {
    const box = h(
      'div',
      { class: 'media' },
      h('div', { class: 'media-type' }, h('code', { text: media.type })),
    );
    if (media.schema) {
      const name = refName(media.schema);
      if (name) box.append(h('div', { class: 'schema-name', text: name }));
      box.append(this.schema(root, media.schema, 0, new Set()));
    }
    const example =
      media.example !== undefined
        ? media.example
        : media.schema
          ? exampleFor(root, media.schema)
          : undefined;
    if (example !== undefined && example !== null && /json/i.test(media.type)) {
      const code = document.createElement('vt-code');
      code.setAttribute('language', 'json');
      code.setAttribute('copy', '');
      code.setAttribute('label', this.t('openapiExampleValue'));
      code.setAttribute('header', '');
      code.setAttribute('badge', 'false');
      /** @type {any} */ (code).content = JSON.stringify(example, null, 2);
      box.append(h('div', { class: 'media-example' }, code));
    }
    return box;
  }

  /**
   * A schema as a tree of properties.
   *
   * @param {Json} root
   * @param {unknown} raw
   * @param {number} depth
   * @param {Set<unknown>} seen
   * @returns {HTMLElement}
   */
  schema(root, raw, depth, seen) {
    const resolved = resolve(root, raw);
    const box = h('div', { class: 'schema', part: 'schema' });
    if (!resolved) {
      box.append(h('span', { class: 'type', text: typeLabel(root, raw) }));
      return box;
    }
    if (seen.has(resolved) || depth > MAX_DEPTH) {
      box.append(h('span', { class: 'type recursive', text: `${typeLabel(root, raw)} ↺` }));
      return box;
    }
    const next = new Set(seen).add(resolved);
    const schema = mergeAllOf(root, resolved);
    const itemsSchema =
      schema.type === 'array' || schema.items ? resolve(root, schema.items) : null;
    const target = itemsSchema ? mergeAllOf(root, itemsSchema) : schema;
    const properties =
      target.properties && typeof target.properties === 'object'
        ? Object.entries(target.properties)
        : [];

    if (!properties.length) {
      box.append(h('code', { class: 'type', text: typeLabel(root, raw) }));
      const notes = constraints(schema);
      if (notes) box.append(h('span', { class: 'constraints', text: notes }));
      for (const key of ['oneOf', 'anyOf']) {
        if (Array.isArray(schema[key])) {
          const variants = h('div', { class: 'variants' });
          for (const variant of schema[key].slice(0, 8))
            variants.append(this.schema(root, variant, depth + 1, next));
          box.append(variants);
        }
      }
      return box;
    }
    // Nested schemas already show their type on the property row.
    if (itemsSchema && depth === 0)
      box.append(h('code', { class: 'type', text: typeLabel(root, raw) }));
    const required = new Set(Array.isArray(target.required) ? target.required : []);
    const list = h('ul', { class: 'props' });
    for (const [name, value] of properties.slice(0, 200)) {
      const prop = resolve(root, value) ?? {};
      const nested = mergeAllOf(root, prop);
      const nestedItems = nested.items ? resolve(root, nested.items) : null;
      const hasChildren = Boolean(
        nested.properties || nestedItems?.properties || nestedItems?.allOf,
      );
      const row = h(
        'div',
        { class: 'prop-row' },
        h('code', { class: 'prop-name', text: name }),
        h('code', { class: 'type', text: typeLabel(root, value) }),
        required.has(name)
          ? h('span', { class: 'required', text: this.t('openapiRequired') })
          : null,
        prop.readOnly ? h('span', { class: 'flag', text: 'read-only' }) : null,
        prop.writeOnly ? h('span', { class: 'flag', text: 'write-only' }) : null,
        prop.deprecated ? h('span', { class: 'flag', text: this.t('openapiDeprecated') }) : null,
      );
      const item = h('li', { class: 'prop' });
      if (hasChildren && depth < MAX_DEPTH) {
        // Nested objects open on demand (the first level is open).
        const details = h(
          'details',
          { attrs: { open: depth < 1 ? '' : null } },
          h('summary', {}, row),
        );
        if (prop.description)
          details.append(h('p', { class: 'prop-description', text: prop.description }));
        details.append(this.schema(root, value, depth + 1, next));
        item.append(details);
      } else {
        item.append(row);
        if (prop.description)
          item.append(h('p', { class: 'prop-description', text: prop.description }));
        const notes = constraints(prop);
        if (notes) item.append(h('p', { class: 'constraints', text: notes }));
      }
      list.append(item);
    }
    box.append(list);
    return box;
  }

  /**
   * Example request and response for `<vt-http>`.
   *
   * @param {Operation} op
   * @param {ApiModel} model
   * @returns {object}
   */
  exampleExchange(op, model) {
    const root = model.root;
    const index = Math.min(
      Math.max(0, model.servers.length - 1),
      parseInteger(this.getAttribute('server'), { min: 0, max: 50, fallback: 0 }),
    );
    const server = (model.servers[index]?.url || 'https://api.example.com').replace(/\/$/, '');
    let path = op.path;
    /** @type {string[]} */
    const query = [];
    /** @type {Record<string, string>} */
    const headers = {};
    for (const param of op.parameters) {
      const value = param.example ?? (param.schema ? exampleFor(root, param.schema) : 'value');
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      if (param.in === 'path') path = path.split(`{${param.name}}`).join(encodeURIComponent(text));
      else if (param.in === 'query' && param.required)
        query.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(text)}`);
      else if (param.in === 'header' && param.required) headers[param.name] = text;
    }
    // Authentication placeholders (masked by <vt-http> anyway).
    for (const name of op.security) {
      const scheme = model.securitySchemes.find((s) => s.name === name);
      if (!scheme) continue;
      if (/bearer/i.test(scheme.type) || /OAuth|OpenID/.test(scheme.type))
        headers.Authorization = 'Bearer YOUR_TOKEN';
      else if (/basic/i.test(scheme.type)) headers.Authorization = 'Basic YOUR_CREDENTIALS';
      else {
        const match = /API key in header "([^"]+)"/.exec(scheme.type);
        if (match) headers[match[1]] = 'YOUR_API_KEY';
      }
      break;
    }
    /** @type {string | undefined} */
    let body;
    const media =
      op.requestBody?.content.find((m) => /json/i.test(m.type)) ?? op.requestBody?.content[0];
    if (media) {
      headers['Content-Type'] = media.type;
      const example =
        media.example !== undefined
          ? media.example
          : media.schema
            ? exampleFor(root, media.schema)
            : undefined;
      if (example !== undefined)
        body = typeof example === 'string' ? example : JSON.stringify(example, null, 2);
    }
    const success = op.responses.find((r) => /^2/.test(r.status)) ?? op.responses[0];
    /** @type {Json | null} */
    let response = null;
    if (success) {
      const status = /^\d{3}$/.test(success.status) ? Number(success.status) : 200;
      const out = success.content.find((m) => /json/i.test(m.type)) ?? success.content[0];
      const example = out
        ? out.example !== undefined
          ? out.example
          : out.schema
            ? exampleFor(root, out.schema)
            : undefined
        : undefined;
      response = {
        status,
        headers: out ? { 'Content-Type': out.type } : {},
        body:
          example === undefined
            ? ''
            : typeof example === 'string'
              ? example
              : JSON.stringify(example, null, 2),
      };
    }
    return {
      request: {
        method: op.method,
        url: `${server}${path}${query.length ? `?${query.join('&')}` : ''}`,
        headers,
        body,
      },
      response,
    };
  }

  /**
   * A description: Markdown with `<vt-markdown>` when available, else text.
   *
   * @param {string} text
   * @param {string} [className]
   * @returns {HTMLElement}
   */
  prose(text, className = 'prose') {
    if (this.feature('markdown') && customElements.get('vt-markdown')) {
      const markdown = document.createElement('vt-markdown');
      markdown.className = className;
      // Images in API descriptions are blocked: they could track readers.
      markdown.setAttribute('images', 'block');
      /** @type {any} */ (markdown).content = text;
      return markdown;
    }
    return h('p', { class: `${className} plain`, text });
  }

  // ------------------------------------------------------------------ editing

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    const json = /^\s*[[{]/.test(this.text ?? '');
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: json ? 'json' : 'yaml',
      lineNumbers: true,
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
      this.render();
    }, 400);
  }
}

/**
 * Constraints of a schema as one line: `min 1, max 100, pattern ^[a-z]+$, default "x"`.
 *
 * @param {Json} schema
 * @returns {string}
 */
function constraints(schema) {
  /** @type {string[]} */
  const notes = [];
  const add = (/** @type {string} */ label, /** @type {unknown} */ value) => {
    if (value !== undefined && value !== null)
      notes.push(`${label} ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  };
  add('min', schema.minimum);
  add('max', schema.maximum);
  add('min length', schema.minLength);
  add('max length', schema.maxLength);
  add('min items', schema.minItems);
  add('max items', schema.maxItems);
  add('pattern', schema.pattern);
  if (Array.isArray(schema.enum) && schema.enum.length > 6)
    add('one of', schema.enum.slice(0, 12).join(', '));
  if (schema.default !== undefined) add('default', JSON.stringify(schema.default));
  if (schema.example !== undefined) add('example', JSON.stringify(schema.example));
  return notes.join(', ');
}

/**
 * @param {string} text
 * @returns {string}
 */
function firstLine(text) {
  const line = text.split('\n')[0].trim();
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}
