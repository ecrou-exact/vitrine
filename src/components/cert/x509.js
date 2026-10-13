// @ts-check
/**
 * Reads X.509 certificates and PKCS #10 certificate requests (PEM or DER) into plain data.
 *
 * Nothing is verified and nothing is fetched: signatures are not checked, and URLs of
 * extensions (CRL, OCSP, CA issuers) are only read as text.
 *
 * @module components/cert/x509
 */

import {
  DerError,
  TAG,
  child,
  contents,
  encapsulated,
  encoding,
  expect,
  hex,
  integer,
  integerHex,
  oid,
  parseDer,
  text,
  time,
} from './der.js';

/** @typedef {import('./der.js').DerNode} DerNode */

/** Maximum number of PEM blocks read. */
export const MAX_BLOCKS = 20;

/**
 * @typedef {object} NamePart
 * @property {string} oid
 * @property {string} type - Short name (`CN`, `O`…) or the OID.
 * @property {string} value
 */

/**
 * @typedef {object} ExtensionEntry
 * @property {string | null} label - `DNS`, `IP`, `URI`, `OCSP`… or null.
 * @property {string} value
 */

/**
 * @typedef {object} Extension
 * @property {string} oid
 * @property {string} name - Readable name, or the OID.
 * @property {boolean} critical
 * @property {ExtensionEntry[]} entries
 */

/**
 * @typedef {object} PublicKey
 * @property {string} algorithm - `RSA`, `EC`, `Ed25519`… or the OID.
 * @property {number | null} bits - Key size, when known.
 * @property {string | null} curve - Curve of EC keys.
 */

/**
 * @typedef {object} Certificate
 * @property {"certificate"|"request"} kind
 * @property {number} version - 1, 2 or 3.
 * @property {string} serial - Hex, `""` for requests.
 * @property {string} signatureAlgorithm - Readable name or OID.
 * @property {string} signatureOid
 * @property {NamePart[]} subject
 * @property {NamePart[]} issuer - Empty for requests.
 * @property {Date | null} notBefore
 * @property {Date | null} notAfter
 * @property {PublicKey} publicKey
 * @property {Extension[]} extensions
 * @property {string[]} weaknesses - `md5`, `sha1`, `rsa-small`.
 * @property {boolean} selfSigned
 * @property {string | null} keyId - Subject key identifier (hex).
 * @property {string | null} authorityKeyId - Authority key identifier (hex).
 * @property {Uint8Array} der - Encoding of the certificate.
 * @property {DerNode} root - Parsed structure.
 */

/**
 * @typedef {object} CertResult
 * @property {Certificate[]} certificates
 * @property {{ index: number, message: string }[]} errors - Blocks that could not be read.
 * @property {number} privateKeys - Private key blocks found (never shown).
 * @property {number} skipped - Other PEM blocks ignored.
 */

const NAME_TYPES = /** @type {Record<string, string>} */ ({
  '2.5.4.3': 'CN', '2.5.4.4': 'SN', '2.5.4.5': 'serialNumber', '2.5.4.6': 'C', '2.5.4.7': 'L',
  '2.5.4.8': 'ST', '2.5.4.9': 'street', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.12': 'title',
  '2.5.4.15': 'businessCategory', '2.5.4.17': 'postalCode', '2.5.4.42': 'GN',
  '2.5.4.97': 'organizationIdentifier', '1.2.840.113549.1.9.1': 'emailAddress',
  '0.9.2342.19200300.100.1.25': 'DC', '0.9.2342.19200300.100.1.1': 'UID',
  '1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionC',
}); // prettier-ignore

