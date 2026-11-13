/**
 * Integrations page: framework snippets (set through the content property, so their
 * syntax is never parsed as HTML) and the live form binding demo.
 */
const CDN = 'https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist';

const SNIPPETS = {
  html: `<script src="${CDN}/vitrine.min.js"></script>

<!-- Your own content can be written inline. -->
<vt-code language="bash" copy>npm run build</vt-code>

<!-- Content you did not write: always through the content property. -->
<vt-markdown id="comment" variant="full"></vt-markdown>
<script type="module">
  const comment = document.getElementById('comment');
  comment.content = await fetch('/api/comments/42').then((r) => r.text());
  comment.addEventListener('vt-error', (event) => console.warn(event.detail.message));
</script>`,

  modules: `<!-- Only <vt-code> and <vt-tags>: their shared code is downloaded once. -->
<script type="module" src="${CDN}/esm/vt-code.js"></script>
<script type="module" src="${CDN}/esm/vt-tags.js"></script>

<!-- Or everything, as one ES module: -->
<script type="module">
  import { defineAll, configure } from '${CDN}/esm/vitrine.js';
  configure({ theme: 'auto', syntaxTheme: 'github', syntaxThemeDark: 'github-dark' });
  defineAll();
</script>`,

  vueConfig: `import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue({
      template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('vt-') } },
    }),
  ],
});`,

  vue: `<script setup>
import { ref } from 'vue';
import '${CDN}/esm/vt-tags.js';
import '${CDN}/esm/vt-markdown.js';

const topics = ref(['design']);
const options = ['design', 'research', 'accessibility', 'performance'];
const notes = ref('# Notes');
</script>

<template>
  <!-- v-model-like binding: property in, event out. -->
  <vt-tags
    mode="edit"
    prefix="#"
    :value.prop="topics"
    :options.prop="options"
    @vt-change="topics = $event.detail.value"
  />

  <vt-markdown
    mode="edit"
    variant="full"
    :content.prop="notes"
    @vt-input="notes = $event.detail.value"
  />
</template>`,

  react: `import { useEffect, useRef, useState } from 'react';
import '${CDN}/esm/vt-tags.js';

export function TopicsField({ options }) {
  const [topics, setTopics] = useState(['design']);
  const ref = useRef(null);

  // React 19 sets properties and adds listeners for custom elements directly:
  //   <vt-tags value={topics} options={options} onvt-change={...} />
  // The ref version below also works with React 18.
  useEffect(() => {
    const element = ref.current;
    element.options = options;
    const onChange = (event) => setTopics(event.detail.value);
    element.addEventListener('vt-change', onChange);
    return () => element.removeEventListener('vt-change', onChange);
  }, [options]);

  useEffect(() => {
    ref.current.value = topics;
  }, [topics]);

  return <vt-tags ref={ref} mode="edit" prefix="#" name="topics" />;
}`,

  svelte: `<script>
  import '${CDN}/esm/vt-json.js';
  import '${CDN}/esm/vt-tags.js';

  let { order } = $props();
  let topics = $state(['design']);
</script>

<vt-json variant="full" data={order}></vt-json>

<vt-tags
  mode="edit"
  value={topics}
  onvt-change={(event) => (topics = event.detail.value)}
></vt-tags>`,

  angular: `import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import '${CDN}/esm/vt-tags.js';

@Component({
  selector: 'app-topics',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: \`
    <vt-tags
      mode="edit"
      prefix="#"
      [value]="topics()"
      [options]="options"
      (vt-change)="topics.set($any($event).detail.value)"
    ></vt-tags>
  \`,
})
export class TopicsComponent {
  topics = signal<string[]>(['design']);
  options = ['design', 'research', 'accessibility'];
}`,

  forms: `<form action="/posts" method="post">
  <label for="title">Title</label>
  <input id="title" name="title" required />

  <!-- Submitted as topics=["design","a11y"]. Use value-format="csv" or "lines" if you prefer. -->
  <vt-tags name="topics" mode="edit" prefix="#" required max-tags="5" pattern="[a-z0-9-]+">
    <template>{ "options": ["design", "research", "a11y"] }</template>
  </vt-tags>

  <button>Publish</button>
</form>

<script type="module">
  // Refuse a new tag after asking your backend.
  document.querySelector('vt-tags').addEventListener('vt-tag-create', (event) => {
    if (event.detail.tag.value.length < 2) event.preventDefault();
  });
</script>`,

  backendHtml: `<!-- {query} is replaced by what the user types (URL-encoded). -->
<vt-tags
  mode="edit"
  name="labels"
  suggest-src="/api/labels?q={query}"
  options-src="/api/labels/popular"
></vt-tags>`,

  backendServer: `# Flask: return a JSON array of strings or tag objects.
@app.get("/api/labels")
def labels():
    query = request.args.get("q", "").strip().lower()
    rows = Label.query.filter(Label.name.ilike(f"{query}%")).limit(20)
    return jsonify([
        {"value": row.slug, "label": row.name, "count": row.uses, "color": row.color}
        for row in rows
    ])`,

  backendFunction: `// Any async function returning an array works: GraphQL, a SDK, a local index…
const tags = document.querySelector('vt-tags');

tags.suggest = async (query, signal) => {
  const response = await fetch(\`/api/labels?q=\${encodeURIComponent(query)}\`, { signal });
  return response.json();
};`,

  php: `<?php $tags = $post->tags(); // data from users or the database ?>

<vt-tags id="post-tags" counts></vt-tags>

<!-- JSON_HEX_TAG turns < and > into \\u003C / \\u003E: "</script>" cannot close the tag. -->
<script type="application/json" id="post-tags-data">
  <?= json_encode($tags, JSON_HEX_TAG | JSON_HEX_AMP | JSON_THROW_ON_ERROR) ?>
</script>
<script type="module">
  const data = document.getElementById('post-tags-data').textContent;
  document.getElementById('post-tags').content = data;
</script>`,

  django: `{# json_script escapes the data safely for a <script> element. #}
{{ post.body_markdown|json_script:"post-body" }}

<vt-markdown id="post" variant="full" images="same-origin"></vt-markdown>

<script type="module">
  const body = JSON.parse(document.getElementById('post-body').textContent);
  document.getElementById('post').content = body;
</script>`,
};

