// @ts-check
/**
 * Password strength, estimated as an attacker would guess: common passwords and words
 * first (with capitals, leet substitutions and reversals), then keyboard runs, sequences,
 * repeats, dates and the user's own name or email, and only what is left by brute force.
 * The guesses of the cheapest way to cover the password give its score, from 0 to 4.
 *
 * Inspired by zxcvbn (Dropbox), written again and much smaller.
 *
 * @module components/password/strength
 */
import { ALPHABETS, AMBIGUOUS, randomBelow, randomString, shuffle } from '../../core/random.js';

/**
 * The most common passwords and words in them, most common first. Lists of leaked passwords
 * (SecLists, NCSC) and French ones.
 */
const COMMON_TEXT = `123456 password 123456789 12345678 12345 qwerty 1234567 111111 1234567890 123123
000000 abc123 1234 password1 iloveyou 1q2w3e4r qwerty123 dragon monkey 654321 123321 666666 qwertyuiop
1qaz2wsx azerty 123qwe letmein football baseball welcome sunshine princess master admin shadow login
passw0rd p@ssw0rd superman michael 121212 trustno1 starwars 7777777 112233 qazwsx zxcvbnm asdfgh
asdfghjkl mustang access hello charlie donald freedom whatever jordan jennifer hunter buster soccer
harley batman andrew tigger thomas hockey ranger daniel computer michelle jessica pepper zxcvbn
555555 11111111 131313 777777 maggie 159753 aaaaaa ginger joshua cheese amanda summer love ashley
nicole chelsea biteme matthew yankees 987654321 dallas austin thunder taylor matrix secret
administrator root toor changeme default guest test test123 password123 pass motdepasse soleil
bonjour doudou chouchou marseille loulou nicolas camille julien coucou chocolat jetaime doudou
amour bisous loveme flower lovely angel killer cookie internet samsung google apple orange banana
winter spring autumn hello123 welcome1 qwerty1 admin123 root123 abcd1234 a1b2c3 aa123456
superstar silver golden diamond dolphin eagle tiger lion bear wolf fucker fuckyou money
mother father family friend school secret123 pokemon naruto minecraft fortnite roblox
liverpool arsenal chelsea barcelona juventus madrid paris london newyork america canada
france london123 player gamer hacker ninja knight wizard magic purple yellow black white
red blue green pink jasmine lauren hannah sophie emma olivia william james robert david
richard joseph charles anthony mark steven paul kevin brian george edward ronald timothy
jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin scott brandon
benjamin samuel frank alexander patrick raymond jack dennis jerry tyler aaron jose adam
henry nathan douglas zachary peter kyle walter ethan jeremy harold keith christian roger
noah gerald carl terry sean austin arthur lawrence jesse dylan bryan joe jordan billy
bruce albert willie gabriel logan alan juan wayne roy ralph randy eugene vincent russell
louis bobby philip johnny mary patricia linda barbara elizabeth susan sarah karen nancy
lisa betty margaret sandra emily donna carol ruth sharon laura cynthia kathleen amy
shirley angela helen anna brenda pamela emma nicole samantha katherine christine debra
rachel catherine carolyn janet maria heather diane julie joyce victoria kelly christina
joan evelyn judith megan cheryl andrea hannah martha jacqueline frances gloria ann teresa
kathryn sara janice jean alice madison doris abigail julia judy grace denise amber marilyn
beverly danielle theresa sophia marie diana brittany natalie isabella charlotte rose
alexis kayla qwer asdf zxcv wasd word pass1 love123 iloveu abc qwe zaq12wsx xsw2zaq1
monday friday sunday january march april june july august october november december
computer1 internet1 windows linux ubuntu server database oracle mysql postgres system
office manager company business service support user user1 demo sample example
dog cat sun car god boy girl baby kitty puppy world mydog mycat ilove loveyou
`;

/** @type {Map<string, number>} Word → rank (1 is the most common). */
const RANKS = new Map();
for (const word of COMMON_TEXT.split(/\s+/)) if (word && !RANKS.has(word)) RANKS.set(word, RANKS.size + 1); // prettier-ignore

