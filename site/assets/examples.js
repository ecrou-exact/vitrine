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

/** Builds the two columns of an example: live result and source. */
function layout(example, language, source) {
  const live = document.createElement('div');
  live.className = 'example-live';
  const code = document.createElement('vt-code');
  code.setAttribute('language', language);
  code.setAttribute('copy', '');
  code.content = source;
  example.append(live, code);
  return live;
}

for (const example of document.querySelectorAll('.example')) {
  const template = example.querySelector('template');
  if (!template) continue;
  // Serializing the inert template gives back the markup as written (minus indentation).
  const live = layout(example, 'html', dedent(template.innerHTML));
  live.append(template.content.cloneNode(true));
}

const SCRIPTS = {
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
};

for (const example of document.querySelectorAll('.example[data-script]')) {
  const run = SCRIPTS[example.dataset.script];
  if (!run) continue;
  const source = dedent(run.toString().replace(/^\w+\(target\) \{|\}$/g, ''));
  run(layout(example, 'js', source));
}
