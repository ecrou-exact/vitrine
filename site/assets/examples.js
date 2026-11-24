/**
 * Examples page: every <template> is rendered live next to its own markup, so the code
 * shown is always exactly the code running. Script examples show the source of the
 * function that runs them.
 */

/** Removes the common indentation and the blank first and last lines. */
function dedent(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

/**
 * Builds the demo window of an example: the live result on a canvas, and the code that
 * produced it right under it, in the same window.
 */
function layout(example, language, source) {
  const demo = document.createElement('div');
  demo.className = 'demo';

  const bar = document.createElement('div');
  bar.className = 'demo-bar';
  const dots = document.createElement('span');
  dots.className = 'demo-dots';
  dots.setAttribute('aria-hidden', 'true');
  const title = document.createElement('span');
  title.className = 'demo-title';
  title.textContent = 'Result';
  bar.append(dots, title);

  const live = document.createElement('div');
  live.className = 'demo-canvas';

  const code = document.createElement('vt-code');
  code.className = 'demo-code';
  code.setAttribute('language', language);
  code.setAttribute('label', language === 'js' ? 'JavaScript' : 'HTML');
  code.setAttribute('header', '');
  code.setAttribute('copy', '');
  code.setAttribute('badge', 'false');
  // Long markup folds; the result stays the focus.
  if (source.split('\n').length > 16) code.setAttribute('collapsible', '14');
  code.content = source;

  demo.append(bar, live, code);
  example.append(demo);
  return live;
}

for (const example of document.querySelectorAll('.example')) {
  const template = example.querySelector('template');
  if (!template) continue;
  // Serializing the inert template gives back the markup as written (minus indentation).
  // The serializer writes `>` as `&gt;` and `&` as `&amp;` in text; raw, both are valid HTML
  // (an `&` not starting a character reference), so show them as written.
  const live = layout(
    example,
    'html',
    dedent(template.innerHTML)
      .replace(/&gt;/g, '>')
      .replace(/&amp;(?![a-z]+;|#\d+;)/gi, '&'),
  );
  live.append(template.content.cloneNode(true));
}

const SCRIPTS = {
  tableTeam(target) {
    const first = [
      'Ada',
      'Alan',
      'Grace',
      'Linus',
      'Margaret',
      'Ken',
      'Barbara',
      'Dennis',
      'Radia',
      'Tim',
    ];
    const last = [
      'Lovelace',
      'Turing',
      'Hopper',
      'Torvalds',
      'Hamilton',
      'Thompson',
      'Liskov',
      'Ritchie',
      'Perlman',
      'Lee',
    ];
    const skills = [
      'go',
      'rust',
      'sql',
      'react',
      'k8s',
      'design',
      'security',
      'python',
      'ml',
      'writing',
    ];
    const note =
      'Leads the migration of the billing service. Prefers async reviews, writes long design docs, and mentors two juniors on the data team.';
    const people = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      name: `${first[i % 10]} ${last[(i * 7) % 10]}`,
      email: `${first[i % 10].toLowerCase()}${i + 1}@example.org`,
      team: ['Core', 'Infra', 'Design', 'Data'][i % 4],
      status: ['active', 'away', 'offline', 'active', 'busy'][i % 5],
      skills: skills.filter((_, k) => (i + k) % 3 === 0).slice(0, 1 + (i % 5)),
      load: (i * 37) % 101,
      rating: 1 + (i % 9) / 2,
      salary: 42000 + ((i * 7919) % 60000),
      seen: new Date(Date.now() - ((i * 9973) % 2000000) * 1000).toISOString(),
      note: i % 3 ? note.slice(0, 40 + (i % 90)) : `${note} ${note}`,
    }));
    const table = document.createElement('vt-table');
    table.setAttribute('variant', 'full');
    table.setAttribute('label', 'People');
    table.setAttribute('row-key', 'id');
    table.setAttribute('footer', '');
    table.setAttribute('pinned', '1');
    table.columns = [
      { key: 'name', display: 'avatar', subtitle: '{email}', width: 230 },
      { key: 'email', hidden: true },
      { key: 'team', display: 'badge' },
      {
        key: 'status',
        display: 'status',
        colors: { active: 'green', away: 'yellow', busy: 'red', offline: 'gray' },
      },
      { key: 'skills', display: 'tags', maxItems: 2, width: 200 },
      { key: 'load', display: 'progress', aggregate: 'avg' },
      { key: 'rating', display: 'rating' },
      { key: 'salary', display: 'currency', currency: 'EUR', aggregate: 'sum' },
      { key: 'seen', label: 'Last seen', display: 'relative' },
      { key: 'note', maxLength: 60, width: 260 },
    ];
    table.data = people;
    target.replaceChildren(table);
  },

  tableHuge(target) {
    const levels = ['info', 'warn', 'error', 'debug'];
    const rows = Array.from({ length: 100000 }, (_, i) => ({
      id: i + 1,
      time: new Date(Date.UTC(2026, 0, 1) + i * 61000).toISOString(),
      level: levels[(i * 7) % 4],
      service: `svc-${(i * 13) % 40}`,
      latency: (i * 7919) % 2000,
      message: `Request ${i + 1} handled by worker ${(i * 31) % 64}`,
    }));
    const table = document.createElement('vt-table');
    table.setAttribute('variant', 'full');
    table.setAttribute('label', 'requests.log');
    table.setAttribute('row-key', 'id');
    table.setAttribute('page-size', '0');
    table.setAttribute('max-height', '460px');
    table.setAttribute('density', 'compact');
    table.columns = [
      { key: 'id', width: 80 },
      { key: 'time', display: 'date', dateStyle: 'datetime', width: 180 },
      {
        key: 'level',
        display: 'badge',
        colors: { info: 'blue', warn: 'orange', error: 'red', debug: 'gray' },
      },
      { key: 'service', display: 'code' },
      { key: 'latency', suffix: ' ms', display: 'number', aggregate: 'avg' },
      { key: 'message', width: 320 },
    ];
    table.data = rows;
    target.replaceChildren(table);
  },

  tableLong(target) {
    const lorem =
      'Vitrine keeps long cells readable: the text is cut, a See all button opens it in place, and the row grows only while it is open. ';
    const table = document.createElement('vt-table');
    table.setAttribute('variant', 'full');
    table.setAttribute('label', 'Reviews');
    table.columns = [
      { key: 'product', width: 140 },
      { key: 'stars', display: 'rating' },
      { key: 'review', maxLength: 90, width: 380 },
      { key: 'reply', display: 'text', maxLength: 50 },
      { key: 'payload', display: 'json', maxLength: 40 },
    ];
    table.data = Array.from({ length: 30 }, (_, i) => ({
      product: ['Keyboard', 'Mouse', 'Screen', 'Desk'][i % 4],
      stars: 1 + (i % 5),
      review: lorem.repeat(1 + (i % 6)),
      reply: i % 2 ? 'Thanks a lot for this detailed feedback, we passed it to the team.' : '',
      payload: {
        order: 1000 + i,
        items: [{ sku: `SKU-${i}`, qty: 1 + (i % 3) }],
        gift: i % 4 === 0,
      },
    }));
    target.replaceChildren(table);
  },

  tableActions(target) {
    const table = document.createElement('vt-table');
    table.setAttribute('variant', 'full');
    table.setAttribute('label', 'Tickets');
    table.setAttribute('row-key', 'id');
    table.setAttribute('page-size', '10');
    table.columns = [
      { key: 'id', label: '#', width: 70 },
      { key: 'subject', editable: true, width: 260 },
      { key: 'state', display: 'status', colors: { open: 'green', closed: 'gray' } },
      { key: 'owner', display: 'avatar' },
    ];
    table.data = Array.from({ length: 34 }, (_, i) => ({
      id: 100 + i,
      subject: `Ticket ${100 + i}: ${['Login fails', 'Slow page', 'Typo', 'Export broken'][i % 4]}`,
      state: i % 3 ? 'open' : 'closed',
      owner: ['Ada Lovelace', 'Alan Turing', 'Grace Hopper'][i % 3],
    }));
    table.bulkActions = [
      { id: 'close', label: 'Close' },
      { id: 'delete', label: 'Delete', danger: true },
    ];
    table.addEventListener('vt-bulk-action', (event) => {
      const { action, keys } = event.detail;
      if (action === 'delete') table.removeRows(keys);
      if (action === 'close') for (const key of keys) table.updateRow(key, { state: 'closed' });
    });
    table.addEventListener('vt-cell-edit', (event) => console.log('edited', event.detail));
    target.replaceChildren(table);
  },

  render(target) {
    Vitrine.render(target, {
      type: 'code',
      variant: 'full',
      content: 'SELECT * FROM users WHERE id = $1;',
      options: { language: 'sql', label: 'query.sql', search: false },
    });
  },

  data(target) {
    const viewer = document.createElement('vt-json');
    viewer.setAttribute('variant', 'full');
    viewer.addEventListener('vt-copy', (event) => console.log('copied', event.detail.text));
    viewer.data = { fetchedAt: new Date().toISOString(), items: [{ id: 1 }, { id: 2 }] };
    target.replaceChildren(viewer);
  },

  loadingButtonSave(target) {
    const button = document.createElement('vt-loading-button');
    button.textContent = 'Save changes';
    button.setAttribute('loading-text', 'Saving…');
    button.setAttribute('success-text', 'Saved');
    button.setAttribute('error-text', 'Could not save');
    // A fake request: fails one time in three.
    const save = () =>
      new Promise((resolve, reject) =>
        setTimeout(() => (Math.random() < 0.33 ? reject() : resolve()), 1500),
      );
    button.addEventListener('click', () => button.track(save()).catch(() => {}));
    target.replaceChildren(button);
  },

  loadingOverlayToggle(target) {
    const overlay = document.createElement('vt-loading-overlay');
    overlay.setAttribute('active', 'false');
    overlay.setAttribute('text', 'Saving your profile…');
    overlay.setAttribute('cancelable', '');
    overlay.setAttribute('value', '0');
    const form = document.createElement('form');
    form.className = 'demo-form';
    for (const [label, name, value] of [
      ['Name', 'name', 'Ada Lovelace'],
      ['E-mail', 'email', 'ada@example.org'],
    ]) {
      const field = document.createElement('label');
      const input = document.createElement('input');
      input.name = name;
      input.value = value;
      field.append(label, input);
      form.append(field);
    }
    const save = document.createElement('button');
    save.textContent = 'Save';
    form.append(save);
    overlay.append(form);
    let timer;
    const finish = () => {
      clearInterval(timer);
      overlay.stop();
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      let value = 0;
      overlay.setAttribute('value', '0');
      overlay.start();
      timer = setInterval(() => {
        value += 10;
        overlay.setAttribute('value', String(value));
        if (value >= 100) finish();
      }, 300);
    });
    overlay.addEventListener('vt-cancel', finish);
    target.replaceChildren(overlay);
  },

  pageProgressNavigate(target) {
    // In a page, put one <vt-page-progress> in the body; here it stays in the demo box.
    const box = document.createElement('div');
    box.className = 'demo-frame';
    const bar = document.createElement('vt-page-progress');
    bar.setAttribute('placement', 'absolute');
    const go = document.createElement('button');
    go.textContent = 'Load the next page';
    go.addEventListener('click', () => {
      bar.start();
      // Pretend the request takes 2.5 s.
      setTimeout(() => bar.done(), 2500);
    });
    box.append(bar, go);
    target.replaceChildren(box);
  },

  progressUpload(target) {
    const bar = document.createElement('vt-progress');
    bar.setAttribute('text', 'Uploading backup-2026-11.tar.gz');
    bar.setAttribute('show-value', 'fraction');
    bar.setAttribute('unit', 'MB');
    bar.setAttribute('max', '840');
    bar.setAttribute('value', '0');
    let sent = 0;
    const timer = setInterval(() => {
      sent = Math.min(840, sent + 35 + Math.round(Math.random() * 40));
      bar.value = sent;
    }, 200);
    bar.addEventListener('vt-complete', () => {
      clearInterval(timer);
      bar.setAttribute('status', 'success');
      bar.setAttribute('text', 'Uploaded');
    });
    target.replaceChildren(bar);
  },

  stepsDeploy(target) {
    const steps = document.createElement('vt-loading-steps');
    steps.setAttribute('text', 'Deploying shop-api v2.4.0');
    steps.steps = [
      'Build image',
      'Run tests',
      'Push to registry',
      'Migrate database',
      'Roll out',
    ].map((label, i) => ({ label, status: i === 0 ? 'running' : 'pending' }));
    let current = 0;
    const started = Date.now();
    const timer = setInterval(() => {
      steps.setStep(current, { status: 'done', duration: Date.now() - started });
      current += 1;
      if (current < steps.steps.length) steps.setStep(current, { status: 'running' });
      else clearInterval(timer);
    }, 1400);
    target.replaceChildren(steps);
  },
};

for (const example of document.querySelectorAll('.example[data-script]')) {
  const run = SCRIPTS[example.dataset.script];
  if (!run) continue;
  const source = dedent(run.toString().replace(/^\w+\(target\) \{|\}$/g, ''));
  run(layout(example, 'js', source));
}
