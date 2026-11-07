// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import boardCss from '../../styles/board.css?raw';
import { parseBoolean, parseEnum } from '../../core/attributes.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { createTabs, iconButton } from '../../core/ui.js';
import { initials } from '../../core/data.js';
import { BoardDrag } from './drag.js';
import {
  KNOWN,
  PRIORITIES,
  addTask,
  filterTasks,
  moveTask,
  newId,
  parseBoard,
  readPriority,
  removeTask,
  serializeBoard,
  statusKey,
  updateTask,
} from './model.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./model.js').Board} Board */
/** @typedef {import('./model.js').Task} Task */
/** @typedef {import('./model.js').Column} Column */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const VIEWS = /** @type {const} */ (['board', 'list', 'table']);
/** @typedef {'title' | 'column' | 'priority' | 'assignee' | 'due'} SortKey */

/**
 * A board of tasks: columns of cards moved by drag and drop or with the keyboard, three views
 * (board, list, table), tasks added in a column and edited in a dialog, filters, limits per
 * column, and every change sent as a cancelable event so it can be saved to a server.
 *
 * With `readonly`, nothing can be changed: it is a public roadmap. Every value is rendered
 * with DOM text APIs, and links keep safe URL schemes only.
 *
 * @element vt-board
 * @since 0.12.0
 *
 * @attr {"board"|"list"|"table"} view - The first view (default `board`).
 * @attr {boolean} views - Board / List / Table tabs. Full variant: on.
 * @attr {boolean} readonly - Nothing can be changed.
 * @attr {boolean} filters - The search, label and assignee filters. Default: on.
 * @attr {string} persist - Keeps the board in this browser under this name, across visits.
 * @attr {string} now - Date used as today for overdue tasks (ISO 8601). Default: today.
 *
 * @prop {string} content - The JSON text, kept up to date with every change.
 * @prop {any} data - The board, as a value.
 * @prop {Board} board - The board as it is now (read-only copy).
 * @prop {Task[]} tasks - Its tasks (read-only copy).
 *
 * @fires vt-ready - Board rendered. Detail: `{ type: "board" }`.
 * @fires vt-task-add - A task is about to be added (cancelable). Detail: `{ task }`.
 * @fires vt-task-move - A task is about to move (cancelable). Detail: `{ task, from, to, index }`.
 * @fires vt-task-edit - A task is about to change (cancelable). Detail: `{ task, changes }`.
 * @fires vt-task-delete - A task is about to be deleted (cancelable). Detail: `{ task }`.
 * @fires vt-change - The board changed. Detail: `{ value }` (the board as a value).
 * @fires vt-tab-change - The view changed. Detail: `{ tab }`.
 *
 * @csspart column - A column.
 * @csspart column-title - The title of a column.
 * @csspart card - A task.
 * @csspart handle - The drag handle of a task.
 * @csspart label - A label of a task.
 * @csspart priority - The priority of a task.
 * @csspart filters - The filters.
 * @csspart editor - The dialog that edits a task.
 *
 * @example
 * <vt-board persist="my-board" json='{"tasks":[{"title":"Write the docs","column":"todo"}]}'></vt-board>
 */
export class VtBoard extends VtDataElement {
  static type = 'board';

  static allowEmpty = true;

