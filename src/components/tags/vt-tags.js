// @ts-check
import tagsCss from '../../styles/tags.css?raw';
import { parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { fetchContent, isAbortError } from '../../core/content.js';
import { getConfig } from '../../core/config.js';
import { append, h, uid } from '../../core/dom.js';
import { emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { errorView, iconButton } from '../../core/ui.js';
import {
  filterOptions,
  normalizeList,
  normalizeTag,
  parseTagsJson,
  serialize,
  slug,
  splitInput,
  tagKey,
} from './model.js';

/** @typedef {import('./model.js').Tag} Tag */

/** Options listed in the suggestions dropdown. */
const SUGGESTION_LIMIT = 50;
/** Options shown per "page" of the browse panel. */
const BROWSE_PAGE = 200;
/** Delay before asking a backend for suggestions. */
const SUGGEST_DELAY = 250;

/** Events specific to tags. */
export const TAG_EVENTS = Object.freeze({
  CHANGE: 'vt-change',
  ADD: 'vt-tag-add',
  REMOVE: 'vt-tag-remove',
  CREATE: 'vt-tag-create',
  CLICK: 'vt-tag-click',
});

/**
 * Displays, selects and creates tags.
 *
 * Give it JSON — an array of tags, or `{ "value": [...], "options": [...] }` — and it shows
 * them as chips. With `mode="edit"` it becomes a form field: type with autocompletion,
 * use `#tag` syntax, paste lists, pick from a "browse all" panel, create new tags, and
 * get suggestions from a backend. The selection is submitted with the form as JSON.
 *
 * A tag is a string, or an object:
 * `{ value, label, color, group, description, count, kind, href, disabled }`.
 *
 * @element vt-tags
 * @since 0.6.0
 *
 * @attr {string} name - Form field name: the selection is submitted with the form.
 * @attr {"json"|"csv"|"lines"} value-format - Submitted format (default `json`: `["a","b"]`).
 * @attr {boolean} required - The form cannot be submitted without at least one tag.
 * @attr {boolean} disabled - Read-only, and not submitted.
 * @attr {boolean} allow-create - Typed tags that are not in the options can be created (default on).
 * @attr {number} max-tags - Most tags that can be selected.
 * @attr {number} maxlength - Longest tag, in characters (default 50).
 * @attr {number} minlength - Shortest new tag, in characters (default 1).
 * @attr {string} pattern - Regular expression a new tag must match (whole value).
 * @attr {string} separators - Characters that end a tag while typing (default `,;`).
 * @attr {string} prefix - Tag prefix such as `#` or `@`: typing it starts a tag, it is shown
 *   before labels, and whitespace also separates tags.
 * @attr {boolean} case-sensitive - `Design` and `design` are different tags (default off).
 * @attr {string} options-src - URL of a JSON array of options (same-origin unless `allow-remote`).
 * @attr {string} suggest-src - Backend URL for suggestions; `{query}` is replaced by the typed
 *   text, e.g. `/api/tags?q={query}`. Must return a JSON array of tags.
 * @attr {boolean} browse - "Browse all" panel to go through every option. Full variant: on.
 * @attr {boolean} counts - Shows tag counts. Full variant: on.
 * @attr {boolean} clickable - In view mode, tags are buttons firing `vt-tag-click`.
 * @attr {boolean} clear - "Clear all" button in edit mode. Full variant: on.
 * @attr {"chip"|"outline"|"text"} appearance - Tag style (default `chip`).
 *
 * @prop {string[]} value - Selected values. Setting it accepts values, tag objects or JSON.
 * @prop {Tag[]} tags - Selected tags with their details (read-only copy).
 * @prop {Tag[]} options - Available tags. Setting it accepts strings, tag objects or JSON.
 * @prop {(query: string, signal: AbortSignal) => Promise<unknown[]>} suggest - Custom
 *   suggestions provider (for example a call to your API). Takes precedence over `suggest-src`.
 *
 * @fires vt-change - The selection changed. Detail: `{ value, added, removed }`.
 * @fires vt-tag-add - A tag was added. Detail: `{ tag }`.
 * @fires vt-tag-remove - A tag was removed. Detail: `{ tag }`.
 * @fires vt-tag-create - A new tag is about to be created; `preventDefault()` refuses it. Detail: `{ tag }`.
 * @fires vt-tag-click - A tag was activated in view mode (`clickable`). Detail: `{ tag }`.
 *
 * @cssprop --vt-tag-bg - Tag background.
 * @cssprop --vt-tag-fg - Tag text color.
 * @cssprop --vt-tag-border - Tag border color.
 * @cssprop --vt-tag-radius - Tag corner radius (default: fully rounded).
 * @cssprop --vt-tag-height - Tag height (default 26px).
 * @cssprop --vt-tag-gap - Space between tags (default 6px).
 * @cssprop --vt-tag-font-size - Tag font size (default 13px).
 *
 * @csspart tags - The list of tags.
 * @csspart tag - A tag. Each tag also has `tag-<value>` (e.g. `tag-urgent`) and, when it has
 *   a kind, `tag-kind-<kind>` parts, so single tags can be styled from the page.
 * @csspart tag-label - Text of a tag.
 * @csspart tag-count - Count of a tag.
 * @csspart tag-remove - Remove button of a tag.
 * @csspart field - The editable area (tags and input).
 * @csspart input - The text input.
 * @csspart listbox - Suggestions list.
 * @csspart option - A suggestion. The highlighted one also has `option-active`.
 * @csspart browse-panel - The "browse all" panel.
 * @csspart tags-status - Count and messages under the field.
 * @csspart group - Group heading in the suggestions list.
 * @csspart browse-button - "Browse all tags" button.
 * @csspart clear-button - "Remove all tags" button.
 *
 * @example
 * <form>
 *   <vt-tags name="topics" mode="edit" prefix="#" variant="full">
 *     <template>{ "value": ["design"], "options": ["design", "research", "a11y"] }</template>
 *   </vt-tags>
 * </form>
 */
export class VtTags extends VtBase {
  static type = 'tags';

  static formAssociated = true;

  static componentAttributes = Object.freeze([
    'name', 'value-format', 'required', 'disabled', 'allow-create', 'max-tags', 'maxlength',
    'minlength', 'pattern', 'separators', 'prefix', 'case-sensitive', 'options-src', 'suggest-src', 'browse',
    'counts', 'clickable', 'clear', 'appearance',
  ]); // prettier-ignore

  static presets = {
    simple: { 'allow-create': true },
    full: {
      header: true, dot: true, copy: true, browse: true, counts: true, clear: true,
      fullscreen: true, 'allow-create': true,
    },
  }; // prettier-ignore

  static styles = [tagsCss];

  static allowEmpty = true;

  static upgradeProperties = ['content', 'value', 'options', 'suggest'];

  constructor() {
    super();
    /** @type {ElementInternals | null} */
    this.internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    /** @type {Tag[]} */
    this.selected = [];
    /** @type {Tag[]} Selection given by the content, restored on form reset. */
    this.initial = [];
    /** @type {Tag[]} */
    this.contentOptions = [];
    /** @type {Tag[]} */
    this.propertyOptions = [];
    /** @type {Tag[]} */
    this.remoteOptions = [];
    /** @type {Tag[]} */
    this.createdOptions = [];
    /** @type {Tag[]} */
    this.suggestions = [];
    /** @type {unknown} */
    this.dataError = null;
    this.query = '';
    this.listOpen = false;
    this.activeIndex = -1;
    this.browseOpen = false;
    this.browseQuery = '';
    this.browseLimit = BROWSE_PAGE;
    this.formDisabled = false;
    this.removeArmed = false;
    /** @type {((query: string, signal: AbortSignal) => Promise<unknown[]>) | null} */
    this._suggest = null;
    /** @type {AbortController | null} */
    this.suggestAbort = null;
    /** @type {AbortController | null} */
    this.optionsAbort = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.suggestTimer = undefined;
    this.listId = uid('listbox');
    this.hintId = uid('hint');
    /**
     * Pieces updated in place while typing.
     * @type {{ field: HTMLElement | null, chips: HTMLElement | null, input: HTMLInputElement | null, list: HTMLElement | null, status: HTMLElement | null, browse: HTMLElement | null }}
     */
    this.parts = { field: null, chips: null, input: null, list: null, status: null, browse: null };
    this.message = '';
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.messageTimer = undefined;
  }

  // ------------------------------------------------------------------ properties

  /** @returns {string[]} */
  get value() {
    return this.selected.map((tag) => tag.value);
  }

  set value(input) {
    const list = typeof input === 'string' ? safeJson(input) : input;
    this.selected = normalizeList(list, this.caseSensitive).map(
      (tag) => this.findOption(tag.value) ?? tag,
    );
    this.updateForm();
    if (this._connected) this.refresh();
  }

  /** @returns {Tag[]} */
  get tags() {
    return this.selected.map((tag) => ({ ...tag }));
  }

  /** @returns {Tag[]} */
  get options() {
    return this.allOptions().map((tag) => ({ ...tag }));
  }

  set options(input) {
    const list = typeof input === 'string' ? safeJson(input) : input;
    this.propertyOptions = normalizeList(list, this.caseSensitive);
    if (this._connected) this.refresh();
  }

  get suggest() {
    return this._suggest;
  }

  set suggest(fn) {
    this._suggest = typeof fn === 'function' ? fn : null;
  }

  /** @returns {boolean} */
  get caseSensitive() {
    return parseBoolean(this.getAttribute('case-sensitive')) === true;
  }

  /** @returns {string} */
  get prefix() {
    return (this.getAttribute('prefix') ?? '').trim().slice(0, 3);
  }

  /** @returns {boolean} */
  get editable() {
    return (
      this.editing && !this.formDisabled && parseBoolean(this.getAttribute('disabled')) !== true
    );
  }

  /** @returns {number} */
  get maxTags() {
    return parseInteger(this.getAttribute('max-tags'), {
      min: 1,
      max: 100_000,
      fallback: Infinity,
    });
  }

  // ------------------------------------------------------------------ data

  /** Content (JSON) changed: read the selection and options it contains. */
  contentChanged() {
    this.dataError = null;
    try {
      const { value, options } = parseTagsJson(this.text ?? '', this.caseSensitive);
      this.contentOptions = options;
      this.selected = value.map((tag) => this.findOption(tag.value) ?? tag);
      this.initial = [...this.selected];
    } catch (error) {
      this.dataError = error;
      this.selected = [];
      this.contentOptions = [];
      // Report it like any other content error (vt-error, never vt-ready).
      queueMicrotask(() => this.setError(new Error(this.t('invalidTags'), { cause: error })));
    }
    this.updateForm();
  }

  /** @returns {Tag[]} Every known option, without duplicates, in a stable order. */
  allOptions() {
    const seen = new Set();
    /** @type {Tag[]} */
    const all = [];
    for (const list of [
      this.propertyOptions,
      this.contentOptions,
      this.remoteOptions,
      this.createdOptions,
    ]) {
      for (const tag of list) {
        const key = tagKey(tag.value, this.caseSensitive);
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(tag);
      }
    }
    return all;
  }

  /**
   * @param {string} value
   * @returns {Tag | undefined}
   */
  findOption(value) {
    const key = tagKey(value, this.caseSensitive);
    const match = (/** @type {Tag} */ tag) =>
      tagKey(tag.value, this.caseSensitive) === key ||
      tagKey(tag.label, this.caseSensitive) === key;
    return this.allOptions().find(match) ?? this.suggestions.find(match);
  }

  /**
   * @param {Tag} tag
   * @returns {boolean}
   */
  isSelected(tag) {
    const key = tagKey(tag.value, this.caseSensitive);
    return this.selected.some((t) => tagKey(t.value, this.caseSensitive) === key);
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadOptions();
  }

  disconnectedCallback() {
    this.suggestAbort?.abort();
    this.optionsAbort?.abort();
    clearTimeout(this.suggestTimer);
    super.disconnectedCallback();
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'options-src' && oldValue !== newValue && this._connected) this.loadOptions();
    if (name === 'value-format' || name === 'required') this.updateForm();
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  /** Loads `options-src`, with the same rules as `src`. */
  loadOptions() {
    this.optionsAbort?.abort();
    const src = this.getAttribute('options-src');
    if (!src) return;
    const controller = new AbortController();
    this.optionsAbort = controller;
    const config = getConfig();
    fetchContent(src, {
      allowRemote: parseBoolean(this.getAttribute('allow-remote')) === true,
      maxSize: config.maxSize,
      timeout: config.fetchTimeout,
      signal: controller.signal,
    }).then(
      (text) => {
        this.remoteOptions = normalizeList(safeJson(text), this.caseSensitive);
        this.refresh();
      },
      (error) => {
        if (!isAbortError(error)) console.warn('[vitrine] Could not load options-src.', error);
      },
    );
  }

  // ------------------------------------------------------------------ form

  /** Updates the submitted value and the validity of the form field. */
  updateForm() {
    if (!this.internals) return;
    const format = parseEnum(
      this.getAttribute('value-format'),
      /** @type {const} */ (['json', 'csv', 'lines']),
      'json',
    );
    const disabled = parseBoolean(this.getAttribute('disabled')) === true;
    this.internals.setFormValue(disabled ? null : serialize(this.selected, format));
    if (parseBoolean(this.getAttribute('required')) === true && !this.selected.length) {
      this.internals.setValidity(
        { valueMissing: true },
        this.t('tagsRequired'),
        this.parts.input ?? undefined,
      );
    } else {
      this.internals.setValidity({});
    }
  }

  formResetCallback() {
    this.selected = [...this.initial];
    this.updateForm();
    this.refresh();
  }

  /** @param {boolean} disabled */
  formDisabledCallback(disabled) {
    this.formDisabled = disabled;
    this.requestRender();
  }

  // ------------------------------------------------------------------ changes

  /**
   * Adds a tag (already normalized). Returns a reason when refused.
   *
   * @param {Tag} tag
   * @returns {string | null}
   */
  addTag(tag) {
    if (tag.disabled) return 'tagDisabled';
    if (this.isSelected(tag)) return 'tagDuplicate';
    if (this.selected.length >= this.maxTags) return 'tagLimit';
    this.selected = [...this.selected, tag];
    emit(this, TAG_EVENTS.ADD, { tag: { ...tag } });
    this.changed([tag], []);
    return null;
  }

  /**
   * @param {Tag} tag
   */
  removeTag(tag) {
    if (tag.disabled) return;
    const key = tagKey(tag.value, this.caseSensitive);
    const before = this.selected.length;
    this.selected = this.selected.filter((t) => tagKey(t.value, this.caseSensitive) !== key);
    if (this.selected.length === before) return;
    emit(this, TAG_EVENTS.REMOVE, { tag: { ...tag } });
    this.changed([], [tag]);
  }

  /**
   * @param {Tag} tag
   */
  toggleTag(tag) {
    if (this.isSelected(tag)) this.removeTag(tag);
    else this.report(this.addTag(tag), tag.label);
  }

  /** Removes every removable tag. */
  clearAll() {
    const removed = this.selected.filter((tag) => !tag.disabled);
    if (!removed.length) return;
    this.selected = this.selected.filter((tag) => tag.disabled);
    for (const tag of removed) emit(this, TAG_EVENTS.REMOVE, { tag: { ...tag } });
    this.changed([], removed);
  }

  /**
   * @param {Tag[]} added
   * @param {Tag[]} removed
   */
  changed(added, removed) {
    this.removeArmed = false;
    this.updateForm();
    emit(this, TAG_EVENTS.CHANGE, {
      value: this.value,
      added: added.map((t) => ({ ...t })),
      removed: removed.map((t) => ({ ...t })),
    });
    if (added.length === 1) this.announce(this.t('tagAdded', { tag: added[0].label }));
    else if (removed.length === 1) this.announce(this.t('tagRemoved', { tag: removed[0].label }));
    this.refresh();
  }

  /**
   * Adds every tag found in typed or pasted text.
   *
   * @param {string} text
   */
  addFromText(text) {
    const separators = this.getAttribute('separators') ?? ',;';
    for (const part of splitInput(text, { separators, prefix: this.prefix })) {
      const existing = this.findOption(part);
      this.report(existing ? this.addTag(existing) : this.create(part), part);
    }
  }

  /**
   * Creates a new tag from text, if allowed and valid.
   *
   * @param {string} text
   * @returns {string | null} Refusal reason.
   */
  create(text) {
    if (!this.feature('allow-create')) return 'tagNotAllowed';
    const value = text.trim();
    const max = parseInteger(this.getAttribute('maxlength'), { min: 1, max: 200, fallback: 50 });
    const min = parseInteger(this.getAttribute('minlength'), { min: 1, max: 200, fallback: 1 });
    if (value.length > max) return 'tagTooLong';
    if (value.length < min) return 'tagInvalid';
    const pattern = this.compiledPattern();
    if (pattern && !pattern.test(value)) return 'tagInvalid';
    const tag = normalizeTag(value);
    if (!tag) return 'tagInvalid';
    const allowed = emit(this, TAG_EVENTS.CREATE, { tag: { ...tag } });
    if (!allowed) return 'tagRefused';
    const reason = this.addTag(tag);
    if (!reason) this.createdOptions.push(tag);
    return reason;
  }

  /** @returns {RegExp | null} The `pattern` attribute, anchored like an input pattern. */
  compiledPattern() {
    const source = this.getAttribute('pattern');
    if (!source || source.length > 500) return null;
    try {
      return new RegExp(`^(?:${source})$`, 'u');
    } catch {
      console.warn('[vitrine] Invalid pattern attribute on <vt-tags>.');
      return null;
    }
  }

  /**
   * Announces why a tag was refused.
   *
   * @param {string | null} reason
   * @param {string} label
   */
  report(reason, label) {
    if (!reason) return;
    const t = this.t;
    const message =
      reason === 'tagLimit'
        ? t('tagLimit', { max: formatNumber(this.maxTags, this.locale) })
        : t(/** @type {any} */ (reason), { tag: label });
    this.announce(message);
    this.showMessage(message);
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    if (this.dataError) {
      frame.append(...this.chrome(null), errorView(this.t('errorTitle'), this.t('invalidTags')));
      return;
    }
    const editable = this.editable;
    frame.classList.toggle('tags-editing', editable);
    const body = h('div', { class: 'tags-body', part: 'body' });
    this.parts.chips = this.renderChips();
    if (editable) {
      const input = this.renderInput();
      this.parts.input = input;
      this.parts.field = h(
        'div',
        {
          class: 'field',
          part: 'field',
          on: { click: (event) => event.target === this.parts.field && input.focus() },
        },
        this.parts.chips,
        input,
      );
      this.parts.list = h('ul', {
        class: 'listbox',
        part: 'listbox',
        attrs: {
          id: this.listId,
          role: 'listbox',
          'aria-multiselectable': 'true',
          'aria-label': this.t('suggestions'),
        },
      });
      // Keep focus in the input while clicking options.
      this.parts.list.addEventListener('pointerdown', (event) => event.preventDefault());
      this.parts.status = h('div', {
        class: 'tags-status',
        part: 'tags-status',
        attrs: { id: this.hintId },
      });
      body.append(this.parts.field, this.parts.list, this.parts.status);
      if (this.browseOpen) {
        this.parts.browse = this.renderBrowse();
        body.append(this.parts.browse);
      }
    } else {
      this.parts.field = null;
      this.parts.input = null;
      this.parts.list = null;
      body.append(this.parts.chips);
    }
    const actions = [
      editable && this.feature('browse') && this.allOptions().length
        ? iconButton({
            icon: 'list',
            label: this.t('browseTags'),
            key: 'browse',
            part: 'browse-button',
            pressed: this.browseOpen,
            onClick: () => {
              this.browseOpen = !this.browseOpen;
              this.render();
            },
          })
        : null,
      editable && this.feature('clear')
        ? iconButton({
            icon: 'close',
            label: this.t('clearTags'),
            key: 'clear',
            part: 'clear-button',
            onClick: () => this.clearAll(),
          })
        : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('copy')
        ? this.copyButton(() => serialize(this.selected, 'json'), this.t('copy'))
        : null,
    ];
    frame.append(...this.chrome({ badge: '', actions }), body);
    this.updateList();
    this.updateStatus();
  }

  /** Updates chips, suggestions and status in place (focus and caret stay in the input). */
  refresh() {
    if (!this.parts.chips || !this.isConnected) {
      this.requestRender();
      return;
    }
    const chips = this.renderChips();
    this.parts.chips.replaceWith(chips);
    this.parts.chips = chips;
    this.updateList();
    this.updateStatus();
    if (this.parts.browse) {
      const browse = this.renderBrowse();
      this.parts.browse.replaceWith(browse);
      this.parts.browse = browse;
    }
  }

  /** @returns {HTMLElement} */
  renderChips() {
    const editable = this.editable;
    const clickable = !editable && this.feature('clickable');
    const list = h('ul', {
      class: `tag-list appearance-${this.appearance}`,
      part: 'tags',
      attrs: { role: 'list', 'aria-label': this.heading || this.t('tags') },
    });
    this.selected.forEach((tag, index) =>
      list.append(this.renderChip(tag, index, editable, clickable)),
    );
    if (!this.selected.length && !editable)
      list.append(h('li', { class: 'tags-empty', text: this.t('noTags') }));
    return list;
  }

  /** @returns {string} */
  get appearance() {
    return parseEnum(
      this.getAttribute('appearance'),
      /** @type {const} */ (['chip', 'outline', 'text']),
      'chip',
    );
  }

  /**
   * @param {Tag} tag
   * @param {number} index
   * @param {boolean} editable
   * @param {boolean} clickable
   * @returns {HTMLElement}
   */
  renderChip(tag, index, editable, clickable) {
    const parts = ['tag', `tag-${slug(tag.value) || 'x'}`];
    if (tag.kind) parts.push(`tag-kind-${tag.kind}`);
    const chip = h('li', {
      class: `tag${tag.color ? ' colored' : ''}${tag.disabled ? ' disabled' : ''}${this.removeArmed && index === this.selected.length - 1 ? ' armed' : ''}`,
      part: parts.join(' '),
      attrs: { 'data-value': tag.value, title: tag.description ?? null },
    });
    if (tag.color) chip.style.setProperty('--_tag-color', tag.color);
    const label = h(
      'span',
      { class: 'tag-label', part: 'tag-label' },
      this.prefix ? h('span', { class: 'tag-prefix', text: this.prefix }) : null,
      tag.label,
    );
    if (!editable && tag.href) {
      const link = h('a', { class: 'tag-link', attrs: { href: tag.href } }, label);
      if (!/^(?:#|\/(?!\/))/.test(tag.href)) link.setAttribute('rel', 'noopener noreferrer');
      chip.append(link);
    } else if (clickable) {
      chip.append(
        h(
          'button',
          {
            class: 'tag-button',
            attrs: { type: 'button' },
            on: { click: () => emit(this, TAG_EVENTS.CLICK, { tag: { ...tag } }) },
          },
          label,
        ),
      );
    } else {
      chip.append(label);
    }
    if (tag.count !== undefined && this.feature('counts')) {
      chip.append(
        h('span', {
          class: 'tag-count',
          part: 'tag-count',
          text: formatNumber(tag.count, this.locale),
        }),
      );
    }
    if (editable && !tag.disabled) {
      const remove = iconButton({
        icon: 'close',
        label: this.t('removeTag', { tag: tag.label }),
        key: `remove-${index}`,
        part: 'tag-remove',
        onClick: () => {
          this.removeTag(tag);
          this.parts.input?.focus();
        },
      });
      remove.classList.add('tag-remove');
      chip.append(remove);
    }
    return chip;
  }

  /** @returns {HTMLInputElement} */
  renderInput() {
    const t = this.t;
    const full = this.selected.length >= this.maxTags;
    const input = h('input', {
      class: 'tag-input',
      part: 'input',
      attrs: {
        type: 'text',
        role: 'combobox',
        'aria-autocomplete': 'list',
        'aria-expanded': 'false',
        'aria-controls': this.listId,
        'aria-describedby': this.hintId,
        'aria-label': this.heading || t('addTag'),
        placeholder: full
          ? t('tagLimit', { max: formatNumber(this.maxTags, this.locale) })
          : (this.getAttribute('placeholder') ??
            (this.prefix ? `${this.prefix}${t('tagPlaceholder')}` : t('addTag'))),
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        enterkeyhint: 'enter',
        maxlength: 2000,
        'data-focus-key': 'tag-input',
      },
    });
    input.value = this.query;
    input.addEventListener('input', () => this.onInput(input));
    input.addEventListener('keydown', (event) => this.onKeyDown(event, input));
    input.addEventListener('paste', (event) => {
      const pasted = event.clipboardData?.getData('text') ?? '';
      const separators =
        (this.getAttribute('separators') ?? ',;') + '\n' + (this.prefix ? ' \t' : '');
      if (![...separators].some((c) => pasted.includes(c))) return;
      event.preventDefault();
      this.addFromText(input.value + pasted);
      input.value = '';
      this.query = '';
      this.refresh();
    });
    input.addEventListener('focus', () => this.open());
    input.addEventListener('blur', () => {
      this.listOpen = false;
      this.removeArmed = false;
      this.updateList();
    });
    return input;
  }

  // ------------------------------------------------------------------ typing

  /**
   * @param {HTMLInputElement} input
   */
  onInput(input) {
    let value = input.value;
    const separators = this.getAttribute('separators') ?? ',;';
    // A separator (or a space after "#tag") completes the tags typed so far.
    const enders = this.prefix ? `${separators} \t` : separators;
    const last = value.slice(-1);
    if (last && enders.includes(last) && value.trim().length > 1) {
      this.addFromText(value);
      value = '';
      input.value = '';
    }
    this.query = value;
    this.removeArmed = false;
    // While typing, the best match is highlighted so Enter picks it.
    this.activeIndex = value.trim() ? 0 : -1;
    this.open();
    this.requestSuggestions();
  }

  /**
   * @param {KeyboardEvent} event
   * @param {HTMLInputElement} input
   */
  onKeyDown(event, input) {
    const items = this.listItems();
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        this.listOpen = true;
        if (!items.length) {
          this.updateList();
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.activeIndex =
          (this.activeIndex + step + items.length + (this.activeIndex < 0 && step < 0 ? 1 : 0)) %
          items.length;
        this.updateList();
        return;
      }
      case 'Home':
      case 'End':
        if (!this.listOpen || !items.length || input.value) return;
        event.preventDefault();
        this.activeIndex = event.key === 'Home' ? 0 : items.length - 1;
        this.updateList();
        return;
      case 'Enter': {
        if (event.isComposing) return;
        const item = items[this.activeIndex];
        if (item || input.value.trim()) event.preventDefault();
        if (item) this.choose(item);
        else if (input.value.trim()) {
          this.addFromText(input.value);
          input.value = '';
          this.query = '';
          this.refresh();
        }
        return;
      }
      case 'Escape':
        if (this.listOpen) {
          event.preventDefault();
          this.listOpen = false;
          this.updateList();
        } else if (input.value) {
          event.preventDefault();
          input.value = '';
          this.query = '';
          this.refresh();
        }
        return;
      case 'Backspace':
        if (input.value || !this.selected.length) return;
        // First press highlights the last tag, second press removes it.
        event.preventDefault();
        if (this.removeArmed) this.removeTag(this.selected[this.selected.length - 1]);
        else {
          this.removeArmed = true;
          this.announce(
            this.t('pressAgainToRemove', { tag: this.selected[this.selected.length - 1].label }),
          );
          this.refresh();
        }
        return;
      default:
    }
  }

  /** Opens the suggestions list. */
  open() {
    this.listOpen = true;
    this.updateList();
  }

  /**
   * @typedef {{ type: "option", tag: Tag } | { type: "create", text: string }} ListItem
   */

  /**
   * What the user typed, without the typing prefix ("#"): the prefix is never part of a tag.
   *
   * @returns {string}
   */
  typedQuery() {
    const query = this.query.trim();
    return this.prefix && query.startsWith(this.prefix) ? query.slice(this.prefix.length) : query;
  }

  /** @returns {ListItem[]} Items of the suggestions list, in order. */
  listItems() {
    const query = this.typedQuery();
    const local = filterOptions(this.allOptions(), query, SUGGESTION_LIMIT).tags;
    const seen = new Set(local.map((tag) => tagKey(tag.value, this.caseSensitive)));
    const remote = this.suggestions.filter(
      (tag) => !seen.has(tagKey(tag.value, this.caseSensitive)),
    );
    /** @type {ListItem[]} */
    const items = [...local, ...remote]
      .slice(0, SUGGESTION_LIMIT)
      .map((tag) => ({ type: 'option', tag }));
    // Existing tags first; creating a new one is the last choice.
    if (query && this.feature('allow-create') && !this.findOption(query)) {
      items.push({ type: 'create', text: query });
    }
    return items;
  }

  /**
   * @param {ListItem} item
   */
  choose(item) {
    if (item.type === 'create') this.report(this.create(item.text), item.text);
    else this.toggleTag(item.tag);
    if (this.parts.input) {
      this.parts.input.value = '';
      this.query = '';
    }
    this.activeIndex = -1;
    this.refresh();
  }

  /** Re-renders the suggestions list. */
  updateList() {
    const list = this.parts.list;
    const input = this.parts.input;
    if (!list || !input) return;
    const items = this.listOpen ? this.listItems() : [];
    if (this.activeIndex >= items.length) this.activeIndex = items.length - 1;
    list.replaceChildren();
    /** @type {string | null} */
    let group = null;
    items.forEach((item, index) => {
      if (item.type === 'option' && item.tag.group && item.tag.group !== group) {
        group = item.tag.group;
        list.append(
          h('li', {
            class: 'group-label',
            part: 'group',
            attrs: { role: 'presentation' },
            text: group,
          }),
        );
      }
      list.append(this.renderOption(item, index));
    });
    const open = items.length > 0;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    const active = list.querySelector('[data-active]');
    if (active) {
      input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  /**
   * @param {ListItem} item
   * @param {number} index
   * @returns {HTMLElement}
   */
  renderOption(item, index) {
    const active = index === this.activeIndex;
    const li = h('li', {
      class: `option${item.type === 'create' ? ' create' : ''}`,
      part: active ? 'option option-active' : 'option',
      attrs: {
        id: `${this.listId}-${index}`,
        role: 'option',
        'aria-selected': item.type === 'option' ? String(this.isSelected(item.tag)) : 'false',
        'aria-disabled': item.type === 'option' && item.tag.disabled ? 'true' : null,
        'data-active': active ? '' : null,
      },
      on: { click: () => this.choose(item) },
    });
    if (item.type === 'create') {
      li.append(
        icon('pencil'),
        h('span', { text: this.t('createTag', { tag: `${this.prefix}${item.text}` }) }),
      );
      return li;
    }
    const tag = item.tag;
    append(li, [
      h(
        'span',
        { class: 'check', attrs: { 'aria-hidden': 'true' } },
        this.isSelected(tag) ? icon('check') : null,
      ),
      tag.color ? h('span', { class: 'swatch', attrs: { 'aria-hidden': 'true' } }) : null,
      h(
        'span',
        { class: 'option-text' },
        h('span', { class: 'option-label', text: `${this.prefix}${tag.label}` }),
        tag.description ? h('span', { class: 'option-description', text: tag.description }) : null,
      ),
      tag.count !== undefined && this.feature('counts')
        ? h('span', { class: 'option-count', text: formatNumber(tag.count, this.locale) })
        : null,
    ]);
    if (tag.color) li.style.setProperty('--_tag-color', tag.color);
    return li;
  }

  /** Status under the field: count, limit, last message. */
  updateStatus() {
    const status = this.parts.status;
    if (!status) return;
    const count = formatNumber(this.selected.length, this.locale);
    const text = Number.isFinite(this.maxTags)
      ? this.t('tagCountMax', { count, max: formatNumber(this.maxTags, this.locale) })
      : this.t(this.selected.length === 1 ? 'tagCountOne' : 'tagCount', { count });
    status.replaceChildren();
    append(status, [
      h('span', { text }),
      this.message ? h('span', { class: 'tags-message', text: this.message }) : null,
    ]);
    const input = this.parts.input;
    if (input) {
      const full = this.selected.length >= this.maxTags;
      input.readOnly = full;
    }
  }

  /**
   * Shows a short message in the status line.
   *
   * @param {string} message
   */
  showMessage(message) {
    this.message = message;
    clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => {
      this.message = '';
      this.updateStatus();
    }, 4000);
    this.updateStatus();
  }

  /** Asks the backend (or the `suggest` function) for suggestions, debounced. */
  requestSuggestions() {
    clearTimeout(this.suggestTimer);
    this.suggestAbort?.abort();
    // The prefix ("#") is typing syntax, not part of the tag: never send it.
    const query = this.typedQuery();
    const src = this.getAttribute('suggest-src');
    if (!query || (!this._suggest && !src)) {
      if (this.suggestions.length) {
        this.suggestions = [];
        this.updateList();
      }
      return;
    }
    this.suggestTimer = setTimeout(async () => {
      const controller = new AbortController();
      this.suggestAbort = controller;
      try {
        /** @type {unknown} */
        let data;
        if (this._suggest) data = await this._suggest(query, controller.signal);
        else {
          const url = (src ?? '').replace(/\{query\}/g, encodeURIComponent(query));
          const config = getConfig();
          data = safeJson(
            await fetchContent(url, {
              allowRemote: parseBoolean(this.getAttribute('allow-remote')) === true,
              maxSize: Math.min(config.maxSize, 2_000_000),
              timeout: config.fetchTimeout,
              signal: controller.signal,
            }),
          );
        }
        if (controller.signal.aborted || !this.query.trim().endsWith(query)) return;
        this.suggestions = normalizeList(data, this.caseSensitive).slice(0, SUGGESTION_LIMIT);
        this.updateList();
      } catch (error) {
        if (!isAbortError(error)) console.warn('[vitrine] Tag suggestions failed.', error);
      }
    }, SUGGEST_DELAY);
  }

  // ------------------------------------------------------------------ browse

  /** @returns {HTMLElement} The "browse all" panel: filter, groups, checkboxes. */
  renderBrowse() {
    const t = this.t;
    const { tags, total } = filterOptions(this.allOptions(), this.browseQuery, this.browseLimit);
    const filter = h('input', {
      class: 'browse-filter',
      attrs: {
        type: 'search',
        placeholder: t('filterTags'),
        'aria-label': t('filterTags'),
        'data-focus-key': 'browse-filter',
        autocomplete: 'off',
      },
    });
    filter.value = this.browseQuery;
    filter.addEventListener('input', () => {
      this.browseQuery = filter.value;
      this.browseLimit = BROWSE_PAGE;
      const fresh = this.renderBrowse();
      this.parts.browse?.replaceWith(fresh);
      this.parts.browse = fresh;
      /** @type {HTMLInputElement | null} */ (fresh.querySelector('.browse-filter'))?.focus();
      const field = /** @type {HTMLInputElement | null} */ (fresh.querySelector('.browse-filter'));
      field?.setSelectionRange(field.value.length, field.value.length);
    });
    const groups = new Map();
    const named = tags.some((tag) => tag.group);
    for (const tag of tags) {
      // Without a group, a tag goes under "Other" when other tags have groups.
      const key = tag.group ?? (named ? t('otherTags') : '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(tag);
    }
    const other = t('otherTags');
    if (named && groups.has(other)) {
      const rest = groups.get(other);
      groups.delete(other);
      groups.set(other, rest);
    }
    const lists = [];
    for (const [group, groupTags] of groups) {
      const list = h('div', {
        class: 'browse-group',
        attrs: { role: 'group', 'aria-label': group || t('tags') },
      });
      if (group) list.append(h('div', { class: 'group-label', text: group }));
      for (const tag of groupTags) {
        const box = h('input', {
          attrs: {
            type: 'checkbox',
            disabled:
              tag.disabled || (!this.isSelected(tag) && this.selected.length >= this.maxTags),
          },
        });
        box.checked = this.isSelected(tag);
        box.addEventListener('change', () => this.toggleTag(tag));
        const row = h(
          'label',
          { class: 'browse-option' },
          box,
          tag.color ? h('span', { class: 'swatch', attrs: { 'aria-hidden': 'true' } }) : null,
          h('span', { class: 'option-label', text: `${this.prefix}${tag.label}` }),
          tag.count !== undefined && this.feature('counts')
            ? h('span', { class: 'option-count', text: formatNumber(tag.count, this.locale) })
            : null,
        );
        if (tag.color) row.style.setProperty('--_tag-color', tag.color);
        list.append(row);
      }
      lists.push(list);
    }
    const more =
      total > tags.length
        ? h('button', {
            class: 'text-btn',
            text: t('showMoreItems', {
              count: formatNumber(Math.min(BROWSE_PAGE, total - tags.length), this.locale),
            }),
            attrs: { type: 'button' },
            on: {
              click: () => {
                this.browseLimit += BROWSE_PAGE;
                this.refresh();
              },
            },
          })
        : null;
    return h(
      'div',
      { class: 'browse', part: 'browse-panel' },
      h(
        'div',
        { class: 'browse-head' },
        filter,
        h('span', {
          class: 'browse-count',
          text: t('tagsFound', { count: formatNumber(total, this.locale) }),
        }),
      ),
      h(
        'div',
        { class: 'browse-list' },
        ...lists,
        tags.length ? null : h('p', { class: 'tags-empty', text: t('noTags') }),
      ),
      more,
    );
  }
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}
