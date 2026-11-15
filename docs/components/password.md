# `<vt-password>`

`<vt-password>` is a password field for sign-up, sign-in and "change password" forms. To choose a password, it rates it while you type the way an attacker would guess it, says why it is weak, shows the requirements met, generates strong passwords, asks for a confirmation and, if asked, checks it against known data breaches. To sign in, it is a plain password field with a reveal button and a Caps Lock warning.

```html
<form>
  <vt-password name="password" confirm require="upper,digit"></vt-password>
</form>
```

## Strength

The meter has five levels, from "Very weak" (0) to "Very strong" (4). The estimate looks for the cheapest way to guess the password, as cracking tools do, and adds up the guesses of each part:

| Part found               | Examples                             |
| ------------------------ | ------------------------------------ |
| Common password or word  | `password`, `azerty`, `soleil`       |
| Word with substitutions  | `P@ssw0rd`, `m0nk3y`                 |
| Word written backwards   | `drowssap`                           |
| Keyboard run             | `qwerty`, `zxcvbnm`, `1qaz2wsx`      |
| Sequence                 | `abcdef`, `97531`                    |
| Repeat                   | `aaaa`, `abcabc`                     |
| Date or year             | `1990`, `01/05/1990`, `120590`       |
| The user's name or email | from `user-inputs` and `user-fields` |
| Anything else            | guessed character by character       |

Under the meter: the time an attacker with stolen hashes of a slow function (bcrypt, scrypt, Argon2: 10,000 guesses a second) would need, the main weakness ("Keys side by side, like qwerty, are easy to guess.") and advice. The `full` variant (or `details`) adds the times of four attacks and how the password would be guessed, part by part.

The list of common words is built in and small (about 700 passwords, words and names, English and French): an uncommon dictionary word counts as random characters. Use `breach-check` to catch passwords leaked anywhere.

`user-inputs="Alice Martin alice@example.com"` or `user-fields="email,username"` (names of other fields of the same form, read when checked) make passwords that contain them weak, and add the "Not your name or email" requirement.

## Requirements

In `new` mode, the field is valid when:

- it has at least `minlength` characters (default 8) and at most `maxlength` (default 128);
- it has each class of `require` (`lower`, `upper`, `digit`, `symbol`), and at least `min-classes` of the four;
- it does not contain the user's name or email;
- its strength is at least `min-score` (default 2, "fair"; `0` accepts any);
- it was not found in breaches, when `breach-check` is set;
- the confirmation is the same, with `confirm`.

Requirements are listed under the field and checked off as you type. `require` and `min-classes` are off by default, as NIST SP 800-63B advises: length and a strength check work better than composition rules.

## Generator

The generate button fills in a random password of `generate-length` characters (default 20) with every class and no characters easy to confuse (`l`, `1`, `O`, `0`…), drawn from `crypto.getRandomValues` without bias. It is shown, with a copy button, so it can be saved in a password manager, and fills in the confirmation.

## Data breaches

`breach-check` asks the [Pwned Passwords](https://haveibeenpwned.com/Passwords) API of Have I Been Pwned whether the password appeared in a breach, 0.7 seconds after the last key. The password never leaves the page: only the first five characters of its SHA-1 are sent (k-anonymity), the answer is padded so its size tells nothing, and no cookie or referrer goes with the request. A password found makes the field invalid. Give `breach-check` an `https:` URL ending in `/range/` to ask your own copy of the API. The page's Content Security Policy must allow it in `connect-src`.

## Privacy

The password is never written to an attribute, and the state given to the browser to restore a form is empty. Events carry the score, never the password. `autocomplete` is `new-password` or `current-password`, so password managers offer the right thing, and the `passwordrules` hint tells Safari what to generate.

## Forms

The field takes part in `<form>` like a native one: its `name` is submitted with the password, an invalid password blocks the form and shows why, and reset and `disabled` work.

## Attributes

| Attribute         | Type    | Default        | Description                                                       |
| ----------------- | ------- | -------------- | ----------------------------------------------------------------- |
| `mode`            | string  | `new`          | `new` to choose a password, `current` to sign in                  |
| `name`            | string  | —              | Name of the value in a form                                       |
| `label`           | string  | "New password" | Label of the field                                                |
| `hint`            | string  | —              | Help under the field                                              |
| `placeholder`     | string  | —              | Placeholder of the input                                          |
| `required`        | boolean | off            | A password must be given                                          |
| `disabled`        | boolean | off            | The field cannot be used                                          |
| `minlength`       | number  | 8 (`new`)      | Fewest characters                                                 |
| `maxlength`       | number  | 128            | Most characters                                                   |
| `require`         | string  | —              | Classes needed: `lower`, `upper`, `digit`, `symbol`               |
| `min-classes`     | number  | —              | At least this many of the four classes                            |
| `min-score`       | number  | 2 (`new`)      | Lowest strength accepted, 0 to 4                                  |
| `user-inputs`     | string  | —              | The user's name, email or site name                               |
| `user-fields`     | string  | —              | Names of other fields of the form to read as user inputs          |
| `confirm`         | boolean | off            | A second field to type the password again                         |
| `generate`        | boolean | on (`new`)     | The generate button                                               |
| `generate-length` | number  | 20             | Length of generated passwords                                     |
| `breach-check`    | string  | off            | Checks known breaches; a value is another range URL               |
| `strength`        | boolean | on (`new`)     | The meter and advice                                              |
| `rules`           | boolean | when there are | The list of requirements                                          |
| `details`         | boolean | `full` variant | Attack times and how it would be guessed                          |
| `validate`        | string  | `blur`         | Errors after leaving the field (`blur`) or while typing (`input`) |

## Properties and methods

`value` is the password. `strength` is the estimate: `{ score, bits, guesses, length, classes, sequence, seconds, warning, suggestions }`. `breaches` is the number of breaches once checked. `form`, `validity`, `validationMessage`, `checkValidity()`, `reportValidity()` and `focus()` work as on native fields.

## Events

| Event         | When                        | Detail                     |
| ------------- | --------------------------- | -------------------------- |
| `vt-input`    | The password changed        | `{ score, valid, length }` |
| `vt-change`   | The password was committed  | `{ score, valid }`         |
| `vt-generate` | A password was generated    | `{ length }`               |
| `vt-breach`   | Breaches were checked       | `{ count }`                |
| `vt-copy`     | A generated password copied | `{}`                       |

## CSS parts

`label`, `control`, `meter`, `feedback`, `rules`, `confirm`, `details` and `error`.