/** Keyboard rows and columns, QWERTY and AZERTY, where runs are easy to type. */
const KEYBOARD = [
  '`1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./', 'azertyuiop', 'qsdfghjklm', 'wxcvbn',
  '1qaz', '2wsx', '3edc', '4rfv', '5tgb', '6yhn', '7ujm', '8ik,', '9ol.', '0p;/', 'qaz', 'wsx', 'edc',
  'rfv', 'tgb', 'yhn', 'ujm', '1a2z3e4r', '1q2w3e4r5t', 'q1w2e3r4', 'zaq1', 'xsw2', 'cde3', 'vfr4',
  '789456123', '147258369', '741852963', '159357',
]; // prettier-ignore

/** Leet substitutions back to letters. `1` and `|` may be `i` or `l`. */
const LEET = /** @type {Record<string, string[]>} */ ({
  4: ['a'], '@': ['a'], 8: ['b'], '(': ['c'], '{': ['c'], 3: ['e'], 6: ['g'], 9: ['g'], 1: ['i', 'l'],
  '!': ['i'], '|': ['i', 'l'], 0: ['o'], $: ['s'], 5: ['s'], 7: ['t'], '+': ['t'], 2: ['z'], '%': ['x'],
}); // prettier-ignore

const YEAR = /(?:19|20)\d\d/g;
const DATE = /(\d{1,4})([-/._ ]?)(\d{1,2})\2(\d{1,4})/g;

/** Guessing speeds, in guesses per second, of four attacks. */
export const ATTACKS = Object.freeze({
  /** A login form that limits attempts: 100 an hour. */
  onlineThrottled: 100 / 3600,
  /** A login form without limits. */
  online: 10,
  /** Stolen hashes of a slow function (bcrypt, scrypt, Argon2). */
  offlineSlow: 1e4,
  /** Stolen hashes of a fast function (MD5, SHA-1) on many GPUs. */
  offlineFast: 1e10,
});

/** Score thresholds, in bits (log2 of guesses): below 20 is 0, below 30 is 1… */
const SCORE_BITS = [20, 30, 40, 55];

/**
 * @typedef {'common' | 'dictionary' | 'user' | 'keyboard' | 'sequence' | 'repeat' | 'year' | 'date' | 'brute'} MatchKind
 */

/**
 * @typedef {object} Match
 * @property {MatchKind} kind
 * @property {number} start - First character.
 * @property {number} end - After the last character.
 * @property {string} token - The characters.
 * @property {number} bits - log2 of the guesses for this part.
 * @property {boolean} [leet] - Letters written as digits or symbols.
 * @property {boolean} [reversed]
 * @property {'none' | 'first' | 'all' | 'mixed'} [caps]
 */

/**
 * @typedef {object} Strength
 * @property {0 | 1 | 2 | 3 | 4} score - 0 very weak, 1 weak, 2 fair, 3 strong, 4 very strong.
 * @property {number} bits - log2 of the guesses needed.
 * @property {number} guesses
 * @property {number} length - In characters (code points).
 * @property {{ lower: boolean, upper: boolean, digit: boolean, symbol: boolean, other: boolean }} classes
 * @property {Match[]} sequence - How the password is covered, in order.
 * @property {Record<keyof typeof ATTACKS, number>} seconds - Average time to find it, per attack.
 * @property {string | null} warning - Key of the main weakness.
 * @property {string[]} suggestions - Keys of advice.
 */

/** @param {number} n */
const log2 = (n) => Math.log2(Math.max(1, n));

/**
 * @param {number} n
 * @param {number} k
 * @returns {number} log2 of n choose k.
 */
function log2Choose(n, k) {
  let bits = 0;
  for (let i = 1; i <= Math.min(k, n - k); i += 1) bits += log2(n - k + i) - log2(i);
  return bits;
}

/**
 * @param {string} char
 * @returns {'lower' | 'upper' | 'digit' | 'symbol' | 'other'}
 */
export function charClass(char) {
  if (/[a-z]/.test(char)) return 'lower';
  if (/[A-Z]/.test(char)) return 'upper';
  if (/[0-9]/.test(char)) return 'digit';
  if (/[\x20-\x7e]/.test(char)) return 'symbol';
  return 'other';
}

/**
 * @param {string[]} chars
 * @returns {Strength['classes']}
 */
function classesOf(chars) {
  const classes = { lower: false, upper: false, digit: false, symbol: false, other: false };
  for (const char of chars) classes[charClass(char)] = true;
  return classes;
}

/**
 * @param {Strength['classes']} classes
 * @returns {number} Characters an attacker must try for each unknown one.
 */
function poolSize(classes) {
  const size =
    (classes.lower ? 26 : 0) +
    (classes.upper ? 26 : 0) +
    (classes.digit ? 10 : 0) +
    (classes.symbol ? 33 : 0) +
    (classes.other ? 100 : 0);
  return Math.max(10, size);
}