const SIGNATURES = /** @type {Record<string, string>} */ ({
  '1.2.840.113549.1.1.2': 'MD2 with RSA', '1.2.840.113549.1.1.4': 'MD5 with RSA',
  '1.2.840.113549.1.1.5': 'SHA-1 with RSA', '1.2.840.113549.1.1.11': 'SHA-256 with RSA',
  '1.2.840.113549.1.1.12': 'SHA-384 with RSA', '1.2.840.113549.1.1.13': 'SHA-512 with RSA',
  '1.2.840.113549.1.1.14': 'SHA-224 with RSA', '1.2.840.113549.1.1.10': 'RSASSA-PSS',
  '1.2.840.10045.4.1': 'ECDSA with SHA-1', '1.2.840.10045.4.3.2': 'ECDSA with SHA-256',
  '1.2.840.10045.4.3.3': 'ECDSA with SHA-384', '1.2.840.10045.4.3.4': 'ECDSA with SHA-512',
  '1.2.840.10040.4.3': 'DSA with SHA-1', '2.16.840.1.101.3.4.3.2': 'DSA with SHA-256',
  '1.3.101.112': 'Ed25519', '1.3.101.113': 'Ed448',
}); // prettier-ignore

const WEAK_SIGNATURES = /** @type {Record<string, string>} */ ({
  '1.2.840.113549.1.1.2': 'md5', '1.2.840.113549.1.1.4': 'md5', '1.2.840.113549.1.1.5': 'sha1',
  '1.2.840.10045.4.1': 'sha1', '1.2.840.10040.4.3': 'sha1',
}); // prettier-ignore

const KEY_TYPES = /** @type {Record<string, string>} */ ({
  '1.2.840.113549.1.1.1': 'RSA', '1.2.840.113549.1.1.10': 'RSASSA-PSS', '1.2.840.10045.2.1': 'EC',
  '1.2.840.10040.4.1': 'DSA', '1.3.101.110': 'X25519', '1.3.101.111': 'X448',
  '1.3.101.112': 'Ed25519', '1.3.101.113': 'Ed448',
}); // prettier-ignore

const KEY_BITS = /** @type {Record<string, number>} */ ({
  X25519: 255, X448: 448, Ed25519: 255, Ed448: 448,
}); // prettier-ignore

const CURVES = /** @type {Record<string, [string, number]>} */ ({
  '1.2.840.10045.3.1.7': ['P-256', 256], '1.3.132.0.34': ['P-384', 384],
  '1.3.132.0.35': ['P-521', 521], '1.3.132.0.10': ['secp256k1', 256],
  '1.3.36.3.3.2.8.1.1.7': ['brainpoolP256r1', 256], '1.3.36.3.3.2.8.1.1.11': ['brainpoolP384r1', 384],
  '1.3.36.3.3.2.8.1.1.13': ['brainpoolP512r1', 512],
}); // prettier-ignore

const EXTENSIONS = /** @type {Record<string, string>} */ ({
  '2.5.29.14': 'Subject Key Identifier', '2.5.29.15': 'Key Usage',
  '2.5.29.17': 'Subject Alternative Name', '2.5.29.18': 'Issuer Alternative Name',
  '2.5.29.19': 'Basic Constraints', '2.5.29.30': 'Name Constraints',
  '2.5.29.31': 'CRL Distribution Points', '2.5.29.32': 'Certificate Policies',
  '2.5.29.35': 'Authority Key Identifier', '2.5.29.37': 'Extended Key Usage',
  '1.3.6.1.5.5.7.1.1': 'Authority Information Access', '1.3.6.1.4.1.11129.2.4.2': 'Signed Certificate Timestamps',
  '1.3.6.1.5.5.7.1.24': 'TLS Feature',
}); // prettier-ignore

const KEY_USAGES = [
  'digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment', 'keyAgreement',
  'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly',
]; // prettier-ignore

const EXTENDED_USAGES = /** @type {Record<string, string>} */ ({
  '1.3.6.1.5.5.7.3.1': 'TLS server', '1.3.6.1.5.5.7.3.2': 'TLS client',
  '1.3.6.1.5.5.7.3.3': 'Code signing', '1.3.6.1.5.5.7.3.4': 'Email protection',
  '1.3.6.1.5.5.7.3.8': 'Time stamping', '1.3.6.1.5.5.7.3.9': 'OCSP signing',
  '2.5.29.37.0': 'Any', '1.3.6.1.4.1.311.10.3.12': 'Document signing',
}); // prettier-ignore

