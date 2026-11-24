// @ts-check
/**
 * Countries of the world map: the ISO 3166-1 numeric code of each shape (as world-atlas
 * stores it) with its alpha-2 and alpha-3 codes, and the names a country can be written
 * with. Names come from `Intl.DisplayNames` in English and in the interface language, plus
 * a few common aliases, so "Allemagne", "Germany", "DE" and "DEU" all find the same shape.
 *
 * @module components/map/countries
 */

/** `numeric alpha2 alpha3`, for the 177 shapes of world-atlas countries-110m. */
const TABLE =
  '004AFAFG 008ALALB 010AQATA 012DZDZA 024AOAGO 031AZAZE 032ARARG 036AUAUS 040ATAUT 044BSBHS ' +
  '050BDBGD 051AMARM 056BEBEL 064BTBTN 068BOBOL 070BABIH 072BWBWA 076BRBRA 084BZBLZ 090SBSLB ' +
  '096BNBRN 100BGBGR 104MMMMR 108BIBDI 112BYBLR 116KHKHM 120CMCMR 124CACAN 140CFCAF 144LKLKA ' +
  '148TDTCD 152CLCHL 156CNCHN 158TWTWN 170COCOL 178CGCOG 180CDCOD 188CRCRI 191HRHRV 192CUCUB ' +
  '196CYCYP 203CZCZE 204BJBEN 208DKDNK 214DODOM 218ECECU 222SVSLV 226GQGNQ 231ETETH 232ERERI ' +
  '233EEEST 238FKFLK 242FJFJI 246FIFIN 250FRFRA 260TFATF 262DJDJI 266GAGAB 268GEGEO 270GMGMB ' +
  '275PSPSE 276DEDEU 288GHGHA 300GRGRC 304GLGRL 320GTGTM 324GNGIN 328GYGUY 332HTHTI 340HNHND ' +
  '348HUHUN 352ISISL 356ININD 360IDIDN 364IRIRN 368IQIRQ 372IEIRL 376ILISR 380ITITA 384CICIV ' +
  '388JMJAM 392JPJPN 398KZKAZ 400JOJOR 404KEKEN 408KPPRK 410KRKOR 414KWKWT 417KGKGZ 418LALAO ' +
  '422LBLBN 426LSLSO 428LVLVA 430LRLBR 434LYLBY 440LTLTU 442LULUX 450MGMDG 454MWMWI 458MYMYS ' +
  '466MLMLI 478MRMRT 484MXMEX 496MNMNG 498MDMDA 499MEMNE 504MAMAR 508MZMOZ 512OMOMN 516NANAM ' +
  '524NPNPL 528NLNLD 540NCNCL 548VUVUT 554NZNZL 558NINIC 562NENER 566NGNGA 578NONOR 586PKPAK ' +
  '591PAPAN 598PGPNG 600PYPRY 604PEPER 608PHPHL 616PLPOL 620PTPRT 624GWGNB 626TLTLS 630PRPRI ' +
  '634QAQAT 642ROROU 643RURUS 646RWRWA 682SASAU 686SNSEN 688RSSRB 694SLSLE 703SKSVK 704VNVNM ' +
  '705SISVN 706SOSOM 710ZAZAF 716ZWZWE 724ESESP 728SSSSD 729SDSDN 732EHESH 740SRSUR 748SZSWZ ' +
  '752SESWE 756CHCHE 760SYSYR 762TJTJK 764THTHA 768TGTGO 780TTTTO 784AEARE 788TNTUN 792TRTUR ' +
  '795TMTKM 800UGUGA 804UAUKR 807MKMKD 818EGEGY 826GBGBR 834TZTZA 840USUSA 854BFBFA 858UYURY ' +
  '860UZUZB 862VEVEN 887YEYEM 894ZMZMB';

/** Shapes world-atlas leaves without a numeric code, found by their name instead. */
const UNCODED = Object.freeze({ Kosovo: ['XK', 'XKX'], 'N. Cyprus': ['', 'CYN'], Somaliland: ['', 'SOL'] }); // prettier-ignore

/** @typedef {{ numeric: string, a2: string, a3: string }} CountryCode */

/** @type {Map<string, CountryCode>} */
const byNumeric = new Map();
/** @type {Map<string, CountryCode>} */
const byCode = new Map();
for (const entry of TABLE.split(' ')) {
  const code = { numeric: entry.slice(0, 3), a2: entry.slice(3, 5), a3: entry.slice(5, 8) };
  byNumeric.set(code.numeric, code);
  byCode.set(code.a2, code);
  byCode.set(code.a3, code);
}
for (const [name, [a2, a3]] of Object.entries(UNCODED)) {
  const code = { numeric: name, a2, a3 };
  byNumeric.set(name, code);
  if (a2) byCode.set(a2, code);
  byCode.set(a3, code);
}