/**
 * @param {string} token
 * @returns {{ caps: Match['caps'], bits: number }} Extra guesses for the capitals of a word.
 */
function capsOf(token) {
  const letters = token.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  if (!upper) return { caps: 'none', bits: 0 };
  if (upper === letters.length) return { caps: 'all', bits: 1 };
  if (upper === 1 && /^[^a-z]*[A-Z]/.test(token)) return { caps: 'first', bits: 1 };
  if (upper === 1 && /[A-Z][^A-Za-z]*$/.test(token)) return { caps: 'first', bits: 1 };
  return { caps: 'mixed', bits: log2Choose(letters.length, Math.min(upper, letters.length - upper)) }; // prettier-ignore
}

/**
 * Every way to read leet characters back as letters (at most a few).
 *
 * @param {string} lower
 * @returns {string[]}
 */
function unleet(lower) {
  let variants = [''];
  for (const char of lower) {
    const options = LEET[char] ?? [char];
    variants = variants.flatMap((v) => options.map((o) => v + o)).slice(0, 8);
  }
  return variants.filter((v) => v !== lower);
}

/**
 * @param {string} text
 * @returns {string[]} Words of a name or an email, for `user` matches.
 */
export function userWords(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
    .slice(0, 50);
}

/**
 * @param {string[]} chars
 * @param {string[]} user
 * @returns {Match[]}
 */
function dictionaryMatches(chars, user) {
  /** @type {Match[]} */
  const out = [];
  const userRanks = new Map(user.map((w, i) => [w, i + 1]));
  const n = chars.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 3; j <= Math.min(n, i + 24); j += 1) {
      const token = chars.slice(i, j).join('');
      const lower = token.toLowerCase();
      const caps = capsOf(token);
      const whole = i === 0 && j === n;
      /**
       * @param {string} word
       * @param {{ leet?: boolean, reversed?: boolean }} how
       */
      const check = (word, how) => {
        const userRank = userRanks.get(word);
        const rank = RANKS.get(word);
        if (!userRank && !rank) return;
        const extra = caps.bits + (how.leet ? 1 + countDiff(word, lower) : 0) + (how.reversed ? 1 : 0); // prettier-ignore
        if (userRank) out.push({ kind: 'user', start: i, end: j, token, bits: log2(userRank) + extra, caps: caps.caps, ...how }); // prettier-ignore
        if (rank) out.push({ kind: whole && !how.leet && !how.reversed ? 'common' : 'dictionary', start: i, end: j, token, bits: log2(rank) + extra, caps: caps.caps, ...how }); // prettier-ignore
      };
      check(lower, {});
      for (const variant of unleet(lower)) check(variant, { leet: true });
      if (j - i >= 4) check([...lower].reverse().join(''), { reversed: true });
    }
  }
  return out;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} Characters that differ.
 */
function countDiff(a, b) {
  let count = 0;
  const left = [...a];
  const right = [...b];
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) count += 1;
  return count;
}

/**
 * Runs of three or more characters typed side by side on a keyboard.
 *
 * @param {string[]} chars
 * @returns {Match[]}
 */
function keyboardMatches(chars) {
  /** @type {Match[]} */
  const out = [];
  const lower = chars.map((c) => c.toLowerCase());
  const n = lower.length;
  const rows = [...KEYBOARD, ...KEYBOARD.map((r) => [...r].reverse().join(''))];
  for (let i = 0; i < n; i += 1) {
    let best = 0;
    for (const row of rows) {
      let length = 0;
      const at = row.indexOf(lower[i]);
      while (at >= 0 && i + length < n && row[at + length] === lower[i + length]) length += 1;
      if (length > best) best = length;
    }
    if (best >= 4 || (best === 3 && !/^\d+$/.test(lower.slice(i, i + 3).join('')))) {
      const token = chars.slice(i, i + best).join('');
      out.push({ kind: 'keyboard', start: i, end: i + best, token, bits: log2(rows.length * best * 2) + capsOf(token).bits }); // prettier-ignore
    }
  }
  return out;
}

/**
 * abc, 6543, xyz, 2468: characters that go up or down by the same step.
 *
 * @param {string[]} chars
 * @returns {Match[]}
 */
