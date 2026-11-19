declare module '*.css?raw' {
  const css: string;
  export default css;
}

declare module 'highlight.js/lib/languages/*' {
  import type { LanguageFn } from 'highlight.js';
  const language: LanguageFn;
  export default language;
}

/** TopoJSON decoding for the world shapes of <vt-map> (src/vendor/geo.js). */
declare module 'topojson-client';
