# `<vt-consent>`

`<vt-consent>` is a cookie consent banner for sites that measure their audience, show ads or embed videos and maps. It follows what data protection authorities (CNIL, EDPB) ask for: nothing but necessary cookies before a choice, refusing as easy as accepting, categories chosen one by one, the choice asked again after a while, and a way back to change it at any time.

```html
<vt-consent position="inline" policy="/privacy" categories="analytics,marketing"></vt-consent>
```

On a page, leave out `position`: the same settings come as a banner at the bottom of the window, `<vt-consent policy="/privacy" version="2026-11" consent-mode></vt-consent>`, placed once in a layout shared by every page.

## The banner

The banner sits at the bottom of the window (`position="top"` at the top). It has a title, a short text with the link to `policy`, and three buttons: Customize, Reject all and Accept all. Reject all and Accept all look the same and sit side by side. The banner does not block the page or take the focus.

Customize opens a dialog with each category, a switch per category, and Reject all, Save my choices and Accept all. Necessary cookies are always on. After a choice, a small round button stays in a corner to change it (`reopen="false"` removes it). Any element with `data-consent-open` opens the dialog too: a "Cookie settings" link in the footer.

`position="inline"` shows the settings in the page instead, for the privacy policy page.

## Categories

The built-in categories are `necessary`, `preferences`, `analytics` and `marketing`, with their texts in English and French. `categories="analytics"` offers only some. JSON content gives your own, with the cookies each one sets:

```html
<vt-consent policy="/privacy" version="3">
  <script type="application/json">
    {
      "categories": [
        { "id": "analytics", "cookies": [{ "name": "_pk_id", "provider": "Matomo", "purpose": "Visitor id", "duration": "13 months" }] },
        { "id": "video", "label": "Videos", "description": "YouTube videos in the articles.", "consentMode": [] },
        "marketing"
      ]
    }
  </script>
</vt-consent>
```

## Scripts and frames held back

Mark what needs consent with `data-consent`, and it waits until its category is accepted:

```html
<script type="text/plain" data-consent="analytics" src="https://stats.example.com/script.js" async></script>
<iframe data-consent="video" data-src="https://www.youtube-nocookie.com/embed/xyz" title="Demo"></iframe>
<img data-consent="marketing" data-src="https://ads.example.com/pixel.png" alt="">
```

A script is run once accepted (`data-type="module"` gives its type); a frame, an image or a video gets its `data-src` as `src`. `data-consent="analytics marketing"` needs both. Each element is turned on once. Choices that take back consent cannot unload what already ran: reload the page.

Under Trusted Types (`require-trusted-types-for 'script'`), a script cannot be made from a string without a policy, and Vitrine does not lend its own: such scripts are marked `data-consent-refused` and left alone. Load them from the `vt-consent` event with your own policy. Frames and images work everywhere.

## Google Consent Mode v2

With `consent-mode`, each choice sends `gtag('consent', 'update', …)`: `analytics` grants `analytics_storage`, `marketing` grants `ad_storage`, `ad_user_data` and `ad_personalization`, `preferences` grants `functionality_storage` and `personalization_storage`. Set the defaults to denied yourself before Google's tag loads:

```html
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
</script>
```

A category of your own lists the types it grants in `consentMode`.

## The choice

The choice is kept in `localStorage` (`storage-key`, default `vitrine-consent`) with a random id, its date, its source and the `version` of your settings. It is asked again after `expires` days (default 180) or when `version` changes. A category added since is off until asked. With `cookie="consent"`, a cookie holds the accepted categories too (`necessary.analytics`), for the server. With `log-url`, each choice is sent to your server with `sendBeacon`, as a record of consent. Other `<vt-consent>` elements of the page and other tabs follow a new choice.

With Global Privacy Control (`navigator.globalPrivacyControl`) and no choice yet, everything optional is refused without asking, and the settings say why (`gpc="false"` asks anyway).

## Attributes

| Attribute      | Type    | Default           | Description                                                          |
| -------------- | ------- | ----------------- | -------------------------------------------------------------------- |
| `categories`   | string  | all               | Built-in categories offered: `preferences`, `analytics`, `marketing` |
| `policy`       | string  | —                 | Address of the privacy policy                                        |
| `version`      | string  | `1`               | Version of the settings: a new one asks again                        |
| `expires`      | number  | 180               | Days after which the choice is asked again                           |
| `position`     | string  | `bottom`          | `bottom`, `top` or `inline`                                          |
| `storage-key`  | string  | `vitrine-consent` | Key of `localStorage`                                                |
| `cookie`       | string  | —                 | Name of a cookie that holds the choice too                           |
| `consent-mode` | boolean | off               | Sends Google Consent Mode v2 updates                                 |
| `gpc`          | boolean | on                | Follows Global Privacy Control                                       |
| `log-url`      | string  | —                 | Address each choice is sent to                                       |
| `reopen`       | boolean | on                | The button to change the choice                                      |

## Properties and methods

`consent` is the choice, `{ necessary: true, analytics: false, … }` (`{}` before a choice); `choice` adds its `id`, `date`, `version` and `source`. `has('analytics')` says whether a category is accepted. `show()` opens the settings, `accept()` accepts all (or `accept(['analytics'])` some), `reject()` refuses all, `reset()` forgets the choice and asks again.

## Events

| Event        | When                                    | Detail                       |
| ------------ | --------------------------------------- | ---------------------------- |
| `vt-consent` | A choice was made, or read back on load | `{ categories, action, id }` |

`action` is `accept`, `reject`, `save`, `gpc` or `restore`.

```js
document.addEventListener('vt-consent', (event) => {
  if (event.detail.categories.analytics) startAnalytics();
});
```

## CSS parts

`banner`, `dialog`, `category`, `button` and `reopen`.