SNIPPETS.markdownIt = `import MarkdownIt from 'markdown-it';
import vitrine from 'vitrine/markdown-it';

const md = new MarkdownIt().use(vitrine, {
  variant: 'full', // or leave it out for the simple variant
  elements: { chart: false }, // a language left to markdown-it
  attributes: { 'vt-code': { 'line-numbers': '' } },
});

md.render('\`\`\`sql title="Active users"\\nSELECT * FROM users WHERE active;\\n\`\`\`');
// <vt-sql variant="full" label="Active users"><template>SELECT * FROM users…</template></vt-sql>`;

SNIPPETS.remark = `import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkVitrine from 'vitrine/remark';

const html = await unified()
  .use(remarkParse)
  .use(remarkVitrine, { variant: 'full' })
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeStringify)
  .process(markdown);`;

for (const element of document.querySelectorAll('vt-code.snippet')) {
  const snippet = SNIPPETS[element.dataset.snippet];
  if (snippet) element.content = snippet;
}

// Pick your elements: the tags to copy, and what a visitor downloads.
const picker = document.getElementById('picker-list');
const total = document.getElementById('picker-total');
const KB = 1024;
const kb = (bytes) => `${(bytes / KB).toFixed(bytes < 10 * KB ? 1 : 0)} KB`;

/** @param {{ files: Record<string, { size: number, imports: string[] }>, elements: string[], loader: number, full: number }} sizes */
function setUpPicker(sizes) {
  const chosen = new Set(['code', 'markdown']);
  const boxes = sizes.elements.sort().map((name) => {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = name;
    box.checked = chosen.has(name);
    const label = document.createElement('label');
    label.append(box, `<vt-${name}>`);
    picker.append(label);
    return box;
  });

  /** Gzipped bytes of the modules of the chosen elements, each shared chunk once. */
  const download = (names) => {
    const seen = new Set();
    const visit = (file) => {
      if (seen.has(file) || !sizes.files[file]) return;
      seen.add(file);
      for (const next of sizes.files[file].imports) visit(next);
    };
    for (const name of names) visit(`vt-${name}.js`);
    return [...seen].reduce((sum, file) => sum + sizes.files[file].size, 0);
  };

  const update = () => {
    const names = boxes.filter((box) => box.checked).map((box) => box.value);
    const bytes = download(names);
    total.replaceChildren();
    if (!names.length) {
      total.append('Check at least one element.');
    } else if (bytes + sizes.loader >= sizes.full) {
      total.append(
        `${kb(bytes)} with modules: more than the full bundle (${kb(sizes.full)}). `,
        Object.assign(document.createElement('span'), {
          className: 'muted',
          textContent: 'Use dist/vitrine.min.js, one file with every element.',
        }),
      );
    } else {
      total.append(
        `${kb(sizes.loader + bytes)} with the loader`,
        Object.assign(document.createElement('span'), {
          className: 'muted',
          textContent: ` — ${kb(sizes.loader)} for the loader, ${kb(bytes)} for ${names.length === 1 ? 'the element' : `${names.length} elements`}, instead of ${kb(sizes.full)} for the full bundle.`,
        }),
      );
    }
    const list = names.length ? names : ['code'];
    document.getElementById('picker-loader').content =
      `<!-- Loads ${list.map((n) => `<vt-${n}>`).join(', ')} only when a page has them. -->
<script src="${CDN}/vitrine-loader.js"
        data-config='{"theme": "auto"}'></script>

<vt-${list[0]}>…</vt-${list[0]}>`;
    document.getElementById('picker-modules').content = list
      .map((n) => `<script type="module" src="${CDN}/esm/vt-${n}.js"></script>`)
      .join('\n');
    document.getElementById('picker-bundler').content =
      `// npm install github:ecrou-exact/vitrine#v0.14.0
${list.map((n) => `import 'vitrine/${n}';`).join('\n')}
import { configure } from 'vitrine/api';

configure({ theme: 'auto' });`;
  };

  picker.addEventListener('change', update);
  document.getElementById('picker-none').addEventListener('click', () => {
    for (const box of boxes) box.checked = false;
    update();
  });
  document.getElementById('picker-all').addEventListener('click', () => {
    for (const box of boxes) box.checked = true;
    update();
  });
  update();
}

fetch('assets/modules.json')
  .then((response) => response.json())
  .then(setUpPicker)
  .catch(() => {
    total.textContent = 'Sizes are not available.';
  });

// Live binding demo.
const tags = document.getElementById('demo-tags');
const output = document.getElementById('demo-output');
const form = document.getElementById('demo-form');

tags.content = JSON.stringify({
  value: ['design'],
  options: [
    { value: 'design', group: 'Product', count: 8, color: '#14b8a6' },
    { value: 'research', group: 'Product', count: 5 },
    { value: 'accessibility', group: 'Quality', count: 4 },
    { value: 'performance', group: 'Quality', count: 2 },
    { value: 'security', group: 'Quality', count: 7, color: '#e5484d' },
  ],
});

function show(event) {
  output.data = {
    event: event ? { type: event.type, detail: event.detail } : null,
    formData: Object.fromEntries(new FormData(form)),
  };
}

tags.addEventListener('vt-change', show);
customElements.whenDefined('vt-tags').then(() => show(null));