const ACCESS_METHODS = /** @type {Record<string, string>} */ ({
  '1.3.6.1.5.5.7.48.1': 'OCSP', '1.3.6.1.5.5.7.48.2': 'CA issuers',
}); // prettier-ignore

const POLICIES = /** @type {Record<string, string>} */ ({
  '2.23.140.1.2.1': 'Domain validated', '2.23.140.1.2.2': 'Organization validated',
  '2.23.140.1.2.3': 'Individual validated', '2.23.140.1.1': 'Extended validation',
  '2.5.29.32.0': 'Any policy',
}); // prettier-ignore

const GENERAL_NAMES = /** @type {Record<number, string>} */ ({
  0: 'Other', 1: 'Email', 2: 'DNS', 3: 'X400', 4: 'DirName', 5: 'EDI', 6: 'URI', 7: 'IP', 8: 'RID',
}); // prettier-ignore

/** Readable name of an OID, for the structure view. */
export function oidName(/** @type {string} */ value) {
  return (
    NAME_TYPES[value] ??
    SIGNATURES[value] ??
    KEY_TYPES[value] ??
    CURVES[value]?.[0] ??
    EXTENSIONS[value] ??
    EXTENDED_USAGES[value] ??
    ACCESS_METHODS[value] ??
    POLICIES[value] ??
    (value === '1.2.840.113549.1.9.14' ? 'Extension request' : null)
  );
}

// ------------------------------------------------------------------ input

/**
 * @param {string} data
 * @returns {Uint8Array}
 */
function base64(data) {
  const clean = data.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) {
    throw new DerError('Invalid base64', 0);
  }
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Splits the input into DER blocks: PEM blocks, or the whole text as base64 or hex.
 *
 * @param {string} input
 * @returns {{ blocks: { label: string, data: string }[], privateKeys: number, skipped: number }}
 */
export function pemBlocks(input) {
  const pem = /-----BEGIN ([A-Z0-9 ]{1,40})-----([\s\S]*?)-----END \1-----/g;
  /** @type {{ label: string, data: string }[]} */
  const blocks = [];
  let privateKeys = 0;
  let skipped = 0;
  let found = false;
  for (const m of input.matchAll(pem)) {
    found = true;
    const label = m[1];
    if (/PRIVATE KEY/.test(label)) privateKeys += 1;
    else if (!/^(?:X509 |TRUSTED )?CERTIFICATE$|CERTIFICATE REQUEST$/.test(label)) skipped += 1;
    else if (blocks.length < MAX_BLOCKS) {
      // Headers such as "Proc-Type:" are not part of the data.
      blocks.push({ label, data: m[2].replace(/^[\w-]+:.*$/gm, '') });
    } else skipped += 1;
  }
  if (!found) {
    const trimmed = input.trim();
    if (trimmed) blocks.push({ label: '', data: trimmed });
  }
  return { blocks, privateKeys, skipped };
}

/**
 * @param {string} data - Base64, or hex digits.
 * @returns {Uint8Array}
 */
function decodeBlock(data) {
  const compact = data.replace(/[\s:]+/g, '');
  if (/^[0-9a-f]+$/i.test(compact) && compact.length % 2 === 0 && /^30/i.test(compact)) {
    return Uint8Array.from(compact.match(/../g) ?? [], (pair) => parseInt(pair, 16));
  }
  return base64(data);
}

/**
 * Reads every certificate and request of a text (PEM, base64 DER or hex DER).
 *
 * @param {string} input
 * @returns {CertResult}
 */
