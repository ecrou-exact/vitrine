# Vitrine

When asked to build new components, or for ideas of components, read `IDEAS.md` first: it is the backlog of planned components. Remove an entry once it is built.

## Adding a component

- Run `git pull` first: the site and docs change often.
- Lists are alphabetical by tag: README features and table, `docs/README.md` table, the docs navigation in `site/docs.html`. In `site/examples.html`, examples are grouped by need (`example-category`); add the `<option>` and the `example-group` section in the right category, alphabetically by option label, in the same order. The sidebar is generated from the options.
- Follow the last "Add vt-…" commit for the full list of places to register an element (entries, `vitrine.js`, `i18n.js`, `light-dom.css`, `build.js`, `size.js`, guides, site, playground, XSS and a11y specs).
