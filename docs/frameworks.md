# Using Vitrine with frameworks and server-side languages

Vitrine elements are standard custom elements, so they work in any framework that renders HTML. This page covers the details that differ between frameworks: telling the compiler about custom elements, passing content as a **property**, listening to events, and binding editors and tag fields to your application state.

## General rules

1. **Load Vitrine before your application code sets properties on the elements.** If a property such as `content` is set on a `<vt-code>` before the element is defined, Vitrine applies it when the element upgrades (this works for `content`, the `data` property of `<vt-json>`, the `original` and `modified` properties of `<vt-diff>`, and the `value`, `options` and `suggest` properties of `<vt-tags>`). Loading Vitrine first is still the simplest: load the classic script in the page `<head>` before your application bundle, import the modules before your application mounts, or wait for the definition:

   ```js
   await customElements.whenDefined('vt-code');
   element.content = source;
   ```

2. **Pass dynamic content as a property, not as children.** Bind the `content` property (or `data` on `<vt-json>`, `value` and `options` on `<vt-tags>`). Do not render untrusted text as children of the element. See [Getting started](getting-started.md#content-sources).
3. **Attributes are strings.** Boolean features accept `""` or `"true"` to turn them on and `"false"` to turn them off.
4. **Events** are DOM `CustomEvent`s that bubble and are composed: `vt-ready`, `vt-copy`, `vt-search`, `vt-tab-change`, `vt-error`, and for editing `vt-input`, `vt-change` and `vt-mode-change`. See [Events](common-attributes.md#events).
5. **Editors: property in, event out.** Set `content` to load a document, and read the edits from `vt-input` or `vt-change` (`event.detail.value`). Writing each edit back into `content` is safe: setting the text the editor already shows does nothing, so the caret and the undo history are kept. See [Editing](editing.md#reading-the-edited-value).
6. **Tags: `value` in, `vt-change` out.** `<vt-tags>` dispatches `vt-change` with `{ value, added, removed }` whenever the selection changes. Setting the `value` property does not dispatch events, so binding `value` and updating it from `vt-change` gives a two-way binding without loops.

### Loading Vitrine in a bundled application

Either load the classic script in your HTML template:

```html
<script src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/vitrine.min.js"></script>
```

or import the ES modules from a local copy of `dist/` (for example a git submodule) at the start of your entry file. Import only the components you use:

```js
import './vendor/vitrine/dist/esm/vt-code.js';
import './vendor/vitrine/dist/esm/vt-tags.js';
```

or every component:

```js
import { configure, defineAll } from './vendor/vitrine/dist/esm/vitrine.js';

configure({ theme: 'auto', syntaxTheme: 'github', syntaxThemeDark: 'github-dark' });
defineAll();
```

The modules find `languages/` and `syntax-themes/` relative to their own URL. When a bundler rewrites or inlines them, that location changes: serve the `languages/` and `syntax-themes/` folders yourself and set `languagesUrl` and `syntaxThemesUrl`:

```js
import { configure } from './vendor/vitrine/dist/esm/vt-code.js';

configure({
  languagesUrl: '/vendor/vitrine/languages/',
  syntaxThemesUrl: '/vendor/vitrine/syntax-themes/',
});
```

See [Per-component modules](getting-started.md#per-component-modules).

## Plain HTML

Your own content can be written inline. Content you did not write goes through the `content` property:

```html
<script src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/vitrine.min.js"></script>

<vt-code language="bash" copy>npm run build</vt-code>

<vt-markdown id="comment" variant="full"></vt-markdown>
<script type="module">
  const comment = document.getElementById('comment');
  comment.content = await fetch('/api/comments/42').then((r) => r.text());
  comment.addEventListener('vt-error', (event) => console.warn(event.detail.message));
</script>
```

## Vue 3

Tell the Vue compiler that `vt-*` tags are custom elements, so it does not try to resolve them as Vue components:

```js
// vite.config.js
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('vt-'),
        },
      },
    }),
  ],
});
```

Bind properties with the `.prop` modifier (or `:content.prop`), and listen to events with `@vt-…`:

```vue
<script setup>
import { ref } from 'vue';
import './vendor/vitrine/dist/esm/vt-code.js';
import './vendor/vitrine/dist/esm/vt-json.js';

const code = ref('console.log("hello");');
const onCopy = (event) => console.log('copied', event.detail.text);
</script>

<template>
  <vt-code language="js" variant="full" :content.prop="code" @vt-copy="onCopy" />
  <vt-json variant="full" :data.prop="{ id: 1, tags: ['a', 'b'] }" />
</template>
```

`:content="code"` also works when the element is already defined at mount time, because Vue sets a property when the element has one. `.prop` makes the intent explicit and does not depend on load order.

### Editors and tag fields

`<vt-tags>` can be bound like `v-model`: the `value` property in, `vt-change` out. For an editor, pass the initial text once and keep the edits in another ref:

```vue
<script setup>
import { ref } from 'vue';
import './vendor/vitrine/dist/esm/vt-tags.js';
import './vendor/vitrine/dist/esm/vt-markdown.js';

const topics = ref(['design']);
const options = ['design', 'research', 'accessibility', 'performance'];

const initialNotes = '# Notes';
const notes = ref(initialNotes);
const save = () => fetch('/api/notes', { method: 'PUT', body: notes.value });
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

  <!-- The editor keeps its own text: content is only the initial document. -->
  <vt-markdown
    mode="edit"
    variant="full"
    :content.prop="initialNotes"
    @vt-input="notes = $event.detail.value"
    @vt-change="save"
  />

  <p>{{ topics.length }} topics, {{ notes.length }} characters</p>
</template>
```

Binding `:content.prop="notes"` together with `@vt-input="notes = $event.detail.value"` also works: the element ignores a `content` equal to the text it shows, so typing never resets the editor.

## React

### React 19 and later

React 19 supports custom elements: it sets a property when the element defines one (`content`, `data`, `value`, `options`) and an attribute otherwise, and a prop named `on` followed by an event name adds a listener for that event (`onvt-change` listens to `vt-change`). Make sure Vitrine is loaded before React renders (see the general rules).

```jsx
import { useState } from 'react';
import './vendor/vitrine/dist/esm/vt-code.js';
import './vendor/vitrine/dist/esm/vt-tags.js';

export function CodeSample({ source }) {
  return <vt-code language="python" variant="full" line-numbers="true" content={source} />;
}

export function TopicsField({ options }) {
  const [topics, setTopics] = useState(['design']);
  return (
    <vt-tags
      mode="edit"
      prefix="#"
      name="topics"
      value={topics}
      options={options}
      onvt-change={(event) => setTopics(event.detail.value)}
    />
  );
}
```

For an editor, pass the initial text and keep the edits in state or a ref, without feeding them back into `content`:

```jsx
import { useRef } from 'react';
import './vendor/vitrine/dist/esm/vt-json.js';

export function SettingsEditor({ initialJson, onSave }) {
  const text = useRef(initialJson);
  return (
    <vt-json
      mode="edit"
      label="settings.json"
      content={initialJson}
      onvt-input={(event) => (text.current = event.detail.value)}
      onvt-change={() => onSave(text.current)}
    />
  );
}
```

### With a ref (React 18 and later)

Attaching properties and listeners with a ref works in every React version:

```jsx
import { useEffect, useRef, useState } from 'react';
import './vendor/vitrine/dist/esm/vt-tags.js';

export function TopicsField({ options }) {
  const [topics, setTopics] = useState(['design']);
  const ref = useRef(null);

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
}
```

React 18 and earlier pass every prop as an attribute, so `content={source}` would only create an unused `content` attribute. Set properties with a ref:

```jsx
import { useEffect, useRef } from 'react';

export function CodeSample({ source }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current.content = source;
  }, [source]);

  return <vt-code ref={ref} language="python" variant="full" />;
}
```

## Svelte

Svelte sets a property when the element has one, so `content`, `data` and `value` can be bound directly. In Svelte 5, an attribute named `on` followed by an event name adds a listener:

```svelte
<script>
  import './vendor/vitrine/dist/esm/vt-json.js';
  import './vendor/vitrine/dist/esm/vt-tags.js';
  import './vendor/vitrine/dist/esm/vt-code.js';

  let { order, initialCode } = $props();
  let topics = $state(['design']);
  let code = $state(initialCode);
</script>

<vt-json variant="full" data={order}></vt-json>

<vt-tags
  mode="edit"
  value={topics}
  onvt-change={(event) => (topics = event.detail.value)}
></vt-tags>

<!-- Initial text in, edits out: content is not bound to `code`. -->
<vt-code
  mode="edit"
  language="js"
  content={initialCode}
  onvt-input={(event) => (code = event.detail.value)}
></vt-code>
```

In Svelte 4, add listeners with `on:vt-change={handler}`, or with `addEventListener` in `onMount` on an element bound with `bind:this`.

As with the other frameworks, load Vitrine before the component mounts.

## Angular

Add `CUSTOM_ELEMENTS_SCHEMA` to the component (or module) that uses the elements, so Angular accepts unknown tags and properties. `[content]` and `[value]` are property bindings, and `(vt-change)` listens to the event:

```ts
import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import './vendor/vitrine/dist/esm/vt-code.js';
import './vendor/vitrine/dist/esm/vt-tags.js';

@Component({
  selector: 'app-topics',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <vt-tags
      mode="edit"
      prefix="#"
      [value]="topics()"
      [options]="options"
      (vt-change)="topics.set($any($event).detail.value)"
    ></vt-tags>

    <vt-code
      mode="edit"
      language="ts"
      variant="full"
      [content]="initialSource"
      (vt-change)="save($any($event).detail.value)"
      (vt-copy)="onCopy($event)"
    ></vt-code>
  `,
})
export class TopicsComponent {
  topics = signal<string[]>(['design']);
  options = ['design', 'research', 'accessibility'];
  initialSource = 'const answer: number = 42;';

  save(source: string) {
    console.log('saved', source.length, 'characters');
  }

  onCopy(event: Event) {
    console.log('copied', (event as CustomEvent<{ text: string }>).detail.text);
  }
}
```

Use `[attr.label]="fileName"` to bind an attribute.

Load the Vitrine script in `src/index.html`, or import the ES modules in `main.ts` (and call `defineAll()` when you import `dist/esm/vitrine.js`) before bootstrapping the application.

## HTML forms

`<vt-tags>` is a form-associated element: with a `name`, it is submitted with its form like any field, validated with `required`, reset with the form, and disabled with a `disabled` `<fieldset>`. No JavaScript is needed:

```html
<form action="/posts" method="post">
  <label for="title">Title</label>
  <input id="title" name="title" required />

  <!-- Submitted as topics=["design","a11y"]. Use value-format="csv" or "lines" if you prefer. -->
  <vt-tags name="topics" mode="edit" prefix="#" required max-tags="5" pattern="[a-z0-9-]+">
    <template>{ "options": ["design", "research", "a11y"] }</template>
  </vt-tags>

  <button>Publish</button>
</form>
```

To refuse some new tags before they are added, listen to the cancelable `vt-tag-create` event:

```html
<script type="module">
  document.querySelector('vt-tags').addEventListener('vt-tag-create', (event) => {
    if (event.detail.tag.value.length < 2) event.preventDefault();
  });
</script>
```

The listener must decide synchronously; see [Validating new tags on the server](components/tags.md#validating-new-tags-on-the-server) for a backend check. Always validate the submitted value on the server as well.

The code editors are not form fields. To submit edited text, copy it into a hidden input:

```html
<form id="post" action="/posts" method="post">
  <vt-markdown id="body" mode="edit" variant="full" src="/drafts/42.md"></vt-markdown>
  <input type="hidden" name="body" />
  <button>Save</button>
</form>

<script type="module">
  const form = document.getElementById('post');
  form.addEventListener('submit', () => {
    form.elements.body.value = document.getElementById('body').content;
  });
</script>
```

## Backend tag suggestions

`suggest-src` asks your backend for suggestions while the user types. `{query}` is replaced by the URL-encoded text, and the endpoint returns a JSON array of strings or tag objects. `options-src` loads a list of options once:

```html
<vt-tags
  mode="edit"
  name="labels"
  suggest-src="/api/labels?q={query}"
  options-src="/api/labels/popular"
></vt-tags>
```

```python
# Flask: return a JSON array of strings or tag objects.
@app.get("/api/labels")
def labels():
    query = request.args.get("q", "").strip().lower()
    rows = Label.query.filter(Label.name.ilike(f"{query}%")).limit(20)
    return jsonify([
        {"value": row.slug, "label": row.name, "count": row.uses, "color": row.color}
        for row in rows
    ])
```

```php
// PHP: same contract.
$query = trim($_GET['q'] ?? '');
$stmt = $pdo->prepare('SELECT slug AS value, name AS label, uses AS count FROM labels WHERE name LIKE ? LIMIT 20');
$stmt->execute([$query . '%']);
header('Content-Type: application/json');
echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_THROW_ON_ERROR);
```

The requests follow the `src` rules: same-origin unless `allow-remote` is set (the server must then allow your origin with CORS). Return `count` as a number: a string is ignored.

Any async function can provide suggestions instead (GraphQL, an SDK, a local index):

```js
const tags = document.querySelector('vt-tags');

tags.suggest = async (query, signal) => {
  const response = await fetch(`/api/labels?q=${encodeURIComponent(query)}`, { signal });
  return response.json();
};
```

See [`<vt-tags>`](components/tags.md#backend-suggestions-suggest-src) for the delay, cancellation and limits.

## Server-rendered pages (PHP, Django, WordPress…)

Server-side templates often have the data to display at render time. Never print untrusted data inside the Vitrine element: the browser parses it as page HTML before Vitrine runs. Instead, serialize the data into a JSON data block, and set the `content` property from a script.

The data block must be escaped so that the data cannot close the `<script>` element. In JSON, `<`, `>` and `&` can be written as `<`, `>` and `&`, which is what the functions below do.

### PHP

```php
<?php $tags = $post->tags(); // data from users or the database ?>

<vt-tags id="post-tags" counts></vt-tags>

<!-- JSON_HEX_TAG turns < and > into < and >: "</script>" cannot close the tag. -->
<script type="application/json" id="post-tags-data">
  <?= json_encode($tags, JSON_HEX_TAG | JSON_HEX_AMP | JSON_THROW_ON_ERROR) ?>
</script>
```

```js
// /js/post.js (an external file works under a strict CSP)
const data = document.getElementById('post-tags-data').textContent;
document.getElementById('post-tags').content = data; // <vt-tags> reads JSON text
```

For a component that displays text, decode the JSON string first:

```php
<vt-code id="snippet" language="php" variant="full"></vt-code>

<script type="application/json" id="snippet-data">
<?= json_encode($code, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>
</script>
```

```js
const data = document.getElementById('snippet-data').textContent;
document.getElementById('snippet').content = JSON.parse(data);
```

### Django

The built-in `json_script` filter writes a correctly escaped `<script type="application/json">` element:

```django
{{ post.body_markdown|json_script:"post-body" }}

<vt-markdown id="post" variant="full" images="same-origin"></vt-markdown>
```

```js
const body = JSON.parse(document.getElementById('post-body').textContent);
document.getElementById('post').content = body;
```

For tags, pass a list and give `<vt-tags>` the JSON text:

```django
{{ post_tags|json_script:"post-tags" }}
<vt-tags id="tags" name="tags" mode="edit"></vt-tags>
```

```js
document.getElementById('tags').content = document.getElementById('post-tags').textContent;
```

### WordPress

Enqueue the Vitrine script, and pass the data with `wp_json_encode`:

```php
add_action('wp_enqueue_scripts', function () {
    wp_enqueue_script(
        'vitrine',
        'https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/vitrine.min.js',
        [],
        null
    );
});
```

```php
<vt-code id="snippet-<?= esc_attr($post_id) ?>" language="php"></vt-code>
<script type="application/json" id="snippet-<?= esc_attr($post_id) ?>-data">
<?= wp_json_encode($code, JSON_HEX_TAG | JSON_HEX_AMP) ?>
</script>
```

Then set `content` from your theme's script, as in the PHP example.

### Loading from a URL instead

When the content is available at a URL on your site, `src` avoids embedding it in the page:

```html
<vt-json src="/api/report/42.json" variant="full"></vt-json>
```

## Server-side rendering

Vitrine elements render on the client. During server-side rendering (Next.js, Nuxt, SvelteKit, Angular Universal…), only the tag and its attributes are sent; the shadow DOM, highlighting and controls are created when the script runs in the browser.

- Load Vitrine only in the browser (for example in a client-only component, or with a dynamic import inside an effect), because it uses browser APIs such as `customElements` and `HTMLElement` when it loads.
- Set `content` in client code (an effect, `onMount`, `ngAfterViewInit`…).
- Until the element is defined, any inline text inside it is visible as plain text. You can style that state with the `:not(:defined)` selector:

```css
vt-code:not(:defined),
vt-markdown:not(:defined),
vt-json:not(:defined),
vt-csv:not(:defined),
vt-tags:not(:defined),
vt-diff:not(:defined) {
  display: block;
  min-height: 3rem;
  visibility: hidden;
}
```