export function parseCertificates(input) {
  const { blocks, privateKeys, skipped } = pemBlocks(input);
  /** @type {Certificate[]} */
  const certificates = [];
  /** @type {{ index: number, message: string }[]} */
  const errors = [];
  blocks.forEach((block, index) => {
    try {
      certificates.push(readCertificate(decodeBlock(block.data), block.label));
    } catch (error) {
      errors.push({ index, message: error instanceof Error ? error.message : String(error) });
    }
  });
  return { certificates, errors, privateKeys, skipped };
}

/**
 * Reads one DER certificate or certificate request.
 *
 * @param {Uint8Array} der
 * @param {string} [label] - PEM label, when known.
 * @returns {Certificate}
 */
export function readCertificate(der, label = '') {
  const root = parseDer(der);
  expect(root, TAG.SEQUENCE, 'a certificate');
  const info = expect(child(root, 0), TAG.SEQUENCE, 'the certificate content');
  const algorithm = expect(child(root, 1), TAG.SEQUENCE, 'a signature algorithm');
  expect(child(root, 2), TAG.BIT_STRING, 'a signature');
  const signatureOid = oid(expect(child(algorithm, 0), TAG.OID, 'an algorithm identifier'));
  // A request starts with its version INTEGER then the subject Name (a SEQUENCE of SETs);
  // a certificate has a serial INTEGER (or [0] version) then an AlgorithmIdentifier.
  const first = child(info, 0);
  const isRequest =
    /REQUEST/.test(label) ||
    (first.cls === 0 &&
      first.tag === TAG.INTEGER &&
      info.children?.[1]?.children?.[0]?.tag === TAG.SET);
  const base = isRequest ? readRequest(info) : readTbs(info);
  const weaknesses = [];
  const weak = WEAK_SIGNATURES[signatureOid];
  if (weak) weaknesses.push(weak);
  if (base.publicKey.algorithm === 'RSA' && (base.publicKey.bits ?? 0) < 2048) {
    weaknesses.push('rsa-small');
  }
  const keyId = extensionHex(base.extensions, '2.5.29.14');
  const authorityKeyId = extensionHex(base.extensions, '2.5.29.35');
  return {
    ...base,
    signatureOid,
    signatureAlgorithm: SIGNATURES[signatureOid] ?? signatureOid,
    weaknesses,
    keyId,
    authorityKeyId,
    selfSigned:
      !isRequest &&
      nameText(base.subject) === nameText(base.issuer) &&
      (!keyId || !authorityKeyId || keyId === authorityKeyId),
    der: encoding(root),
    root,
  };
}

/**
 * @param {DerNode} info - TBSCertificate.
 */
function readTbs(info) {
  const nodes = info.children ?? [];
  let i = 0;
  let version = 1;
  if (nodes[0]?.cls === 2 && nodes[0].tag === 0) {
    version = integer(expect(child(nodes[0], 0), TAG.INTEGER, 'a version')) + 1;
    i = 1;
  }
  const serial = integerHex(expect(nodes[i], TAG.INTEGER, 'a serial number'));
  expect(nodes[i + 1], TAG.SEQUENCE, 'a signature algorithm');
  const issuer = readName(expect(nodes[i + 2], TAG.SEQUENCE, 'an issuer name'));
  const validity = expect(nodes[i + 3], TAG.SEQUENCE, 'a validity period');
  const subject = readName(expect(nodes[i + 4], TAG.SEQUENCE, 'a subject name'));
  const publicKey = readPublicKey(expect(nodes[i + 5], TAG.SEQUENCE, 'a public key'));
  /** @type {Extension[]} */
  let extensions = [];
  for (const node of nodes.slice(i + 6)) {
    if (node.cls === 2 && node.tag === 3) {
      extensions = readExtensions(expect(child(node, 0), TAG.SEQUENCE, 'extensions'));
    }
  }
  return {
    kind: /** @type {const} */ ('certificate'),
    version,
    serial,
    issuer,
    subject,
    notBefore: time(child(validity, 0)),
    notAfter: time(child(validity, 1)),
    publicKey,
    extensions,
  };
}

