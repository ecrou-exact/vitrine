// @ts-check
/**
 * Cron schedules in plain words, and labels of their fields, in the reader's language.
 * Month and weekday names come from `Intl`, so they follow the locale.
 *
 * @module components/cron/describe
 */

/** @typedef {import('./cron.js').CronSchedule} CronSchedule */
/** @typedef {import('./cron.js').CronField} CronField */
/** @typedef {import('./cron.js').CronItem} CronItem */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */
/** @typedef {(key: StringKey, params?: Record<string, string | number>) => string} Translate */

/**
 * @param {string} locale
 * @param {number} month - 1 to 12.
 * @returns {string}
 */
export function monthName(locale, month) {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    Date.UTC(2001, month - 1, 1),
  );
}

/**
 * @param {string} locale
 * @param {number} dow - 0 (Sunday) to 6.
 * @param {'long' | 'short'} [width]
 * @returns {string}
 */
export function weekdayName(locale, dow, width = 'long') {
  // 7 January 2001 was a Sunday.
  return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' }).format(
    Date.UTC(2001, 0, 7 + (dow % 7)),
  );
}

/**
 * @param {string} locale
 * @param {string[]} items
 * @param {'conjunction' | 'disjunction'} [type]
 * @returns {string}
 */
function list(locale, items, type = 'conjunction') {
  if (items.length < 2) return items[0] ?? '';
  try {
    return new Intl.ListFormat(locale, { style: 'long', type }).format(items);
  } catch {
    return items.join(', ');
  }
}

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');

/**
 * @param {number} hour
 * @param {number} minute
 * @param {number | null} second
 * @returns {string}
 */
export function clock(hour, minute, second) {
  return `${pad(hour)}:${pad(minute)}${second === null ? '' : `:${pad(second)}`}`;
}

/**
 * @param {CronField} field
 * @returns {boolean} Only single values.
 */
const singles = (field) => field.items.every((item) => item.kind === 'value');

/**
 * @param {CronField} field
 * @returns {number | null} The step of `*\/n`, when that is the whole field.
 */
function everyStep(field) {
  const [item] = field.items;
  return field.items.length === 1 && item.kind === 'any' && item.step > 1 ? item.step : null;
}

/**
 * Words for one value of a field.
 *
 * @param {CronField} field
 * @param {number} value
 * @param {string} locale
 * @returns {string}
 */
function valueName(field, value, locale) {
  if (field.name === 'month') return monthName(locale, value);
  if (field.name === 'weekday') return weekdayName(locale, value);
  return String(value);
}

/**
 * Words for each item of a field.
 *
 * @param {CronField} field
 * @param {Translate} t
 * @param {string} locale
 * @returns {string[]}
 */
function itemWords(field, t, locale) {
  const name = (/** @type {number} */ v) => valueName(field, v, locale);
  return field.items.map((item) => {
    switch (item.kind) {
      case 'value':
        return name(item.value);
      case 'range':
        return item.step > 1
          ? t('cronStepRange', { step: item.step, from: name(item.from), to: name(item.to) })
          : t('cronRange', { from: name(item.from), to: name(item.to) });
      case 'any':
        return t('cronEveryStep', { step: item.step });
      case 'last':
        return item.offset ? t('cronLastDayOffset', { n: item.offset }) : t('cronLastDay');
      case 'lastWeekday':
        return t('cronLastWeekday');
      case 'weekday':
        return t('cronNearestWeekday', { day: item.day });
      case 'lastDow':
        return t('cronLastDow', { day: weekdayName(locale, item.dow) });
      case 'nth':
        return t('cronNth', {
          ordinal: t(/** @type {StringKey} */ (`cronOrdinal${item.n}`)),
          day: weekdayName(locale, item.dow),
        });
      default:
        return '';
    }
  });
}

/**
 * The phrase of a time field (second, minute, hour), or `''` when it adds nothing.
 *
 * @param {CronField} field
 * @param {Translate} t
 * @param {string} locale
 * @returns {string}
 */
function timePhrase(field, t, locale) {
  const unit = field.name === 'second' ? 'Second' : field.name === 'minute' ? 'Minute' : 'Hour';
  if (field.any)
    return field.name === 'hour' ? '' : t(/** @type {StringKey} */ (`cronEvery${unit}`));
  const step = everyStep(field);
  if (step) return t(/** @type {StringKey} */ (`cronEveryN${unit}s`), { n: step });
  const [item] = field.items;
  if (
    field.name === 'hour' &&
    field.items.length === 1 &&
    item.kind === 'range' &&
    item.step === 1
  ) {
    return t('cronBetween', { from: clock(item.from, 0, null), to: clock(item.to, 59, null) });
  }
  const many = field.items.length > 1 || item.kind !== 'value';
  return t(/** @type {StringKey} */ (`cron${unit}${many ? 'Many' : 'One'}`), {
    list: list(locale, itemWords(field, t, locale)),
  });
}

