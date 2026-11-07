# `<vt-upload>`

`<vt-upload>` is a field to add files: a zone where files are dropped, a button to choose them, and the list of files with a thumbnail of images, their size and a button to remove them. Files are checked against `accept`, `max-size` and `max-files`, and each file refused says why.

```html
<form method="post" enctype="multipart/form-data">
  <vt-upload name="photos" label="Photos" accept="image/*" multiple max-files="5"
             max-size="10MB" hint="JPG or PNG, landscape if you can." required></vt-upload>
  <button>Send</button>
</form>
```

It takes part in the form like `<input type="file">`: the files are submitted under `name`, the form is not submitted while the field is invalid, and `reset()` empties it. Without `multiple`, a new file replaces the one there.

## Adding files

Files are added by dropping them on the zone, by the "choose files" button (or a click anywhere in the zone), or by pasting them while the button has the focus. Each file added is read out ("report.pdf added."), and so is each file refused, with its reason:

- "this type of file is not accepted." (`accept`, as on `<input type="file">`: `image/*,.pdf,application/json`);
- "it is larger than 10 MB." (`max-size`, written as `5MB`, `500 KB`, `2 MiB` or `2 Mo`);
- "it is smaller than …" (`min-size`), "it is empty.";
- "only 5 files can be added." (`max-files`);
- "it was refused." (a `vt-file-add` listener called `preventDefault()`, for a check of yours).

The rules are written in the zone: "Image, PDF · up to 10 MB · 5 files at most".

Images (PNG, JPEG, GIF, WebP, AVIF, up to 8 MB) get a thumbnail. It is read as a `data:` URL, which strict Content Security Policies usually allow for images (`img-src 'self' data:`); `previews="false"` turns thumbnails off.

## Uploading as files are added

With `upload-url`, each file is sent as soon as it is added, in a `multipart/form-data` request with the file under `upload-field` (`file` by default), or as the body of a `PUT` with `upload-method="PUT"`. Each file shows its progress, and can be canceled while it is sent or sent again when it failed.

```html
<vt-upload name="attachments" multiple upload-url="/api/uploads"></vt-upload>
```

The server answers with JSON; when it has an `id` (or a `url`, `key` or `path`), the form submits that string instead of the file, so the form only carries references. While a file is being sent, or when one failed, the field is invalid ("Wait until the files are uploaded.").

`vt-upload-start` is sent before each request with the `XMLHttpRequest`, already open, so headers can be added. It can be canceled.

```js
upload.addEventListener('vt-upload-start', (event) => {
  event.detail.request.setRequestHeader('X-CSRF-Token', token);
});
```

`upload-url` must be on the same origin as the page, unless `allow-remote` is set; cookies go to another origin only with `with-credentials`. Only `http` and `https` addresses are used.

## JSON

```js
upload.data = { label: 'Invoices', accept: ['.pdf'], maxSize: '5MB', multiple: true };
```

## Attributes

| Attribute          | Type    | Default | Description                                  |
| ------------------ | ------- | ------- | -------------------------------------------- |
| `name`             | string  | none    | Name of the files in the form                |
| `label`            | string  | none    | Label                                        |
| `hint`             | string  | none    | Help under the field                         |
| `required`         | boolean | off     | A file must be added                         |
| `disabled`         | boolean | off     | Files cannot be added, and are not submitted |
| `accept`           | string  | any     | Types accepted, as on `<input type="file">`  |
| `multiple`         | boolean | off     | Several files                                |
| `max-files`        | number  | 200     | Most files, with `multiple`                  |
| `max-size`         | string  | none    | Largest file                                 |
| `min-size`         | string  | none    | Smallest file                                |
| `upload-url`       | string  | none    | Sends each file there as it is added         |
| `upload-field`     | string  | `file`  | Name of the file in the upload request       |
| `upload-method`    | string  | `POST`  | `POST` or `PUT`                              |
| `with-credentials` | boolean | off     | Sends cookies with uploads to another origin |
| `previews`         | boolean | on      | Thumbnails of images                         |

Shared attributes, such as `allow-remote`, are in [Common attributes](../common-attributes.md).

## Properties and methods

| Member                                                                           | Description                       |
| -------------------------------------------------------------------------------- | --------------------------------- |
| `files`                                                                          | The files added (read-only)       |
| `clear()`                                                                        | Removes every file                |
| `upload()`                                                                       | Sends again the files that failed |
| `form`, `validity`, `checkValidity()`, `reportValidity()`, `setCustomValidity()` | As on native fields               |

## Events

| Event                | When                        | Detail                       |
| -------------------- | --------------------------- | ---------------------------- |
| `vt-file-add`        | A file is about to be added | `{ file }`                   |
| `vt-file-remove`     | A file was removed          | `{ file }`                   |
| `vt-change`          | The files changed           | `{ files }`                  |
| `vt-upload-start`    | A file is about to be sent  | `{ file, request }`          |
| `vt-upload-progress` | Part of a file was sent     | `{ file, loaded, total }`    |
| `vt-upload-done`     | A file was sent             | `{ file, status, response }` |
| `vt-upload-error`    | A file could not be sent    | `{ file, status }`           |

`vt-file-add` and `vt-upload-start` can be canceled.

## CSS parts

`label`, `zone`, `browse`, `list`, `file`, `thumbnail`, `progress`, `hint` and `error`.
