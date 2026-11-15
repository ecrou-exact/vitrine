# `<vt-secret>`

`<vt-secret>` shows or takes an API key, a token or another secret: in a developer dashboard, a settings page, an onboarding step that shows a new token once. The key stays hidden behind a blur, can be copied without being shown, as is or as a line for a `.env` file or a shell, and the field says which service the key belongs to, whether it is a live key, when it expires and what it may do.

```html
<vt-secret label="Stripe key" variant="full" value="sk_live_51DemoKeyNotReal0000"
           created="2026-09-01" scopes="charges:write,refunds:read" copy-as="env,shell"
           env-name="STRIPE_SECRET_KEY" rotate></vt-secret>
```

On a real page, set the key with the `value` property (`el.value = key`): unlike the `value` attribute, it is not in the page's HTML.

## Masked, not in the page

While hidden, the field shows the prefix that names the kind of key (`sk_live_`, `ghp_`…) and the last four characters of long keys, and blurs the rest. What is blurred are fixed stand-in characters, never the key: the key is not in the page until it is shown, so it cannot be read from the DOM, selected or found by the page search. Screen readers hear "Hidden key, 32 characters, starts with sk_live_, ends with p7dc". `mask="dots"` draws dots instead of a blur; `show-start` and `show-end` change what is shown, and at least half always stays hidden.

`auto-hide="30"` hides the key again 30 seconds after it is shown, with a countdown. `show-once` is for new tokens: the key can be shown and copied until it is hidden, then it is forgotten, as GitHub and others do.

## Copy

The copy button copies the key without showing it. `copy-as` adds a menu of formats (the `full` variant offers them all):

| Format       | Copied                            |
| ------------ | --------------------------------- |
| `raw`        | The key                           |
| `env`        | `STRIPE_SECRET_KEY=sk_live_…`     |
| `shell`      | `export STRIPE_SECRET_KEY='sk_…'` |
| `powershell` | `$env:STRIPE_SECRET_KEY = 'sk_…'` |
| `header`     | `Authorization: Bearer sk_…`      |
| `json`       | `{"STRIPE_SECRET_KEY":"sk_…"}`    |

Values are quoted for each format. The name of the variable is `env-name`, else the label. `clear-clipboard="60"` empties the clipboard a minute after a copy, when the page still has the focus; anything copied in between is emptied too.

## Kinds of keys

Keys are recognized from the prefix and shape their services document: Anthropic, OpenAI, GitHub (classic and fine-grained tokens, OAuth, app and refresh tokens), GitLab, AWS (access keys and temporary keys), Stripe (secret, restricted and publishable, live and test, webhook secrets), Slack (tokens and webhook URLs), Google Cloud, Hugging Face, npm, PyPI, Docker Hub, SendGrid, Twilio, Shopify, DigitalOcean, HashiCorp Vault, Mailgun, Linear, Supabase, Telegram bots, JSON Web Tokens, PEM private keys and UUIDs.

Badges show the service and kind, Live or Test, and Publishable or Temporary. The field warns that a live key belongs on a server, that a publishable key is safe in browser code, and that a private key must never be shared. Recognition only reads the shape of a key: it never checks it with the service.

## Dates, scopes, randomness

`created`, `expires` and `last-used` (a date, or `never`) are shown with relative times; a JSON Web Token gives its own `iat` and `exp`. An expired key, or one that expires within `warn-days` (default 7), is flagged. `scopes` lists permissions. The `full` variant adds the length and the randomness of the key: its random part times the bits of its alphabet.

## Regenerate

`rotate` adds a Regenerate button. The first press asks to confirm ("the old key stops working"); the second fires `vt-rotate`. Cancel the event (`preventDefault()`) to rotate the key on your server and set `value` yourself; otherwise the field makes a random key like the old one (same prefix, length and alphabet, or `generate-prefix`, `generate-length` and `generate-alphabet`) and shows it, ready to copy.

## Typed keys

`editable` turns the field into a form field to paste a key: a masked input that password managers leave alone, with a reveal button. Spaces and line breaks pasted with a key are removed. `expect="github,stripe"` accepts only those kinds (ids such as `github-fine` or providers), `pattern` a regular expression; `generate` adds a button that fills in a random key. Its `name` is submitted; the state given to the browser to restore a form is empty.

## Attributes

| Attribute           | Type    | Default        | Description                                          |
| ------------------- | ------- | -------------- | ---------------------------------------------------- |
| `value`             | string  | —              | The key (prefer the `value` property)                |
| `name`              | string  | —              | Name of the value in a form                          |
| `label`             | string  | "API key"      | Label of the field                                   |
| `hint`              | string  | —              | Help under the field                                 |
| `editable`          | boolean | off            | The key is typed or pasted                           |
| `required`          | boolean | off            | With `editable`, a key must be given                 |
| `disabled`          | boolean | off            | The field cannot be used                             |
| `placeholder`       | string  | —              | Placeholder of the input                             |
| `mask`              | string  | `blur`         | `blur` or `dots`                                     |
| `show-start`        | number  | the prefix     | Characters shown at the start while hidden           |
| `show-end`          | number  | 4              | Characters shown at the end while hidden             |
| `auto-hide`         | number  | —              | Seconds after which the key is hidden again          |
| `show-once`         | boolean | off            | The key is forgotten once hidden                     |
| `copy-as`           | string  | `full`: all    | Copy formats offered                                 |
| `env-name`          | string  | the label      | Name of the variable in copied formats               |
| `clear-clipboard`   | number  | —              | Seconds after which the clipboard is emptied         |
| `expect`            | string  | —              | Kinds of keys accepted                               |
| `pattern`           | string  | —              | Regular expression an `editable` key must match      |
| `detect`            | boolean | on             | Badges of the kind of key                            |
| `created`           | string  | —              | When the key was created                             |
| `expires`           | string  | —              | When it expires                                      |
| `last-used`         | string  | —              | When it was last used, or `never`                    |
| `warn-days`         | number  | 7              | Days before expiry from which it warns               |
| `scopes`            | string  | —              | Permissions, separated by commas                     |
| `rotate`            | boolean | off            | The Regenerate button                                |
| `generate`          | boolean | off            | With `editable`, a button that fills in a random key |
| `generate-prefix`   | string  | as the key     | Prefix of generated keys                             |
| `generate-length`   | number  | as the key, 40 | Random characters of generated keys                  |
| `generate-alphabet` | string  | as the key     | `base62`, `hex`, `base64url` or `base32`             |

## Properties

`value` is the key. `visible` is whether it is shown (settable). `kind` is the kind recognized: `{ id, provider, label, prefix, env, kind }`, or `null`.

## Events

Events never carry the key.

| Event         | When                                  | Detail            |
| ------------- | ------------------------------------- | ----------------- |
| `vt-toggle`   | The key was shown or hidden           | `{ visible }`     |
| `vt-copy`     | The key was copied                    | `{ format }`      |
| `vt-rotate`   | Regenerate was confirmed (cancelable) | `{ provider }`    |
| `vt-generate` | A key was generated                   | `{ length }`      |
| `vt-input`    | An `editable` key changed             | `{ kind, valid }` |
| `vt-change`   | An `editable` key was committed       | `{ kind, valid }` |

## CSS parts

`label`, `value`, `control`, `badge`, `menu`, `meta` and `notice`.