/**
 * The time of day: `At 09:30`, `At 09:00 and 17:00`, or phrases for each field.
 *
 * @param {CronSchedule} schedule
 * @param {Translate} t
 * @param {string} locale
 * @returns {string[]}
 */
function timeOfDay(schedule, t, locale) {
  const [sec, min, hour] = schedule.fields;
  const fixedSecond = singles(sec) && sec.values.length === 1;
  if (
    fixedSecond &&
    singles(min) &&
    min.values.length === 1 &&
    singles(hour) &&
    hour.values.length <= 6
  ) {
    const second = schedule.seconds && sec.values[0] !== 0 ? sec.values[0] : null;
    const times = hour.values.map((h) => clock(h, min.values[0], second));
    return [t('cronAt', { time: list(locale, times) })];
  }
  const phrases = [];
  if (schedule.seconds && !(fixedSecond && sec.values[0] === 0))
    phrases.push(timePhrase(sec, t, locale));
  phrases.push(timePhrase(min, t, locale));
  if (hour.any && singles(min) && min.values.length === 1) phrases.push(t('cronEveryHour'));
  else phrases.push(timePhrase(hour, t, locale));
  return phrases.filter(Boolean);
}

/**
 * The days: day of the month, day of the week (either one when both are set), and month.
 *
 * @param {CronSchedule} schedule
 * @param {Translate} t
 * @param {string} locale
 * @returns {string[]}
 */
function days(schedule, t, locale) {
  const [, , , dom, month, dow] = schedule.fields;
  const phrases = [];
  const domText = dom.any ? '' : dayOfMonth(dom, t, locale);
  const dowText = dow.any ? '' : dayOfWeek(dow, t, locale);
  if (domText && dowText) phrases.push(t('cronOr', { a: domText, b: dowText }));
  else if (domText || dowText) phrases.push(domText || dowText);
  if (!month.any) {
    const step = everyStep(month);
    phrases.push(
      step
        ? t('cronEveryNMonths', { n: step })
        : t('cronInMonths', { list: list(locale, itemWords(month, t, locale)) }),
    );
  }
  return phrases;
}

/**
 * @param {CronField} field
 * @param {Translate} t
 * @param {string} locale
 * @returns {string}
 */
function dayOfMonth(field, t, locale) {
  const step = everyStep(field);
  if (step) return t('cronEveryNDays', { n: step });
  const plain = field.items.filter((item) => item.kind === 'value' || item.kind === 'range');
  const special = field.items.filter((item) => item.kind !== 'value' && item.kind !== 'range');
  const words = [];
  if (plain.length) {
    const many = plain.length > 1 || plain[0].kind !== 'value';
    const text = list(locale, itemWords({ ...field, items: plain }, t, locale));
    words.push(t(many ? 'cronDaysMany' : 'cronDaysOne', { list: text }));
  }
  words.push(...itemWords({ ...field, items: special }, t, locale));
  return list(locale, words);
}

/**
 * @param {CronField} field
 * @param {Translate} t
 * @param {string} locale
 * @returns {string}
 */
function dayOfWeek(field, t, locale) {
  const [item] = field.items;
  if (field.items.length === 1 && item.kind === 'range' && item.step === 1) {
    return t('cronWeekdayRange', {
      from: weekdayName(locale, item.from),
      to: weekdayName(locale, item.to),
    });
  }
  const plain = field.items.filter((i) => i.kind !== 'lastDow' && i.kind !== 'nth');
  const special = field.items.filter((i) => i.kind === 'lastDow' || i.kind === 'nth');
  const words = [];
  if (plain.length) {
    words.push(
      t('cronWeekdays', { list: list(locale, itemWords({ ...field, items: plain }, t, locale)) }),
    );
  }
  words.push(...itemWords({ ...field, items: special }, t, locale));
  return list(locale, words);
}

/**
 * The schedule in words: "At 09:30, Monday through Friday".
 *
 * @param {CronSchedule} schedule
 * @param {Translate} t
 * @param {string} locale
 * @returns {string}
 */
export function describe(schedule, t, locale) {
  if (schedule.error) return '';
  if (schedule.reboot) return t('cronReboot');
  const phrases = [...timeOfDay(schedule, t, locale), ...days(schedule, t, locale)];
  const text = phrases.join(', ');
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/**
 * What one field allows, for its tooltip: "minute: 0, 15 and 30".
 *
 * @param {CronField} field
 * @param {Translate} t
 * @param {string} locale
 * @returns {string}
 */
export function describeField(field, t, locale) {
  const label = t(/** @type {StringKey} */ (`cronField_${field.name}`));
  const value = field.any ? t('cronAny') : list(locale, itemWords(field, t, locale));
  return `${label}: ${value}`;
}
