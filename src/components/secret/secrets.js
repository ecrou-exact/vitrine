// @ts-check
/**
 * API keys and secrets: which service a key belongs to (from its documented prefix and
 * shape), whether it is live or test, secret or publishable, how much randomness it holds,
 * how to show it masked without putting it in the page, and how to copy it for a shell or a
 * `.env` file.
 *
 * @module components/secret/secrets
 */
import { ALPHABETS, randomString } from '../../core/random.js';
import { powershellQuote, shellQuote } from '../../core/shell.js';

/**
 * @typedef {object} KeyKind
 * @property {string} id
 * @property {string} provider - Service name.
 * @property {string} label - Kind of key.
 * @property {RegExp} pattern
 * @property {number} prefix - Characters that name the kind, safe to show.
 * @property {'secret' | 'publishable' | 'temporary' | 'private-key' | 'token'} [kind]
 * @property {(m: RegExpExecArray) => ('live' | 'test' | null)} [env]
 */

/** @type {KeyKind[]} Kinds of keys, from the documentation of each service. */
export const KINDS = [
  { id: 'anthropic', provider: 'Anthropic', label: 'API key', pattern: /^sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{20,}$/, prefix: 14 },
  { id: 'openai', provider: 'OpenAI', label: 'API key', pattern: /^sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}$/, prefix: 8 },
  { id: 'github-classic', provider: 'GitHub', label: 'Personal access token (classic)', pattern: /^ghp_[A-Za-z0-9]{36}$/, prefix: 4, kind: 'token' },
  { id: 'github-fine', provider: 'GitHub', label: 'Fine-grained personal access token', pattern: /^github_pat_[A-Za-z0-9_]{60,}$/, prefix: 11, kind: 'token' },
  { id: 'github-oauth', provider: 'GitHub', label: 'OAuth token', pattern: /^gho_[A-Za-z0-9]{36}$/, prefix: 4, kind: 'token' },
  { id: 'github-app', provider: 'GitHub', label: 'App token', pattern: /^gh[su]_[A-Za-z0-9]{36}$/, prefix: 4, kind: 'temporary' },
  { id: 'github-refresh', provider: 'GitHub', label: 'Refresh token', pattern: /^ghr_[A-Za-z0-9]{36,}$/, prefix: 4, kind: 'token' },
  { id: 'gitlab', provider: 'GitLab', label: 'Personal access token', pattern: /^glpat-[A-Za-z0-9_-]{20,}$/, prefix: 6, kind: 'token' },
  { id: 'aws', provider: 'AWS', label: 'Access key ID', pattern: /^(AKIA|ASIA)[A-Z0-9]{16}$/, prefix: 4, kind: 'secret' },
  { id: 'stripe', provider: 'Stripe', label: 'API key', pattern: /^(sk|rk|pk)_(live|test)_[A-Za-z0-9]{10,}$/, prefix: 8, env: (m) => (m[2] === 'live' ? 'live' : 'test') },
  { id: 'stripe-webhook', provider: 'Stripe', label: 'Webhook signing secret', pattern: /^whsec_[A-Za-z0-9+/=]{24,}$/, prefix: 6 },
  { id: 'slack', provider: 'Slack', label: 'Token', pattern: /^xox[abposr]-[A-Za-z0-9-]{10,}$/, prefix: 5, kind: 'token' },
  { id: 'slack-webhook', provider: 'Slack', label: 'Incoming webhook URL', pattern: /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}$/, prefix: 33 },
  { id: 'google', provider: 'Google Cloud', label: 'API key', pattern: /^AIza[0-9A-Za-z_-]{35}$/, prefix: 4 },
  { id: 'huggingface', provider: 'Hugging Face', label: 'Access token', pattern: /^hf_[A-Za-z0-9]{30,}$/, prefix: 3, kind: 'token' },
  { id: 'npm', provider: 'npm', label: 'Access token', pattern: /^npm_[A-Za-z0-9]{36}$/, prefix: 4, kind: 'token' },
  { id: 'pypi', provider: 'PyPI', label: 'API token', pattern: /^pypi-[A-Za-z0-9_-]{50,}$/, prefix: 5, kind: 'token' },
  { id: 'docker', provider: 'Docker Hub', label: 'Personal access token', pattern: /^dckr_pat_[A-Za-z0-9_-]{20,}$/, prefix: 9, kind: 'token' },
  { id: 'sendgrid', provider: 'SendGrid', label: 'API key', pattern: /^SG\.[A-Za-z0-9_-]{16,32}\.[A-Za-z0-9_-]{30,50}$/, prefix: 3 },
  { id: 'twilio', provider: 'Twilio', label: 'API key SID', pattern: /^SK[0-9a-fA-F]{32}$/, prefix: 2 },
  { id: 'shopify', provider: 'Shopify', label: 'Access token', pattern: /^shp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}$/, prefix: 6, kind: 'token' },
  { id: 'digitalocean', provider: 'DigitalOcean', label: 'Token', pattern: /^do[opr]_v1_[a-f0-9]{64}$/, prefix: 7, kind: 'token' },
  { id: 'vault', provider: 'HashiCorp Vault', label: 'Token', pattern: /^hv[sbr]\.[A-Za-z0-9_-]{20,}$/, prefix: 4, kind: 'token' },
  { id: 'mailgun', provider: 'Mailgun', label: 'API key', pattern: /^key-[0-9a-f]{32}$/, prefix: 4 },
  { id: 'linear', provider: 'Linear', label: 'API key', pattern: /^lin_api_[A-Za-z0-9]{40}$/, prefix: 8 },
  { id: 'supabase', provider: 'Supabase', label: 'Access token', pattern: /^sbp_[a-f0-9]{40}$/, prefix: 4, kind: 'token' },
  { id: 'telegram', provider: 'Telegram', label: 'Bot token', pattern: /^\d{8,10}:[A-Za-z0-9_-]{35}$/, prefix: 0, kind: 'token' },
  { id: 'jwt', provider: 'JWT', label: 'JSON Web Token', pattern: /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/, prefix: 3, kind: 'token' },
  { id: 'private-key', provider: 'PEM', label: 'Private key', pattern: /^-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]+-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----\s*$/, prefix: 0, kind: 'private-key' },
  { id: 'uuid', provider: '', label: 'UUID', pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, prefix: 0 },
]; // prettier-ignore