/**
 * @param {DerNode} info - CertificationRequestInfo.
 */
function readRequest(info) {
  const version = integer(expect(child(info, 0), TAG.INTEGER, 'a version')) + 1;
  const subject = readName(expect(child(info, 1), TAG.SEQUENCE, 'a subject name'));
  const publicKey = readPublicKey(expect(child(info, 2), TAG.SEQUENCE, 'a public key'));
  /** @type {Extension[]} */
  let extensions = [];
  const attributes = info.children?.[3];
  if (attributes?.cls === 2 && attributes.tag === 0) {
    for (const attribute of attributes.children ?? []) {
      if (oid(child(attribute, 0)) !== '1.2.840.113549.1.9.14') continue;
      const values = child(attribute, 1);
      extensions = readExtensions(expect(child(values, 0), TAG.SEQUENCE, 'extensions'));
    }
  }
  return {
    kind: /** @type {const} */ ('request'),
    version,
    serial: '',
    issuer: [],
    subject,
    notBefore: null,
    notAfter: null,
    publicKey,
    extensions,
  };
}

/**
 * @param {DerNode} node - Name (SEQUENCE OF SET OF AttributeTypeAndValue).
 * @returns {NamePart[]}
 */
export function readName(node) {
  /** @type {NamePart[]} */
  const parts = [];
  for (const set of node.children ?? []) {
    for (const pair of set.children ?? []) {
      const type = oid(expect(child(pair, 0), TAG.OID, 'a name type'));
      parts.push({ oid: type, type: NAME_TYPES[type] ?? type, value: text(child(pair, 1)) });
    }
  }
  return parts;
}

/**
 * One-line form of a name: `CN=example.com, O=Example, C=LU`.
 *
 * @param {NamePart[]} name
 * @returns {string}
 */
export function nameText(name) {
  return [...name]
    .reverse()
    .map((part) => `${part.type}=${part.value}`)
    .join(', ');
}

/**
 * @param {DerNode} node - SubjectPublicKeyInfo.
 * @returns {PublicKey}
 */
function readPublicKey(node) {
  const algorithm = expect(child(node, 0), TAG.SEQUENCE, 'a key algorithm');
  const keyOid = oid(expect(child(algorithm, 0), TAG.OID, 'a key algorithm'));
  const name = KEY_TYPES[keyOid] ?? keyOid;
  const key = expect(child(node, 1), TAG.BIT_STRING, 'a public key');
  if (name === 'RSA' || name === 'RSASSA-PSS') {
    const inner = encapsulated(key);
    const modulus = inner?.children?.[0];
    if (modulus && modulus.tag === TAG.INTEGER) {
      let data = contents(modulus);
      while (data.length > 1 && data[0] === 0) data = data.subarray(1);
      const bits = data.length * 8 - Math.clz32(data[0]) + 24;
      return { algorithm: name, bits, curve: null };
    }
    return { algorithm: name, bits: null, curve: null };
  }
  if (name === 'EC') {
    const params = algorithm.children?.[1];
    const curveOid = params?.tag === TAG.OID ? oid(params) : '';
    const curve = CURVES[curveOid];
    return { algorithm: name, bits: curve?.[1] ?? null, curve: curve?.[0] ?? (curveOid || null) };
  }
  return { algorithm: name, bits: KEY_BITS[name] ?? null, curve: null };
}

/**
 * @param {DerNode} node - Extensions (SEQUENCE OF Extension).
 * @returns {Extension[]}
 */
