/**
 * Integrations page: framework snippets (set through the content property, so their
 * syntax is never parsed as HTML) and the live form binding demo.
 */
const CDN = 'https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist';

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
import 'vitrine/dist/esm/vt-tags.js';
import 'vitrine/dist/esm/vt-markdown.js';

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
import 'vitrine/dist/esm/vt-tags.js';

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
  import 'vitrine/dist/esm/vt-json.js';
  import 'vitrine/dist/esm/vt-tags.js';

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
import 'vitrine/dist/esm/vt-tags.js';

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

for (const element of document.querySelectorAll('vt-code.snippet')) {
  const snippet = SNIPPETS[element.dataset.snippet];
  if (snippet) element.content = snippet;
}

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
