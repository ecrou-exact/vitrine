# Using Vitrine with frameworks and server-side languages

Vitrine elements are standard custom elements, so they work in any framework that renders HTML. This page covers the details that differ between frameworks: telling the compiler about custom elements, passing content as a **property**, and listening to events.

## General rules

1. **Load Vitrine before your application code sets properties on the elements.** If a property such as `content` is set on a `<vt-code>` before the element is defined, the value is stored on the plain element and Vitrine never sees it. Load the classic script in the page `<head>` before your application bundle, or call `defineAll()` before your application mounts. When in doubt, wait for the definition:

   ```js
   await customElements.whenDefined('vt-code');
   element.content = source;
   ```

2. **Pass dynamic content as a property, not as children.** Bind the `content` property (or `data` on `<vt-json>`). Do not render untrusted text as children of the element. See [Getting started](getting-started.md#content-sources).
3. **Attributes are strings.** Boolean features accept `""` or `"true"` to turn them on and `"false"` to turn them off.
4. **Events** are DOM `CustomEvent`s named `vt-ready`, `vt-copy`, `vt-search`, `vt-tab-change` and `vt-error`. They bubble and are composed.

### Loading Vitrine in a bundled application

Either load the classic script in your HTML template:

```html
<script src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/vitrine.min.js"></script>
```

or import the ES module from a local copy of `dist/` (for example a git submodule) at the start of your entry file:

```js
import { configure, defineAll } from './vendor/vitrine/dist/vitrine.esm.js';

// The bundler may move the module, so tell Vitrine where the language files are served.
configure({ languagesUrl: '/vendor/vitrine/languages/' });
defineAll();
```

The ES module finds `languages/` relative to its own URL. When a bundler rewrites or inlines the module, that location changes: serve the `languages/` folder yourself and set `languagesUrl`.

## Vue

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

Bind `content` as a property. The `.prop` modifier always sets a DOM property:

```vue
<script setup>
import { ref } from 'vue';

const code = ref('console.log("hello");');
const onCopy = (event) => console.log('copied', event.detail.text);
</script>

<template>
  <vt-code language="js" variant="full" :content.prop="code" @vt-copy="onCopy" />
  <vt-json variant="full" :data.prop="{ id: 1, tags: ['a', 'b'] }" />
</template>
```

`:content="code"` also works when the element is already defined at mount time, because Vue sets a property when the element has one. `.prop` makes the intent explicit and does not depend on load order.

## React

### React 19 and later

React 19 supports custom elements: it sets a property when the element defines one (`content`, `data`) and an attribute otherwise. Make sure Vitrine is loaded before React renders (see the general rules).

```jsx
export function CodeSample({ source }) {
  return <vt-code language="python" variant="full" line-numbers="true" content={source} />;
}
```

Attach event listeners with a ref, which works in every React version:

```jsx
import { useEffect, useRef } from 'react';

export function JsonViewer({ text, onError }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    const handler = (event) => onError(event.detail.message);
    element.addEventListener('vt-error', handler);
    return () => element.removeEventListener('vt-error', handler);
  }, [onError]);

  return <vt-json ref={ref} variant="full" content={text} />;
}
```

### React 18 and earlier

Older versions pass every prop as an attribute, so `content={source}` would only create an unused `content` attribute. Set the property with a ref:

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

Svelte sets a property when the element has one, so `content` and `data` can be bound directly:

```svelte
<script>
  import { onMount } from 'svelte';

  export let source = 'print("hello")';
  let viewer;

  onMount(() => {
    const handler = (event) => console.log('copied', event.detail.text);
    viewer.addEventListener('vt-copy', handler);
    return () => viewer.removeEventListener('vt-copy', handler);
  });
</script>

<vt-code bind:this={viewer} language="python" variant="full" content={source}></vt-code>
```

As with the other frameworks, load Vitrine before the component mounts.

## Angular

Add `CUSTOM_ELEMENTS_SCHEMA` to the component (or module) that uses the elements, so Angular accepts unknown tags and properties:

```ts
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

@Component({
  selector: 'app-snippet',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <vt-code
      language="ts"
      variant="full"
      [content]="source"
      (vt-copy)="onCopy($event)"
    ></vt-code>
  `,
})
export class SnippetComponent {
  source = 'const answer: number = 42;';

  onCopy(event: Event) {
    console.log('copied', (event as CustomEvent<{ text: string }>).detail.text);
  }
}
```

`[content]` is a property binding. Use `[attr.label]="fileName"` to bind an attribute.

Load the Vitrine script in `src/index.html`, or import the ES module and call `defineAll()` in `main.ts` before bootstrapping the application.

## Server-rendered pages (PHP, Django, WordPress…)

Server-side templates often have the data to display at render time. Never print untrusted data inside the Vitrine element: the browser parses it as page HTML before Vitrine runs. Instead, serialize the data into a JSON data block, and set the `content` property from a script.

The data block must be escaped so that the data cannot close the `<script>` element. In JSON, `<`, `>` and `&` can be written as `<`, `>` and `&`.

### PHP

```php
<vt-code id="snippet" language="php" variant="full"></vt-code>

<script type="application/json" id="snippet-data">
<?= json_encode($code, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>
</script>
```

```js
// /js/snippet.js (an external file works under a strict CSP)
const data = document.getElementById('snippet-data').textContent;
document.getElementById('snippet').content = JSON.parse(data);
```

### Django

The built-in `json_script` filter writes a correctly escaped `<script type="application/json">` element:

```django
<vt-markdown id="readme" variant="full"></vt-markdown>
{{ readme_text|json_script:"readme-data" }}
```

```js
const text = JSON.parse(document.getElementById('readme-data').textContent);
document.getElementById('readme').content = text;
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
vt-json:not(:defined) {
  display: block;
  min-height: 3rem;
  visibility: hidden;
}
```