function readExtensions(node) {
  return (node.children ?? []).map((ext) => {
    const id = oid(expect(child(ext, 0), TAG.OID, 'an extension identifier'));
    const flag = ext.children?.[1];
    const critical = flag?.tag === TAG.BOOLEAN ? contents(flag)[0] !== 0 : false;
    const value = expect(
      child(ext, flag?.tag === TAG.BOOLEAN ? 2 : 1),
      TAG.OCTET_STRING,
      'an extension value',
    );
    let entries;
    try {
      entries = readExtension(id, value);
    } catch {
      entries = null;
    }
    return {
      oid: id,
      name: EXTENSIONS[id] ?? id,
      critical,
      entries: entries ?? [{ label: null, value: hex(contents(value)) }],
    };
  });
}

/**
 * @param {string} id
 * @param {DerNode} value - The OCTET STRING of the extension.
 * @returns {ExtensionEntry[] | null}
 */
function readExtension(id, value) {
  const inner = encapsulated(value);
  if (!inner) return null;
  switch (id) {
    case '2.5.29.17':
    case '2.5.29.18':
      return (inner.children ?? []).map(generalName);
    case '2.5.29.15': {
      const data = contents(inner);
      const unused = data[0] ?? 0;
      /** @type {ExtensionEntry[]} */
      const set = [];
      KEY_USAGES.forEach((usage, bit) => {
        const byte = 1 + (bit >> 3);
        if (byte < data.length && (byte < data.length - 1 || 7 - (bit & 7) >= unused)) {
          if (data[byte] & (0x80 >> (bit & 7))) set.push({ label: null, value: usage });
        }
      });
      return set;
    }
    case '2.5.29.37':
      return (inner.children ?? []).map((node) => {
        const usage = oid(node);
        return {
          label: EXTENDED_USAGES[usage] ? null : 'OID',
          value: EXTENDED_USAGES[usage] ?? usage,
        };
      });
    case '2.5.29.19': {
      const nodes = inner.children ?? [];
      const ca = nodes[0]?.tag === TAG.BOOLEAN && contents(nodes[0])[0] !== 0;
      const path = nodes.find((node) => node.tag === TAG.INTEGER);
      /** @type {ExtensionEntry[]} */
      const out = [{ label: 'CA', value: ca ? 'true' : 'false' }];
      if (path) out.push({ label: 'pathLen', value: String(integer(path)) });
      return out;
    }
    case '2.5.29.14':
      return [{ label: null, value: hex(contents(inner)) }];
    case '2.5.29.35': {
      /** @type {ExtensionEntry[]} */
      const out = [];
      for (const node of inner.children ?? []) {
        if (node.cls === 2 && node.tag === 0)
          out.push({ label: 'keyid', value: hex(contents(node)) });
        if (node.cls === 2 && node.tag === 2)
          out.push({ label: 'serial', value: hex(contents(node)) });
      }
      return out;
    }
    case '2.5.29.31':
      return findNames(inner);
    case '1.3.6.1.5.5.7.1.1':
      return (inner.children ?? []).map((access) => {
        const method = oid(child(access, 0));
        return {
          label: ACCESS_METHODS[method] ?? method,
          value: generalName(child(access, 1)).value,
        };
      });
    case '2.5.29.32':
      return (inner.children ?? []).map((policy) => {
        const id = oid(child(policy, 0));
        return { label: POLICIES[id] ? id : null, value: POLICIES[id] ?? id };
      });
    default:
      return null;
  }
}

/**
 * @param {DerNode} node - A GeneralName.
 * @returns {ExtensionEntry}
 */
function generalName(node) {
  const label = node.cls === 2 ? (GENERAL_NAMES[node.tag] ?? `[${node.tag}]`) : 'Name';
  if (node.cls !== 2) return { label, value: hex(contents(node)) };
  const data = contents(node);
  switch (node.tag) {
    case 1:
    case 2:
    case 6:
      return { label, value: Array.from(data, (b) => String.fromCharCode(b)).join('') };
    case 7:
      return { label, value: ipText(data) };
    case 4: {
      const name = node.children?.[0];
      return { label, value: name ? nameText(readName(name)) : '' };
    }
    case 8:
      return { label, value: oid({ ...node, cls: 0, tag: TAG.OID }) };
    default:
      return { label, value: hex(data) };
  }
}