/**
 * @typedef {object} Detected
 * @property {string} id
 * @property {string} provider
 * @property {string} label
 * @property {number} prefix - Characters safe to show.
 * @property {'live' | 'test' | null} env
 * @property {'secret' | 'publishable' | 'temporary' | 'private-key' | 'token'} kind
 */

/**
 * @param {string} value
 * @returns {Detected | null} The kind of key, from its prefix and shape.
 */
export function detectSecret(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 10000) return null;
  for (const kind of KINDS) {
    const m = kind.pattern.exec(text);
    if (!m) continue;
    let type = kind.kind ?? 'secret';
    if (kind.id === 'stripe' && m[1] === 'pk') type = 'publishable';
    if (kind.id === 'aws' && m[1] === 'ASIA') type = 'temporary';
    return { id: kind.id, provider: kind.provider, label: kind.label, prefix: kind.prefix, env: kind.env?.(m) ?? null, kind: type }; // prettier-ignore
  }
  return null;
}

/**
 * @param {string} value
 * @returns {{ name: string, size: number }} The smallest usual alphabet of a key.
 */
export function alphabetOf(value) {
  if (/^[0-9a-f]+$/.test(value) || /^[0-9A-F]+$/.test(value)) return { name: 'hex', size: 16 };
  if (/^[A-Z2-7]+=*$/.test(value)) return { name: 'base32', size: 32 };
  if (/^[0-9A-Za-z]+$/.test(value)) return { name: 'base62', size: 62 };
  if (/^[0-9A-Za-z_-]+$/.test(value)) return { name: 'base64url', size: 64 };
  if (/^[0-9A-Za-z+/]+=*$/.test(value)) return { name: 'base64', size: 64 };
  return { name: 'printable', size: 95 };
}

/**
 * The randomness a key may hold at most: its random part times the bits of its alphabet.
 *
 * @param {string} value
 * @returns {number} Bits, 0 for a private key or a token with structure.
 */
export function entropyBits(value) {
  const found = detectSecret(value);
  if (found?.kind === 'private-key' || found?.id === 'jwt') return 0;
  if (found?.id === 'uuid') return 122;
  // Dots only separate parts; the prefix names the kind and is not random.
  const rest = [...String(value ?? '').trim()]
    .slice(found?.prefix ?? 0)
    .join('')
    .replace(/\./g, '');
  if (!rest) return 0;
  return Math.round(rest.length * Math.log2(alphabetOf(rest).size));
}

/** Characters that stand in for hidden ones. They are fixed, never taken from the secret. */
const DECOY = 'x7Kq2Lm9PaR4vN8sB3dT6wF1hJ5cY0gZ';

/**
 * @typedef {object} Masked
 * @property {string} start - Shown as is: the kind prefix.
 * @property {string} hidden - Stand-in characters, as many as hidden (at most 48).
 * @property {string} end - Shown as is: the last characters.
 * @property {number} count - Characters hidden.
 */