/** Names people write that Intl.DisplayNames does not give. */
const ALIASES = Object.freeze({
  usa: 'US', 'united states of america': 'US', america: 'US', 'etats-unis': 'US', 'etats unis': 'US',
  uk: 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', angleterre: 'GB',
  'grande-bretagne': 'GB', 'royaume uni': 'GB', holland: 'NL', 'czech republic': 'CZ', 'republique tcheque': 'CZ',
  'ivory coast': 'CI', 'cote divoire': 'CI', drc: 'CD', 'dr congo': 'CD', 'congo-kinshasa': 'CD', 'congo kinshasa': 'CD',
  'congo-brazzaville': 'CG', burma: 'MM', swaziland: 'SZ', eswatini: 'SZ', macedonia: 'MK', 'north macedonia': 'MK',
  'south korea': 'KR', 'north korea': 'KP', 'coree du sud': 'KR', 'coree du nord': 'KP', russia: 'RU', 'russian federation': 'RU',
  'east timor': 'TL', 'cape verde': 'CV', vatican: 'VA', persia: 'IR', 'western sahara': 'EH', 'w. sahara': 'EH',
  'bosnia': 'BA', 'bosnia and herzegovina': 'BA', turkiye: 'TR', 'the netherlands': 'NL', 'the bahamas': 'BS',
}); // prettier-ignore

/**
 * Lowercase, without accents, apostrophes or extra spaces: how names are compared.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`.]/g, '')
    .replace(/[\s_]+/g, ' ')
    .trim();
}

/** @type {Map<string, Map<string, string>>} Names to alpha-2 code, per locale. */
const nameIndexes = new Map();

/**
 * @param {string} locale
 * @returns {Map<string, string>}
 */
function nameIndex(locale) {
  const lang = locale.split('-')[0] || 'en';
  const cached = nameIndexes.get(lang);
  if (cached) return cached;
  /** @type {Map<string, string>} */
  const index = new Map(Object.entries(ALIASES));
  for (const l of new Set(['en', 'fr', lang])) {
    const names = displayNames(l);
    if (!names) continue;
    for (const { a2 } of byCode.values()) {
      if (!a2) continue;
      const name = names.of(a2);
      if (name && name !== a2) index.set(normalize(name), a2);
    }
  }
  nameIndexes.set(lang, index);
  return index;
}

/** @type {Map<string, Intl.DisplayNames | null>} */
const displayCache = new Map();

/**
 * @param {string} locale
 * @returns {Intl.DisplayNames | null}
 */
function displayNames(locale) {
  if (!displayCache.has(locale)) {
    try {
      displayCache.set(locale, new Intl.DisplayNames([locale], { type: 'region' }));
    } catch {
      displayCache.set(locale, null);
    }
  }
  return displayCache.get(locale) ?? null;
}

/**
 * The codes of a world-atlas shape, from its numeric id (or its name when it has none).
 *
 * @param {string | undefined} id
 * @param {string} [name]
 * @returns {CountryCode}
 */
export function codeOfShape(id, name = '') {
  return byNumeric.get(id ?? name) ?? byNumeric.get(name) ?? { numeric: id ?? name, a2: '', a3: '' }; // prettier-ignore
}

/**
 * Finds a country from an alpha-2 or alpha-3 code, a numeric code, or a name in English
 * or in the interface language.
 *
 * @param {string} text
 * @param {string} [locale]
 * @returns {CountryCode | null}
 */
export function findCountry(text, locale = 'en') {
  const value = text.trim();
  if (!value) return null;
  if (/^[A-Za-z]{2,3}$/.test(value) && byCode.has(value.toUpperCase())) {
    // Two or three letters are a code only in capitals, or when they are no common word.
    if (value === value.toUpperCase() || !nameIndex(locale).has(normalize(value)))
      return byCode.get(value.toUpperCase()) ?? null;
  }
  if (/^\d{3}$/.test(value)) return byNumeric.get(value) ?? null;
  const key = normalize(value);
  const a2 = nameIndex(locale).get(key);
  if (a2) return byCode.get(a2) ?? null;
  for (const [name, codes] of Object.entries(UNCODED))
    if (normalize(name) === key) return byCode.get(codes[1]) ?? null;
  return null;
}

/**
 * The name of a country in a language, or the fallback (the name stored with the shape).
 *
 * @param {CountryCode} code
 * @param {string} locale
 * @param {string} [fallback]
 * @returns {string}
 */
export function countryName(code, locale, fallback = '') {
  if (!code.a2) return fallback || code.a3;
  const name = displayNames(locale)?.of(code.a2);
  return name && name !== code.a2 ? name : fallback || code.a2;
}

/**
 * The emoji flag of an alpha-2 code.
 *
 * @param {string} a2
 * @returns {string}
 */
export function flag(a2) {
  if (!/^[A-Z]{2}$/.test(a2)) return '';
  return String.fromCodePoint(...[...a2].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