/**
 * GeneralNames found anywhere inside a value (CRL distribution points).
 *
 * @param {DerNode} node
 * @returns {ExtensionEntry[]}
 */
function findNames(node) {
  /** @type {ExtensionEntry[]} */
  const out = [];
  const walk = (/** @type {DerNode} */ current) => {
    if (current.cls === 2 && !current.constructed && [1, 2, 6, 7].includes(current.tag)) {
      out.push(generalName(current));
    }
    for (const next of current.children ?? []) walk(next);
  };
  walk(node);
  return out;
}

/**
 * @param {Uint8Array} data
 * @returns {string}
 */
function ipText(data) {
  if (data.length === 4) return Array.from(data).join('.');
  if (data.length === 16) {
    const groups = [];
    for (let i = 0; i < 16; i += 2) groups.push(((data[i] << 8) | data[i + 1]).toString(16));
    // The longest run of zero groups is written "::".
    let best = [-1, 0];
    for (let i = 0; i < 8;) {
      if (groups[i] !== '0') {
        i += 1;
        continue;
      }
      let j = i;
      while (j < 8 && groups[j] === '0') j += 1;
      if (j - i > best[1] && j - i > 1) best = [i, j - i];
      i = j;
    }
    if (best[0] < 0) return groups.join(':');
    const head = groups.slice(0, best[0]).join(':');
    const tail = groups.slice(best[0] + best[1]).join(':');
    return `${head}::${tail}`;
  }
  return hex(data);
}

/**
 * @param {Extension[]} extensions
 * @param {string} id
 * @returns {string | null}
 */
function extensionHex(extensions, id) {
  const ext = extensions.find((e) => e.oid === id);
  if (!ext) return null;
  const entry = id === '2.5.29.35' ? ext.entries.find((e) => e.label === 'keyid') : ext.entries[0];
  return entry?.value ?? null;
}

/**
 * Index of the certificate that issued `cert`, among `list`, or -1.
 *
 * @param {Certificate} cert
 * @param {Certificate[]} list
 * @returns {number}
 */
export function issuerIndex(cert, list) {
  if (cert.kind !== 'certificate' || cert.selfSigned) return -1;
  const issuer = nameText(cert.issuer);
  return list.findIndex(
    (other) =>
      other !== cert &&
      other.kind === 'certificate' &&
      (cert.authorityKeyId && other.keyId
        ? cert.authorityKeyId === other.keyId
        : nameText(other.subject) === issuer),
  );
}

/**
 * Validity of a certificate at a given time.
 *
 * @param {Certificate} cert
 * @param {Date} now
 * @returns {{ state: "valid"|"expiring"|"expired"|"future"|"none", days: number }}
 */
export function validity(cert, now) {
  if (!cert.notBefore || !cert.notAfter) return { state: 'none', days: 0 };
  const day = 86400000;
  if (now < cert.notBefore) {
    return { state: 'future', days: Math.ceil((cert.notBefore.getTime() - now.getTime()) / day) };
  }
  const left = Math.floor((cert.notAfter.getTime() - now.getTime()) / day);
  if (now > cert.notAfter) {
    return { state: 'expired', days: Math.floor((now.getTime() - cert.notAfter.getTime()) / day) };
  }
  return { state: left <= 30 ? 'expiring' : 'valid', days: left };
}

/**
 * PEM text of a certificate or request.
 *
 * @param {Certificate} cert
 * @returns {string}
 */
export function toPem(cert) {
  let binary = '';
  for (const b of cert.der) binary += String.fromCharCode(b);
  const body = (btoa(binary).match(/.{1,64}/g) ?? []).join('\n');
  const label = cert.kind === 'request' ? 'CERTIFICATE REQUEST' : 'CERTIFICATE';
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}