/**
 * How to show a secret without putting it in the page: its kind prefix and its last
 * characters can be shown, the rest is replaced by fixed characters drawn blurred or as dots.
 *
 * @param {string} value
 * @param {{ start?: number, end?: number }} [options] - Characters to show at each end;
 *   default: the kind prefix and the last 4 of keys of 20 characters or more.
 * @returns {Masked}
 */
export function maskSecret(value, options = {}) {
  const chars = [...String(value ?? '')];
  const found = detectSecret(value);
  const long = chars.length >= 20;
  let start = options.start ?? (found ? found.prefix : 0);
  let end = options.end ?? (long && found?.kind !== 'private-key' ? 4 : 0);
  // At least half stays hidden, whatever was asked.
  const most = Math.floor(chars.length / 4);
  start = Math.max(0, Math.min(start, chars.length >= 12 ? Math.max(most, found?.prefix ?? 0) : 0));
  end = Math.max(0, Math.min(end, most));
  if (start + end > chars.length / 2) end = 0;
  const count = Math.max(0, chars.length - start - end);
  let hidden = '';
  for (let i = 0; i < Math.min(48, count); i += 1) hidden += DECOY[(i * 7 + chars.length) % DECOY.length]; // prettier-ignore
  return { start: chars.slice(0, start).join(''), hidden, end: end ? chars.slice(-end).join('') : '', count }; // prettier-ignore
}

/** Alphabets a generated key may use. */
export const KEY_ALPHABETS = /** @type {const} */ (['base62', 'hex', 'base64url', 'base32']);

/**
 * @param {{ prefix?: string, length?: number, alphabet?: string }} [options]
 * @returns {string} A random key: `prefix` and `length` characters of `alphabet`.
 */
export function generateSecret(options = {}) {
  const name = KEY_ALPHABETS.includes(/** @type {any} */ (options.alphabet)) ? /** @type {'hex'} */ (options.alphabet) : 'base62'; // prettier-ignore
  const length = Math.max(8, Math.min(512, Math.round(options.length ?? 40)));
  return `${(options.prefix ?? '').replace(/[^\w.-]/g, '').slice(0, 32)}${randomString(length, ALPHABETS[name])}`; // prettier-ignore
}

/** Ways to copy a secret. */
export const COPY_FORMATS = /** @type {const} */ (['raw', 'env', 'shell', 'powershell', 'header', 'json']); // prettier-ignore

/**
 * @param {string} name
 * @returns {string} A name usable as an environment variable.
 */
export function envName(name) {
  const clean = String(name ?? '').trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase(); // prettier-ignore
  return /^[A-Z_]/.test(clean) ? clean.slice(0, 100) : `KEY_${clean}`.slice(0, 100);
}

/**
 * @param {string} value
 * @param {typeof COPY_FORMATS[number]} format
 * @param {string} [name] - Variable name, for `env`, `shell`, `powershell` and `json`.
 * @returns {string} The text to copy.
 */
export function copyAs(value, format, name = 'API_KEY') {
  const variable = envName(name);
  if (format === 'env') {
    // dotenv: double quotes when needed, with \\, \" and \n escaped.
    const plain = /^[A-Za-z0-9_./:+=@-]*$/.test(value);
    return `${variable}=${plain ? value : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`}`; // prettier-ignore
  }
  if (format === 'shell') return `export ${variable}=${shellQuote(value)}`;
  if (format === 'powershell') return `$env:${variable} = ${powershellQuote(value)}`;
  if (format === 'header') return `Authorization: Bearer ${value.replace(/[\r\n]+/g, '')}`;
  if (format === 'json') return JSON.stringify({ [variable]: value });
  return value;
}

/**
 * The claims of a JSON Web Token that say when it is valid, without checking its signature.
 *
 * @param {string} token
 * @returns {{ issued: Date | null, expires: Date | null, subject: string } | null}
 */
export function jwtTimes(token) {
  const part = String(token ?? '').split('.')[1];
  if (!part) return null;
  try {
    const binary = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')); // prettier-ignore
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))); // prettier-ignore
    const date = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) ? new Date(v * 1000) : null); // prettier-ignore
    return { issued: date(claims.iat), expires: date(claims.exp), subject: typeof claims.sub === 'string' ? claims.sub.slice(0, 200) : '' }; // prettier-ignore
  } catch {
    return null;
  }
}

/**
 * @param {Date | null} expires
 * @param {Date} now
 * @param {number} warnDays
 * @returns {'expired' | 'soon' | 'ok' | null}
 */
export function expiryState(expires, now, warnDays) {
  if (!expires || Number.isNaN(expires.getTime())) return null;
  const left = expires.getTime() - now.getTime();
  if (left <= 0) return 'expired';
  return left <= warnDays * 86400000 ? 'soon' : 'ok';
}
