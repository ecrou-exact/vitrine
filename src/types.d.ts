declare module '*.css?raw' {
  const css: string;
  export default css;
}

declare module 'highlight.js/lib/languages/*' {
  import type { LanguageFn } from 'highlight.js';
  const language: LanguageFn;
  export default language;
}
