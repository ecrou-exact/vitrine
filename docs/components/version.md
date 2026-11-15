# `<vt-version>`

`<vt-version>` is a field for version numbers: a release form, a package settings page, a changelog editor, a "minimum version" setting. It writes Semantic Versioning, dotted numbers of any length, calendar versions and decimal numbers, lets only their characters be typed, steps them with − and + or the arrow keys, and says what kind of release a version is.

```html
<form>
  <vt-version name="version" label="Release" current="1.4.2" newer variant="full"></vt-version>
</form>
```

## Formats

| `format`                  | Versions                        | Used by                      |
| ------------------------- | ------------------------------- | ---------------------------- |
| `semver` (default)        | `1.4.2`, `2.0.0-rc.1+build.5`   | npm, Cargo, most libraries   |
| `x.y`, `x.y.z`, `x.y.z.w` | `1.4`, `1.4.2`, `10.0.19045.1`  | apps, documentation, Windows |
| `calver`                  | `2026.11.0` (`YYYY.0M.MICRO`)   | pip, Black                   |
| tokens                    | `YY.0M` → `26.04`, `YYYY.MM.DD` | Ubuntu, your own scheme      |
| `decimal`                 | `1.0`, `1.1`… with `step`       | API versions, schema levels  |

Tokens: `#` (any number), `MAJOR`, `MINOR`, `PATCH`, `MICRO`, `YYYY`, `YY`, `0Y`, `MM`, `0M`, `WW`, `0W`, `DD`, `0D` (a leading `0` means two digits), between separators such as `.`, `-` or `_`. Numbers cannot start with 0 except in two-digit tokens, as Semantic Versioning requires. A leading `v` (`v1.4.2`) is accepted and dropped. A decimal accepts a comma (`1,5`).

`segment-max="*,9,9"` gives parts a largest value: past it, a part goes back to its smallest value and carries into the part before, like an odometer. With `format="x.y" segment-max="*,9"`, + goes 1.8, 1.9, 2.0 and − goes back to 1.9.

## Simple: a text field

The `simple` variant is a text field between − and + buttons. Only the characters of the format can be typed or pasted (letters of a semantic version only in its pre-release and build). Arrow Up and Arrow Down step the part under the caret, Page Up and Page Down by ten, Shift by ten too; − and + step the patch of a semantic version, else the last part. Going up resets the parts after it (1.4.7 → 1.5.0); going down keeps them. Leaving the field writes the version in its usual form (`v1.4.2` → `1.4.2`); with `strict`, an invalid version is replaced by the last valid one.

## Full: one spin button per part

The `full` variant edits each part on its own, as a spin button that can only hold a digit within its range, as date fields do: arrows step it with carry, Home and End go to its ends, Left and Right (or typing the separator) move between parts, and a two-digit part moves on once full. A semantic version gets a pre-release list (`alpha`, `beta`, `rc`, or `preids`) and number.

Under the parts: the version written out with a copy button, the kind of release, and the next versions as buttons:

| Format   | Next versions                                                 |
| -------- | ------------------------------------------------------------- |
| semver   | Release, Patch, Minor, Major, Pre-release (as `npm version`)  |
| calendar | Today (the date, and the counter up when it is the same date) |
| dotted   | Each part + 1                                                 |
| decimal  | −10 steps, −1, +1, +10                                        |

## Kind of release

With `current` (the version released now), the field says what the value is: "Minor release from 1.4.2 · new features, compatible", "Patch release", "Major release · breaking changes", "Pre-release" or "Lower version". With `newer`, the value must be higher than `current`. Versions are compared by Semantic Versioning precedence: `1.0.0-alpha` < `1.0.0-alpha.1` < `1.0.0-beta.2` < `1.0.0-beta.11` < `1.0.0-rc.1` < `1.0.0`; build metadata does not count.

## Forms

The field takes part in `<form>`: its `name` is submitted with the version, `required`, `min`, `max`, `newer` and invalid versions block the form with a message ("Write a version like 1.4.2.", "Minor cannot start with 0.", "Use 2.0.0 or lower."), and reset, `disabled` and `readonly` work.

## Attributes

| Attribute     | Type    | Default         | Description                                                |
| ------------- | ------- | --------------- | ---------------------------------------------------------- |
| `value`       | string  | —               | The first version                                          |
| `name`        | string  | —               | Name of the value in a form                                |
| `label`       | string  | "Version"       | Label of the field                                         |
| `hint`        | string  | —               | Help under the field                                       |
| `format`      | string  | `semver`        | A format name or tokens                                    |
| `segment-max` | string  | —               | Largest value of each part (`*` for none), with carry      |
| `step`        | string  | 0.1             | Step of a decimal; its decimals set the precision          |
| `precision`   | number  | 1               | Decimals of a decimal without `step`                       |
| `min`         | string  | —               | Lowest version accepted                                    |
| `max`         | string  | —               | Highest version accepted                                   |
| `current`     | string  | —               | The version released now                                   |
| `newer`       | boolean | off             | The value must be higher than `current`                    |
| `prefix`      | string  | —               | Text before the version, such as `v`; not submitted        |
| `strict`      | boolean | off             | Puts back the last valid version on leaving an invalid one |
| `preids`      | string  | `alpha,beta,rc` | Pre-release names offered                                  |
| `required`    | boolean | off             | A version must be given                                    |
| `disabled`    | boolean | off             | The field cannot be used                                   |
| `readonly`    | boolean | off             | The value cannot be changed but is submitted               |
| `placeholder` | string  | an example      | Placeholder of the text field                              |
| `now`         | string  | today           | The date used by Today, for tests and screenshots          |

## Properties

`value` is the version. `version` is the version read, `{ parts, pre, build }`, or `null` when invalid. `form`, `validity`, `validationMessage`, `checkValidity()`, `reportValidity()` and `focus()` work as on native fields.

## Events

| Event       | When                      | Detail                        |
| ----------- | ------------------------- | ----------------------------- |
| `vt-input`  | The version changed       | `{ value, valid }`            |
| `vt-change` | The version was committed | `{ value, previous, change }` |
| `vt-copy`   | The version was copied    | `{ text }`                    |

`change` is `major`, `minor`, `patch`, `prerelease`, `build`, `segment`, `date`, `up`, `same` or `downgrade`.

## CSS parts

`label`, `control`, `editor`, `segment`, `step-button`, `bumps`, `change` and `error`.