function sequenceMatches(chars) {
  /** @type {Match[]} */
  const out = [];
  const n = chars.length;
  let i = 0;
  while (i < n - 2) {
    const code = (/** @type {number} */ k) => chars[k].codePointAt(0) ?? 0;
    const delta = code(i + 1) - code(i);
    let j = i + 1;
    if (delta !== 0 && Math.abs(delta) <= 2 && charClass(chars[i]) === charClass(chars[j])) {
      while (j + 1 < n && code(j + 1) - code(j) === delta && charClass(chars[j + 1]) === charClass(chars[i])) j += 1; // prettier-ignore
    }
    if (j - i + 1 >= 3) {
      const token = chars.slice(i, j + 1).join('');
      const first = token[0].toLowerCase();
      const base = 'aA1z9'.includes(token[0]) || first === 'a' ? 4 : charClass(token[0]) === 'digit' ? 10 : 26; // prettier-ignore
      out.push({ kind: 'sequence', start: i, end: j + 1, token, bits: log2(base * (j - i + 1) * (delta < 0 ? 2 : 1) * Math.abs(delta)) }); // prettier-ignore
      i = j + 1;
    } else i += 1;
  }
  return out;
}

/**
 * aaa, abcabc, 121212: a character or a chunk said again.
 *
 * @param {string[]} chars
 * @param {string[]} user
 * @returns {Match[]}
 */
function repeatMatches(chars, user) {
  /** @type {Match[]} */
  const out = [];
  const n = chars.length;
  for (let i = 0; i < n; i += 1) {
    for (let size = 1; size <= Math.floor((n - i) / 2); size += 1) {
      const unit = chars.slice(i, i + size).join('');
      let count = 1;
      while (chars.slice(i + count * size, i + (count + 1) * size).join('') === unit) count += 1;
      if (count < 2 || (size === 1 && count < 3)) continue;
      const end = i + count * size;
      const unitBits = size === 1 ? log2(poolSize(classesOf([unit]))) : estimate(unit, user).bits;
      out.push({ kind: 'repeat', start: i, end, token: chars.slice(i, end).join(''), bits: unitBits + log2(count) }); // prettier-ignore
    }
  }
  return out;
}

/**
 * Years from 1900 to 2099, and dates with or without separators.
 *
 * @param {string} text
 * @returns {Match[]}
 */
function dateMatches(text) {
  /** @type {Match[]} */
  const out = [];
  // Indexes of matches count code units: they are indexes of characters only without
  // characters outside the Basic Multilingual Plane.
  if ([...text].length !== text.length) return out;
  for (const m of text.matchAll(YEAR)) out.push({ kind: 'year', start: m.index, end: m.index + 4, token: m[0], bits: log2(200) }); // prettier-ignore
  for (const m of text.matchAll(DATE)) {
    const [token, a, , b, c] = m;
    const parts = [a, b, c].map(Number);
    const long = [a, b, c].some((p) => p.length === 4);
    const plausible =
      (parts[1] >= 1 && parts[1] <= 12 && (parts[0] <= 31 || parts[2] <= 31)) ||
      (parts[0] >= 1 && parts[0] <= 12 && parts[1] <= 31);
    if (plausible && token.length >= 6)
      out.push({ kind: 'date', start: m.index, end: m.index + token.length, token, bits: log2(366 * (long ? 200 : 100)) + (m[2] ? 2 : 0) }); // prettier-ignore
  }
  // Compact dates: 6 or 8 digits.
  for (const m of text.matchAll(/\d{6}(?:\d{2})?/g)) {
    const s = m[0];
    const pairs = s.length === 8 ? [[s.slice(0, 2), s.slice(2, 4)], [s.slice(4, 6), s.slice(6, 8)]] : [[s.slice(0, 2), s.slice(2, 4)], [s.slice(2, 4), s.slice(4, 6)]]; // prettier-ignore
    if (pairs.some(([x, y]) => (+x >= 1 && +x <= 31 && +y >= 1 && +y <= 12) || (+x >= 1 && +x <= 12 && +y >= 1 && +y <= 31)))
      out.push({ kind: 'date', start: m.index, end: m.index + s.length, token: s, bits: log2(366 * (s.length === 8 ? 200 : 100)) }); // prettier-ignore
  }
  return out;
}

/**
 * Estimates the strength of a password.
 *
 * @param {string} password
 * @param {string[]} [user] - Words of the user's name, email or site, which make it weaker.
 * @returns {Strength}
 */
