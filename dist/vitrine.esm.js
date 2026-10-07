/*! Vitrine v0.0.0 | MIT License | https://github.com/ecrou-exact/vitrine */

// src/index.js
var version = (
  // @ts-ignore -- replaced by esbuild `define`
  true ? "0.0.0" : "0.0.0-dev"
);
var registry = /* @__PURE__ */ new Map();
function defineAll() {
  const defined = [];
  for (const [tag, ctor] of registry) {
    if (!customElements.get(tag)) {
      customElements.define(tag, ctor);
      defined.push(tag);
    }
  }
  return defined;
}
export {
  defineAll,
  registry,
  version
};
//# sourceMappingURL=vitrine.esm.js.map