  static componentAttributes = Object.freeze([
    'view',
    'views',
    'readonly',
    'filters',
    'persist',
    'now',
  ]);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true, views: true },
  };

  static styles = [syntaxCss, codeCss, dataCss, boardCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    this.hintId = uid('hint');
    /** @type {Board | null} */
    this.state = null;
    /** @type {'board' | 'list' | 'table' | null} */
    this.viewState = null;
    this.query = '';
    /** @type {string | null} */
    this.label = null;
    /** @type {string | null} */
    this.assignee = null;
    /** @type {Set<string>} */
    this.collapsed = new Set();
    /** @type {string | null} Column with its add field open. */
    this.adding = null;
    /** @type {string | null} Task with the keyboard focus. */
    this.focusTask = null;
    /** @type {{ id: string, origin: Board } | null} Task moved with the keyboard. */
    this.grabbed = null;
    /** @type {{ id: string | null, column: string, confirm: boolean } | null} The dialog. */
    this.dialog = null;
    /** @type {{ key: SortKey, up: boolean }} */
    this.sort = { key: 'column', up: true };
    this.drag = new BoardDrag(this.root, this.frame, {
      start: (id) => (this.focusTask = id),
      drop: (id, column, index) => this.drop(id, column, index),
      cancel: () => this.render(),
    });
  }

  // ---------------------------------------------------------------- state

  /** @returns {Board} The board, read from the browser storage, else from the content. */
  get current() {
    if (this.state) return this.state;
    const saved = this.loadSaved();
    const result = parseBoard(saved ?? this.text ?? '');
    const empty = /** @type {{ ok: true, board: Board }} */ (parseBoard(''));
    this.state = result.ok ? result.board : empty.board;
    return this.state;
  }

  /** @type {Board} */
  get board() {
    return structuredClone(this.current);
  }

  /** @type {Task[]} */
  get tasks() {
    return structuredClone(this.current.tasks);
  }

  get readonly() {
    return parseBoolean(this.getAttribute('readonly')) === true;
  }

  /** @returns {'board' | 'list' | 'table'} */
  get view() {
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, 'board');
  }

  contentChanged() {
    this.state = null;
    this.grabbed = null;
  }

  /** @returns {string | null} */
  loadSaved() {
    const key = this.getAttribute('persist')?.trim();
    if (!key) return null;
    try {
      return localStorage.getItem(`vitrine-board:${key}`);
    } catch {
      return null;
    }
  }

  /** @param {string} json */
  save(json) {
    const key = this.getAttribute('persist')?.trim();
    if (!key) return;
    try {
      localStorage.setItem(`vitrine-board:${key}`, json);
    } catch {
      // Storage full or blocked: the board still works for this visit.
    }
  }

  /**
   * Applies a change after asking listeners, then keeps the content in step.
   *
   * @param {Board} next
   * @param {string} event
   * @param {Record<string, unknown>} detail
   * @returns {boolean} Whether the change was made.
   */
  commit(next, event, detail) {
    if (!emit(this, event, detail)) {
      this.render();
      return false;
    }
    this.state = next;
    const json = serializeBoard(next);
    this.text = json;
    this._content = json;
    this.save(json);
    this.render();
    emit(this, EVENTS.CHANGE, { value: JSON.parse(json) });
    return true;
  }

  /**
   * Adds a task; it goes at the end of its column.
   *
   * @param {Partial<Task> & { title: string }} input
   * @returns {Task | null} The task, or `null` when a listener refused it.
   */
  addTask(input) {
    const board = this.current;
    /** @type {Task} */
    const task = {
      id: input.id || newId(),
      title: String(input.title).slice(0, 500),
      description: input.description ?? '',
      column: board.columns.some((c) => c.id === input.column) ? /** @type {string} */ (input.column) : board.columns[0].id, // prettier-ignore
      priority: readPriority(input.priority),
      labels: input.labels ?? [],
      assignee: input.assignee ?? '',
      due: input.due ?? '',
      progress: input.progress ?? null,
      votes: input.votes ?? null,
      when: input.when ?? '',
      url: input.url ?? null,
    };
    return this.commit(addTask(board, task), EVENTS.TASK_ADD, { task }) ? task : null;
  }

  /**
   * @param {string} id
   * @param {Partial<Task>} changes
   * @returns {boolean}
   */
  updateTask(id, changes) {
    const task = this.current.tasks.find((t) => t.id === id);
    if (!task) return false;
    return this.commit(updateTask(this.current, id, changes), EVENTS.TASK_EDIT, { task, changes });
  }

  /**
   * @param {string} id
   * @param {string} column
   * @param {number} [index] - Position in the column (default: the end).
   * @returns {boolean}
   */
  moveTask(id, column, index = Infinity) {
    const task = this.current.tasks.find((t) => t.id === id);
    if (!task) return false;
    const to = statusKey(column);
    return this.commit(moveTask(this.current, id, to, index), EVENTS.TASK_MOVE, { task, from: task.column, to, index }); // prettier-ignore
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  removeTask(id) {
    const task = this.current.tasks.find((t) => t.id === id);
    if (!task) return false;
    return this.commit(removeTask(this.current, id), EVENTS.TASK_DELETE, { task });
  }

  /**
   * A drop with the pointer.
   *
   * @param {string} id
   * @param {string} column
   * @param {number} index
   */
  drop(id, column, index) {
    const task = this.current.tasks.find((t) => t.id === id);
    if (!task) return;
    // The index counts the cards shown: with filters on, it is taken among the shown ones.
    const shown = this.visible(this.current.tasks).filter(
      (t) => t.column === column && t.id !== id,
    );
    const all = this.current.tasks.filter((t) => t.column === column && t.id !== id);
    const at = shown[index] ? all.indexOf(shown[index]) : all.length;
    this.focusTask = id;
    if (this.moveTask(id, column, at)) this.announceMove('boardDropped', id);
  }

  /**
   * @param {StringKey} key
   * @param {string} id
   */
  announceMove(key, id) {
    const task = this.current.tasks.find((t) => t.id === id);
    if (!task) return;
    const inColumn = this.current.tasks.filter((t) => t.column === task.column);
    this.announce(
      this.t(key, {
        title: task.title,
        column: this.columnName(this.columnOf(task.column)),
        position: inColumn.indexOf(task) + 1,
        count: inColumn.length,
      }),
    );
  }

  // ---------------------------------------------------------------- render

  /**
   * @param {string} id
   * @returns {Column}
   */
  columnOf(id) {
    return this.current.columns.find((c) => c.id === id) ?? { id, title: '', limit: null };
  }

  /**
   * @param {Column} column
   * @returns {string}
   */
  columnName(column) {
    if (column.title) return column.title;
    if (KNOWN.includes(column.id))
      return this.t(/** @type {StringKey} */ (`boardStatus_${column.id}`));
    return column.id.charAt(0).toUpperCase() + column.id.slice(1);
  }

  /**
   * @param {Task[]} tasks
   * @returns {Task[]}
   */
  visible(tasks) {
    return filterTasks(tasks, { query: this.query, label: this.label, assignee: this.assignee });
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = this.state ? null : parseBoard(this.loadSaved() ?? this.text ?? '');
    const body = h('div', { class: 'body data-body board-body', part: 'body' });
    if (result && !result.ok) body.append(this.dataNotice(result));
    else {
      const board = this.current;
      if (this.flag('filters') && board.tasks.length) body.append(this.filters(board));
      const shown = this.visible(board.tasks);
      if (this.view === 'table') body.append(this.tableView(shown));
      else body.append(this.boardView(board, shown));
      body.append(h('p', { class: 'sr-only', text: t('boardKeys'), attrs: { id: this.hintId } }));
    }
    const tabs = this.feature('views')
      ? createTabs({
          tabs: [
            { id: 'board', label: t('boardViewBoard') },
            { id: 'list', label: t('boardViewList') },
            { id: 'table', label: t('boardViewTable') },
          ],
          selected: this.view,
          label: t('boardViews'),
          panelId: this.panelId,
          onSelect: (id) => this.setView(/** @type {'board' | 'list' | 'table'} */ (id)),
        })
      : null;
    const { panel, history } = this.previewPanel(body, this.panelId);
    frame.append(
      ...this.chrome({
        badge: t('boardCount', { count: this.current.tasks.length }),
        tabs,
        actions: [
          ...history,
          this.editToggleButton(),
          this.fullscreenButton(),
          this.feature('download') ? this.downloadButton(() => this.text ?? '', this.downloadName('board.json'), 'application/json') : null, // prettier-ignore
          this.feature('copy') ? this.copyButton(() => this.text ?? '') : null,
        ],
      }),
      panel,
    );
    if (this.dialog) frame.append(this.taskDialog());
    const scroller = this.root.querySelector('.board-columns');
    if (scroller instanceof HTMLElement && !this.readonly) this.drag.attach(scroller);
    this.editor?.align();
  }

  /**
   * @param {'board' | 'list' | 'table'} view
   */
  setView(view) {
    this.viewState = view;
    this.render();
    emit(this, EVENTS.TAB_CHANGE, { tab: view });
    /** @type {HTMLElement | null} */ (
      this.root.querySelector(`[data-focus-key="tab-${view}"]`)
    )?.focus();
  }

  /**
   * @param {Board} board
   * @returns {HTMLElement}
   */
  filters(board) {
    const t = this.t;
    const labels = [...new Set(board.tasks.flatMap((task) => task.labels))].slice(0, 30);
    const people = [...new Set(board.tasks.map((task) => task.assignee).filter(Boolean))].slice(
      0,
      50,
    );
    return h(
      'div',
      { class: 'board-filters', part: 'filters' },
      h('input', {
        class: 'data-input board-search',
        attrs: { type: 'search', value: this.query, placeholder: t('boardSearch'), 'aria-label': t('boardSearch'), 'data-focus-key': 'search' }, // prettier-ignore
        on: {
          input: (event) => {
            this.query = /** @type {HTMLInputElement} */ (event.target).value.slice(0, 200);
            this.render();
            emit(this, EVENTS.FILTER_CHANGE, { query: this.query, label: this.label, assignee: this.assignee, shown: this.visible(this.current.tasks).length }); // prettier-ignore
          },
        },
      }),
      people.length
        ? h(
            'select',
            {
              class: 'data-input board-people',
              attrs: { 'aria-label': t('boardAssignee'), 'data-focus-key': 'people' },
              on: {
                change: (event) => {
                  const value = /** @type {HTMLSelectElement} */ (event.target).value;
                  this.assignee = value || null;
                  this.render();
                },
              },
            },
            h('option', { text: t('boardEveryone'), attrs: { value: '' } }),
            ...people.map((name) => h('option', { text: name, attrs: { value: name, selected: name === this.assignee } })), // prettier-ignore
          )
        : null,
      labels.length
        ? h(
            'div',
            { class: 'data-chips', attrs: { role: 'group', 'aria-label': t('boardLabels') } },
            ...[[t('boardAll'), null], ...labels.map((l) => [l, l])].map(([name, value], index) =>
              h('button', {
                class: 'data-chip',
                text: /** @type {string} */ (name),
                attrs: { type: 'button', 'aria-pressed': String(this.label === value), 'data-focus-key': `label-${index}` }, // prettier-ignore
                on: {
                  click: () => {
                    this.label = /** @type {string | null} */ (value);
                    this.render();
                  },
                },
              }),
            ),
          )
        : null,
    );
  }

  /**
   * @param {Board} board
   * @param {Task[]} shown
   * @returns {HTMLElement}
   */
  boardView(board, shown) {
    const list = this.view === 'list';
    const columns = h(
      'div',
      { class: `board-columns ${list ? 'as-list' : 'as-board'}` },
      ...board.columns.map(
        (column) =>
        this.columnView(column, shown.filter((task) => task.column === column.id), board.tasks.filter((task) => task.column === column.id).length), // prettier-ignore
      ),
    );
    columns.style.setProperty('--_count', String(board.columns.length));
    return list
      ? columns
      : h('div', { class: 'board-scroll', attrs: { role: 'region', 'aria-label': this.t('boardColumns'), tabindex: '-1' } }, columns); // prettier-ignore
  }

  /**
   * @param {Column} column
   * @param {Task[]} tasks - Shown tasks of the column.
   * @param {number} total - Every task of the column.
   * @returns {HTMLElement}
   */
  columnView(column, tasks, total) {
    const t = this.t;
    const name = this.columnName(column);
    const collapsed = this.collapsed.has(column.id);
    const over = column.limit !== null && total > column.limit;
    const head = h(
      'div',
      { class: 'board-column-head' },
      h(
        'h3',
        { class: 'board-column-title', part: 'column-title' },
        h('span', { text: name }),
        h('span', {
          class: `board-count${over ? ' over' : ''}`,
          text: column.limit
            ? t('boardLimit', { count: total, limit: column.limit })
            : String(total),
          attrs: {
            title: over
              ? t('boardOverLimit', { limit: /** @type {number} */ (column.limit) })
              : null,
          },
        }),
        over ? h('span', { class: 'sr-only', text: t('boardOverLimit', { limit: /** @type {number} */ (column.limit) }) }) : null, // prettier-ignore
      ),
      this.view === 'board'
        ? iconButton({
            icon: collapsed ? 'chevron-right' : 'chevron-left',
            label: t(collapsed ? 'boardExpand' : 'boardCollapse', { column: name }),
            key: `collapse-${column.id}`,
            pressed: collapsed,
            onClick: () => {
              if (collapsed) this.collapsed.delete(column.id);
              else this.collapsed.add(column.id);
              this.render();
            },
          })
        : null,
    );
    const section = h(
      'section',
      { class: `board-column${collapsed && this.view === 'board' ? ' collapsed' : ''}${over ? ' over' : ''}`, part: 'column', attrs: { 'aria-label': name, 'data-column': column.id } }, // prettier-ignore
      head,
    );
    if (collapsed && this.view === 'board') return section;
    const list = h(
      'ul',
      { class: 'board-list', attrs: { 'data-list': column.id, 'aria-label': name } },
      ...tasks.map((task, index) => this.cardView(task, name, index, tasks.length)),
    );
    section.append(list);
    if (!tasks.length) section.append(h('p', { class: 'data-none board-empty', text: t(this.query || this.label || this.assignee ? 'boardNone' : 'boardEmpty') })); // prettier-ignore
    if (!this.readonly) section.append(this.addRow(column, name));
    return section;
  }

  /**
   * @param {Task} task
   * @param {string} columnName
   * @param {number} index
   * @param {number} count
   * @returns {HTMLElement}
   */
  cardView(task, columnName, index, count) {
    const t = this.t;
    const focus = this.focusTask ?? this.firstShownId();
    const grabbed = this.grabbed?.id === task.id;
    const open = h(
      this.readonly && task.url ? 'a' : this.readonly ? 'span' : 'button',
      {
        class: 'board-open',
        attrs: {
          type: this.readonly ? null : 'button',
          href: this.readonly ? task.url : null,
          rel: this.readonly && task.url ? 'noopener noreferrer' : null,
          tabindex: this.readonly && !task.url ? null : task.id === focus ? '0' : '-1',
          'aria-label': t('boardTask', {
            title: task.title,
            column: columnName,
            position: index + 1,
            count,
          }),
          'aria-describedby': this.readonly ? null : this.hintId,
          'aria-pressed': this.readonly ? null : String(grabbed),
          'data-focus-key': `task-${task.id}`,
        },
        on: this.readonly
          ? { keydown: (event) => this.navigate(/** @type {KeyboardEvent} */ (event), task) }
          : {
              click: () => this.openEditor(task.id, task.column),
              keydown: (event) => this.cardKey(/** @type {KeyboardEvent} */ (event), task),
              focus: () => (this.focusTask = task.id),
            },
      },
      task.title,
    );
    return h(
      'li',
      { class: `board-card priority-${task.priority}${grabbed ? ' grabbed' : ''}`, part: 'card', attrs: { 'data-task': task.id } }, // prettier-ignore
      h(
        'div',
        { class: 'board-card-head' },
        this.readonly ? null : h('span', { class: 'board-handle', part: 'handle', attrs: { 'aria-hidden': 'true', title: t('boardDrag', { title: task.title }) } }, icon('grip')), // prettier-ignore
        h('h4', { class: 'board-card-title' }, open),
      ),
      task.description && this.view !== 'list' ? h('p', { class: 'board-text', text: task.description.slice(0, 280) }) : null, // prettier-ignore
      task.labels.length ? h('ul', { class: 'board-labels' }, ...task.labels.map((l) => h('li', { part: 'label', text: l }))) : null, // prettier-ignore
      task.progress !== null ? this.progressView(task.progress) : null,
      this.metaRow(task),
    );
  }

  /** @returns {string | null} */
  firstShownId() {
    return this.visible(this.current.tasks)[0]?.id ?? null;
  }

  /**
   * @param {Task} task
   * @returns {HTMLElement | null}
   */
  metaRow(task) {
    const t = this.t;
    const items = [];
    if (task.priority !== 'none')
      items.push(h('span', { class: `board-priority ${task.priority}`, part: 'priority', text: t(/** @type {StringKey} */ (`boardPriority_${task.priority}`)) })); // prettier-ignore
    if (task.due) items.push(this.dueView(task));
    if (task.when) items.push(h('span', { class: 'board-when', text: task.when }));
    if (task.votes !== null)
      items.push(h('span', { class: 'board-when', text: t('boardVotes', { count: task.votes }) }));
    if (task.assignee)
      items.push(h('span', { class: 'board-avatar', text: initials(task.assignee), attrs: { title: task.assignee } }, h('span', { class: 'sr-only', text: task.assignee }))); // prettier-ignore
    return items.length ? h('div', { class: 'board-meta' }, ...items) : null;
  }

  /**
   * @param {Task} task
   * @returns {HTMLElement}
   */
  dueView(task) {
    const t = this.t;
    const day = Date.parse(`${task.due}T00:00:00Z`);
    const today = new Date(this.now).toISOString().slice(0, 10);
    const overdue = task.due < today && task.column !== 'done';
    const date = this.formatDate(day, { dateStyle: 'medium', timeZone: 'UTC' });
    return h(
      'time',
      { class: `board-due${overdue ? ' overdue' : ''}`, attrs: { datetime: task.due } },
      icon('calendar'),
      h('span', { text: overdue ? `${t('boardOverdue')} · ${date}` : t('boardDueOn', { date }) }),
    );
  }

  /**
   * @param {number} progress
   * @returns {HTMLElement}
   */
  progressView(progress) {
    const value = Math.round(progress);
    const fill = h('span', { class: 'board-fill' });
    fill.style.setProperty('--_value', `${value}%`);
    return h(
      'span',
      { class: 'board-progress', attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(value), 'aria-label': this.t('boardProgressValue', { percent: value }) } }, // prettier-ignore
      fill,
    );
  }

  /**
   * The button that adds a task to a column, or its field once pressed.
   *
   * @param {Column} column
   * @param {string} name
   * @returns {HTMLElement}
   */
  addRow(column, name) {
    const t = this.t;
    if (this.adding !== column.id) {
      return h(
        'button',
        {
          class: 'board-add board-action',
          attrs: {
            type: 'button',
            'aria-label': t('boardAddTo', { column: name }),
            'data-focus-key': `add-${column.id}`,
          },
          on: {
            click: () => {
              this.adding = column.id;
              this.render();
              /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-focus-key="new-${column.id}"]`))?.focus(); // prettier-ignore
            },
          },
        },
        icon('plus'),
        h('span', { text: t('boardAdd') }),
      );
    }
    const input = h('input', {
      class: 'data-input board-new',
      attrs: { type: 'text', placeholder: t('boardNewTitle'), 'aria-label': t('boardNewTitle'), maxlength: 500, 'data-focus-key': `new-${column.id}` }, // prettier-ignore
      on: {
        keydown: (event) => {
          const key = /** @type {KeyboardEvent} */ (event).key;
          if (key === 'Escape') {
            this.adding = null;
            this.render();
            /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-focus-key="add-${column.id}"]`))?.focus(); // prettier-ignore
          } else if (key === 'Enter' && input.value.trim()) {
            event.preventDefault();
            const task = this.addTask({ title: input.value.trim(), column: column.id });
            if (task) this.announce(t('boardAdded', { title: task.title, column: name }));
            /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-focus-key="new-${column.id}"]`))?.focus(); // prettier-ignore
          }
        },
        blur: () => {
          if (input.value.trim()) return;
          this.adding = null;
          queueMicrotask(() => this.render());
        },
      },
    });
    return h('div', { class: 'board-new-row' }, input);
  }

  // ---------------------------------------------------------------- table

  /**
   * @param {Task[]} shown
   * @returns {HTMLElement}
   */
  tableView(shown) {
    const t = this.t;
    const order = this.current.columns.map((c) => c.id);
    const rank = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
    /** @type {Record<SortKey, (a: Task, b: Task) => number>} */
    const compare = {
      title: (a, b) => a.title.localeCompare(b.title, this.locale),
      column: (a, b) => order.indexOf(a.column) - order.indexOf(b.column),
      priority: (a, b) => rank[a.priority] - rank[b.priority],
      assignee: (a, b) => (a.assignee || '￿').localeCompare(b.assignee || '￿', this.locale),
      due: (a, b) => (a.due || '9999').localeCompare(b.due || '9999'),
    };
    const sorted = [...shown].sort(
      (a, b) => compare[this.sort.key](a, b) * (this.sort.up ? 1 : -1),
    );
    /** @type {[SortKey, StringKey][]} */
    const heads = [['title', 'boardTitleColumn'], ['column', 'boardColumn'], ['priority', 'boardPriority'], ['assignee', 'boardAssignee'], ['due', 'boardDue']]; // prettier-ignore
    return h(
      'div',
      {
        class: 'board-table-wrap',
        attrs: { role: 'region', tabindex: '0', 'aria-label': t('boardViewTable') },
      },
      h(
        'table',
        { class: 'board-table' },
        h('thead', {}, h('tr', {}, ...heads.map(([key, label]) => this.sortHead(key, t(label))))),
        h('tbody', {}, ...sorted.map((task) => this.tableRow(task))),
      ),
      sorted.length ? null : h('p', { class: 'data-none', text: t('boardNone') }),
    );
  }

  /**
   * @param {SortKey} key
   * @param {string} label
   * @returns {HTMLElement}
   */
  sortHead(key, label) {
    const active = this.sort.key === key;
    return h(
      'th',
      {
        attrs: {
          scope: 'col',
          'aria-sort': active ? (this.sort.up ? 'ascending' : 'descending') : null,
        },
      },
      h(
        'button',
        {
          class: 'board-sort',
          attrs: { type: 'button', 'data-focus-key': `sort-${key}` },
          on: {
            click: () => {
              this.sort = { key, up: active ? !this.sort.up : true };
              this.render();
            },
          },
        },
        label,
        active ? icon(this.sort.up ? 'chevron-up' : 'chevron-down') : null,
      ),
    );
  }

  /**
   * @param {Task} task
   * @returns {HTMLElement}
   */
  tableRow(task) {
    const t = this.t;
    const title = this.readonly
      ? task.url ? h('a', { text: task.title, attrs: { href: task.url, rel: 'noopener noreferrer' } }) : task.title // prettier-ignore
      : h('button', { class: 'board-link', text: task.title, attrs: { type: 'button', 'data-focus-key': `row-${task.id}` }, on: { click: () => this.openEditor(task.id, task.column) } }); // prettier-ignore
    return h(
      'tr',
      {},
      h('th', { attrs: { scope: 'row' } }, title),
      h('td', { text: this.columnName(this.columnOf(task.column)) }),
      h('td', {}, task.priority === 'none' ? '' : h('span', { class: `board-priority ${task.priority}`, text: t(/** @type {StringKey} */ (`boardPriority_${task.priority}`)) })), // prettier-ignore
      h('td', { text: task.assignee }),
      h('td', {}, task.due ? this.dueView(task) : ''),
    );
  }

  // ---------------------------------------------------------------- keyboard

  /**
   * Moving the focus between cards: up and down in a column, left and right across columns.
   *
   * @param {KeyboardEvent} event
   * @param {Task} task
   * @returns {boolean} Whether the key was used.
   */
  navigate(event, task) {
    const columns = this.current.columns.filter(
      (c) => !this.collapsed.has(c.id) || this.view !== 'board',
    );
    const shown = this.visible(this.current.tasks);
    const inColumn = (/** @type {string} */ id) => shown.filter((t) => t.column === id);
    const own = inColumn(task.column);
    const index = own.indexOf(task);
    const at = columns.findIndex((c) => c.id === task.column);
    /** @type {Task | undefined} */
    let next;
    if (event.key === 'ArrowDown') next = own[index + 1];
    else if (event.key === 'ArrowUp') next = own[index - 1];
    else if (event.key === 'Home') next = own[0];
    else if (event.key === 'End') next = own[own.length - 1];
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const step = event.key === 'ArrowLeft' ? -1 : 1;
      for (let c = at + step; c >= 0 && c < columns.length && !next; c += step) {
        const list = inColumn(columns[c].id);
        next = list[Math.min(index, list.length - 1)];
      }
    } else return false;
    event.preventDefault();
    if (next) this.focusOn(next.id);
    return true;
  }

  /**
   * @param {string} id
   */
  focusOn(id) {
    this.focusTask = id;
    for (const node of this.root.querySelectorAll('.board-open[tabindex]'))
      node.setAttribute(
        'tabindex',
        node.getAttribute('data-focus-key') === `task-${id}` ? '0' : '-1',
      );
    /** @type {HTMLElement | null} */ (
      this.root.querySelector(`[data-focus-key="task-${CSS.escape(id)}"]`)
    )?.focus();
  }

  /**
   * Keys of a card: arrows move the focus, or the card once picked up with Space.
   *
   * @param {KeyboardEvent} event
   * @param {Task} task
   */
  cardKey(event, task) {
    if (this.grabbed) {
      this.grabbedKey(event, task);
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      this.grabbed = { id: task.id, origin: this.current };
      this.render();
      this.focusOn(task.id);
      this.announce(this.t('boardGrabbed', { title: task.title }));
    } else if (event.key === 'Delete') {
      event.preventDefault();
      this.openEditor(task.id, task.column, true);
    } else this.navigate(event, task);
  }

  /**
   * @param {KeyboardEvent} event
   * @param {Task} task
   */
  grabbedKey(event, task) {
    const grabbed = /** @type {NonNullable<VtBoard['grabbed']>} */ (this.grabbed);
    const board = this.current;
    const columns = board.columns.filter((c) => !this.collapsed.has(c.id));
    const own = board.tasks.filter((t) => t.column === task.column);
    const index = own.findIndex((t) => t.id === task.id);
    const at = columns.findIndex((c) => c.id === task.column);
    /** @type {[string, number] | null} */
    let target = null;
    if (event.key === 'ArrowUp' && index > 0) target = [task.column, index - 1];
    else if (event.key === 'ArrowDown' && index < own.length - 1) target = [task.column, index + 1];
    else if (event.key === 'ArrowLeft' && at > 0) target = [columns[at - 1].id, index];
    else if (event.key === 'ArrowRight' && at < columns.length - 1)
      target = [columns[at + 1].id, index];
    if (target) {
      event.preventDefault();
      // The move is shown at once and sent as one event when the card is dropped.
      this.state = moveTask(board, task.id, target[0], target[1]);
      this.render();
      this.focusOn(task.id);
      this.announceMove('boardMoved', task.id);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      const moved = /** @type {Task} */ (this.current.tasks.find((t) => t.id === task.id));
      const before = /** @type {Task} */ (grabbed.origin.tasks.find((t) => t.id === task.id));
      const target = this.current;
      this.state = grabbed.origin;
      this.grabbed = null;
      const position = target.tasks.filter((t) => t.column === moved.column).indexOf(moved);
      if (
        this.commit(target, EVENTS.TASK_MOVE, {
          task: before,
          from: before.column,
          to: moved.column,
          index: position,
        })
      )
        this.announceMove('boardDropped', task.id);
      this.focusOn(task.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.state = grabbed.origin;
      this.grabbed = null;
      this.render();
      this.focusOn(task.id);
      this.announce(
        this.t('boardCancelled', {
          title: task.title,
          column: this.columnName(this.columnOf(task.column)),
        }),
      );
    } else if (event.key.startsWith('Arrow')) event.preventDefault();
  }

  // ---------------------------------------------------------------- editor

  /**
   * @param {string | null} id - The task, or `null` for a new one.
   * @param {string} column
   * @param {boolean} [confirm] - Open on the delete confirmation.
   */
  openEditor(id, column, confirm = false) {
    if (this.readonly) return;
    this.dialog = { id, column, confirm };
    this.render();
  }

  /** @returns {HTMLElement} The dialog that edits a task. */
  taskDialog() {
    const t = this.t;
    const editing = /** @type {NonNullable<VtBoard['dialog']>} */ (this.dialog);
    const task = this.current.tasks.find((x) => x.id === editing.id);
    const ids = { title: uid('f'), description: uid('f'), column: uid('f'), priority: uid('f'), labels: uid('f'), assignee: uid('f'), due: uid('f'), progress: uid('f') }; // prettier-ignore
    const row = (/** @type {string} */ key, /** @type {StringKey} */ label, /** @type {HTMLElement} */ control, /** @type {string} */ hint = '') =>
      h('div', { class: 'board-form-row' }, h('label', { text: t(label), attrs: { for: control.id } }), control, hint ? h('span', { class: 'board-form-hint', text: hint }) : null); // prettier-ignore
    const input = (
      /** @type {string} */ id,
      /** @type {string} */ type,
      /** @type {string} */ value,
    ) => h('input', { class: 'data-input', attrs: { id, type, value } });
    const title = h('input', { class: 'data-input', attrs: { id: ids.title, type: 'text', value: task?.title ?? '', required: true, maxlength: 500, 'data-focus-key': 'editor-title' } }); // prettier-ignore
    const description = h('textarea', {
      class: 'data-input board-textarea',
      attrs: { id: ids.description, rows: 4 },
    });
    description.value = task?.description ?? '';
    const column = h('select', { class: 'data-input', attrs: { id: ids.column } }, ...this.current.columns.map((c) => h('option', { text: this.columnName(c), attrs: { value: c.id, selected: c.id === (task?.column ?? editing.column) } }))); // prettier-ignore
    const priority = h('select', { class: 'data-input', attrs: { id: ids.priority } }, ...PRIORITIES.map((p) => h('option', { text: t(/** @type {StringKey} */ (`boardPriority_${p}`)), attrs: { value: p, selected: p === (task?.priority ?? 'none') } }))); // prettier-ignore
    const labels = input(ids.labels, 'text', (task?.labels ?? []).join(', '));
    const assignee = input(ids.assignee, 'text', task?.assignee ?? '');
    const due = input(ids.due, 'date', task?.due ?? '');
    const progress = h('input', { class: 'data-input', attrs: { id: ids.progress, type: 'number', min: 0, max: 100, step: 1, value: task?.progress ?? '' } }); // prettier-ignore
    const form = h(
      'form',
      { class: 'board-form', attrs: { novalidate: null } },
      h('h3', { class: 'board-form-title', text: t(task ? 'boardEditTask' : 'boardNewTask') }),
      row('title', 'boardTitle', title),
      row('description', 'boardDescription', description),
      h('div', { class: 'board-form-grid' }, row('column', 'boardColumn', column), row('priority', 'boardPriority', priority), row('assignee', 'boardAssignee', assignee), row('due', 'boardDue', due)), // prettier-ignore
      h('div', { class: 'board-form-grid' }, row('labels', 'boardLabels', labels, t('boardLabelsHint')), row('progress', 'boardProgress', progress)), // prettier-ignore
      this.editorActions(task),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!title.value.trim()) {
        title.focus();
        return;
      }
      const progressValue =
        progress.value === '' ? null : Math.max(0, Math.min(100, Number(progress.value)));
      /** @type {Partial<Task>} */
      const changes = {
        title: title.value.trim().slice(0, 500),
        description: description.value.slice(0, 5000),
        priority: readPriority(priority.value),
        labels: [
          ...new Set(
            labels.value
              .split(',')
              .map((l) => l.trim())
              .filter(Boolean),
          ),
        ].slice(0, 20),
        assignee: assignee.value.trim().slice(0, 100),
        due: /^\d{4}-\d{2}-\d{2}$/.test(due.value) ? due.value : '',
        progress: Number.isFinite(progressValue) ? progressValue : null,
      };
      this.closeEditor();
      if (task) {
        if (column.value !== task.column) this.moveTask(task.id, column.value);
        this.updateTask(task.id, changes);
      } else
        this.addTask({
          ...changes,
          title: /** @type {string} */ (changes.title),
          column: column.value,
        });
    });
    const dialog = h(
      'dialog',
      {
        class: 'board-dialog',
        part: 'editor',
        attrs: { 'aria-label': t(task ? 'boardEditTask' : 'boardNewTask') },
        on: {
          close: () => this.dialog && this.closeEditor(),
          click: (event) =>
            event.target === dialog && /** @type {HTMLDialogElement} */ (dialog).close(),
        },
      },
      form,
    );
    queueMicrotask(() => {
      if (!dialog.isConnected) return;
      if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
      /** @type {HTMLElement | null} */ (
        dialog.querySelector(
          editing.confirm ? '[data-focus-key="delete"]' : '[data-focus-key="editor-title"]',
        )
      )?.focus();
    });
    return dialog;
  }

  /**
   * @param {Task | undefined} task
   * @returns {HTMLElement}
   */
  editorActions(task) {
    const t = this.t;
    const editing = /** @type {NonNullable<VtBoard['dialog']>} */ (this.dialog);
    return h(
      'div',
      { class: 'board-form-actions' },
      task
        ? h('button', {
            class: `board-button danger${editing.confirm ? ' confirm' : ''}`,
            text: t(editing.confirm ? 'boardConfirmDelete' : 'boardDelete'),
            attrs: { type: 'button', 'data-focus-key': 'delete' },
            on: {
              click: () => {
                if (!editing.confirm) {
                  editing.confirm = true;
                  this.render();
                  return;
                }
                this.closeEditor();
                if (this.removeTask(task.id))
                  this.announce(t('boardDeleted', { title: task.title }));
                this.focusTask = this.firstShownId();
              },
            },
          })
        : null,
      h('span', { class: 'board-spacer' }),
      h('button', { class: 'board-button', text: t('boardCancel'), attrs: { type: 'button', 'data-focus-key': 'cancel' }, on: { click: () => this.closeEditor() } }), // prettier-ignore
      h('button', {
        class: 'board-button primary',
        text: t('boardSave'),
        attrs: { type: 'submit', 'data-focus-key': 'save' },
      }),
    );
  }

  closeEditor() {
    const id = this.dialog?.id;
    this.dialog = null;
    this.render();
    if (id) this.focusOn(id);
  }
}