export function estimate(password, user = []) {
  const chars = [...String(password ?? '')].slice(0, 256);
  const text = chars.join('');
  const n = chars.length;
  const classes = classesOf(chars);
  const bruteBits = log2(poolSize(classes));
  const matches = [
    ...dictionaryMatches(chars, user),
    ...keyboardMatches(chars),
    ...sequenceMatches(chars),
    ...(n <= 64 ? repeatMatches(chars, user) : []),
    ...dateMatches(text),
  ];
  /** @type {Match[][]} */
  const byEnd = Array.from({ length: n + 1 }, () => []);
  for (const m of matches) byEnd[m.end].push(m);
  // The cheapest cover of the password: each part found costs its bits plus one for the
  // choice of where it goes; characters between parts cost brute-force bits.
  const best = new Array(n + 1).fill(Infinity);
  /** @type {(Match | null)[]} */
  const via = new Array(n + 1).fill(null);
  best[0] = 0;
  for (let end = 1; end <= n; end += 1) {
    best[end] = best[end - 1] + bruteBits;
    via[end] = null;
    for (const m of byEnd[end]) {
      const cost = best[m.start] + m.bits + 1;
      if (cost < best[end]) {
        best[end] = cost;
        via[end] = m;
      }
    }
  }
  /** @type {Match[]} */
  const sequence = [];
  for (let end = n; end > 0;) {
    const m = via[end];
    if (m) {
      sequence.unshift(m);
      end = m.start;
    } else {
      const start = end - 1;
      const last = sequence[0];
      if (last?.kind === 'brute' && last.start === end) {
        last.start = start;
        last.token = chars[start] + last.token;
        last.bits += bruteBits;
      } else sequence.unshift({ kind: 'brute', start, end, token: chars[start], bits: bruteBits });
      end = start;
    }
  }
  const bits = n ? Math.max(0, best[n] - (sequence.length === 1 && sequence[0].kind !== 'brute' ? 1 : 0)) : 0; // prettier-ignore
  const guesses = 2 ** bits;
  const score = /** @type {Strength['score']} */ (n ? SCORE_BITS.filter((t) => bits >= t).length : 0); // prettier-ignore
  /** @type {Record<string, number>} */
  const seconds = {};
  for (const [name, speed] of Object.entries(ATTACKS)) seconds[name] = guesses / 2 / speed;
  return {
    score,
    bits,
    guesses,
    length: n,
    classes,
    sequence,
    seconds: /** @type {Strength['seconds']} */ (seconds),
    ...feedback(sequence, score, n),
  };
}

/**
 * @param {Match[]} sequence
 * @param {number} score
 * @param {number} length
 * @returns {{ warning: string | null, suggestions: string[] }}
 */
function feedback(sequence, score, length) {
  if (!length) return { warning: null, suggestions: [] };
  const kinds = new Set(sequence.map((m) => m.kind));
  const found = sequence.filter((m) => m.kind !== 'brute');
  /** @type {string | null} */
  let warning = null;
  if (kinds.has('common')) warning = 'pwWarnCommon';
  else if (kinds.has('user')) warning = 'pwWarnUser';
  else if (
    found.length === 1 &&
    found[0].kind === 'dictionary' &&
    found[0].token.length >= length - 1
  )
    warning = 'pwWarnWord'; // prettier-ignore
  else if (kinds.has('keyboard')) warning = 'pwWarnKeyboard';
  else if (kinds.has('repeat')) warning = 'pwWarnRepeat';
  else if (kinds.has('sequence')) warning = 'pwWarnSequence';
  else if (kinds.has('date') || kinds.has('year')) warning = 'pwWarnDate';
  else if (kinds.has('dictionary') && score < 3) warning = 'pwWarnWords';
  if (score >= 3 && warning !== 'pwWarnCommon' && warning !== 'pwWarnUser') warning = null;
  /** @type {string[]} */
  const suggestions = [];
  if (score < 3) {
    if (length < 14) suggestions.push('pwSuggestLonger');
    if (found.some((m) => m.leet)) suggestions.push('pwSuggestLeet');
    if (found.some((m) => m.caps === 'first' || m.caps === 'all')) suggestions.push('pwSuggestCaps'); // prettier-ignore
    if (found.some((m) => m.reversed)) suggestions.push('pwSuggestReversed');
    if (!suggestions.length || kinds.has('dictionary') || kinds.has('common')) suggestions.push('pwSuggestWords'); // prettier-ignore
  }
  return { warning, suggestions: [...new Set(suggestions)].slice(0, 3) };
}

// ---------------------------------------------------------------- rules

/** Rule names `require` takes. */
export const RULES = /** @type {const} */ (['lower', 'upper', 'digit', 'symbol']);

/**
 * @typedef {object} RuleResult
 * @property {string} id - `length`, `max`, `lower`, `upper`, `digit`, `symbol`, `classes`, `spaces`, `user` or `score`.
 * @property {boolean} ok
 * @property {Record<string, string | number>} [params]
 */

/**
 * @typedef {object} Rules
 * @property {number} minLength
 * @property {number} maxLength
 * @property {string[]} require - Classes that must be there: `lower`, `upper`, `digit`, `symbol`.
 * @property {number} minClasses - At least this many of the four classes.
 * @property {number} minScore - The lowest score accepted (0 accepts any).
 * @property {boolean} noUser - The user's name or email may not be in it.
 */

/**
 * @param {string} password
 * @param {Rules} rules
 * @param {Strength} strength
 * @param {string[]} [user]
 * @returns {RuleResult[]} Each rule, met or not.
 */
export function checkRules(password, rules, strength, user = []) {
  const chars = [...password];
  const classes = strength.classes;
  /** @type {RuleResult[]} */
  const out = [];
  if (rules.minLength) out.push({ id: 'length', ok: chars.length >= rules.minLength, params: { min: rules.minLength } }); // prettier-ignore
  for (const name of rules.require) if (RULES.includes(/** @type {any} */ (name))) out.push({ id: name, ok: classes[/** @type {'lower'} */ (name)] }); // prettier-ignore
  if (rules.minClasses > 1) {
    const count = RULES.filter((name) => classes[name]).length;
    out.push({ id: 'classes', ok: count >= rules.minClasses, params: { min: rules.minClasses } });
  }
  if (rules.noUser && user.length) {
    const lower = password.toLowerCase();
    out.push({ id: 'user', ok: !user.some((w) => w.length >= 3 && lower.includes(w)) });
  }
  if (rules.minScore) out.push({ id: 'score', ok: !chars.length ? false : strength.score >= rules.minScore, params: { min: rules.minScore } }); // prettier-ignore
  if (rules.maxLength && chars.length > rules.maxLength) out.push({ id: 'max', ok: false, params: { max: rules.maxLength } }); // prettier-ignore
  return out;
}

// ---------------------------------------------------------------- generation

/**
 * A random password with at least one character of each class asked.
 *
 * @param {{ length?: number, classes?: string[], avoidAmbiguous?: boolean }} [options]
 * @returns {string}
 */
export function generatePassword(options = {}) {
  const length = Math.max(4, Math.min(256, Math.round(options.length ?? 20)));
  const names = (options.classes?.length ? options.classes : ['lower', 'upper', 'digit', 'symbol']).filter((c) => RULES.includes(/** @type {any} */ (c))); // prettier-ignore
  const sets = names.map((name) => {
    const all = ALPHABETS[/** @type {'lower'} */ (name)];
    return options.avoidAmbiguous ? [...all].filter((c) => !AMBIGUOUS.includes(c)).join('') : all;
  });
  const alphabet = sets.join('');
  const chars = sets.map((set) => set[randomBelow(set.length)]);
  chars.push(...randomString(length - chars.length, alphabet));
  return shuffle(chars).join('');
}

// ---------------------------------------------------------------- breaches

/**
 * @param {string} text
 * @returns {Promise<string>} The SHA-1 of the text, in upper-case hexadecimal.
 */
export async function sha1Hex(text) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase(); // prettier-ignore
}

/** Have I Been Pwned, Pwned Passwords range API. */
export const BREACH_URL = 'https://api.pwnedpasswords.com/range/';

/**
 * How many times a password appears in known breaches, with k-anonymity: only the first five
 * characters of its SHA-1 leave the page, and the answer is padded so its size tells nothing.
 *
 * @param {string} password
 * @param {{ url?: string, signal?: AbortSignal, fetch?: typeof fetch }} [options]
 * @returns {Promise<number>}
 */
export async function breachCount(password, options = {}) {
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const run = options.fetch ?? fetch;
  const response = await run(`${options.url ?? BREACH_URL}${prefix}`, {
    headers: { 'Add-Padding': 'true' },
    signal: options.signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.text();
  for (const line of body.split(/\r?\n/)) {
    const [rest, count] = line.trim().split(':');
    if (rest === suffix) return Number(count) || 0;
  }
  return 0;
}
