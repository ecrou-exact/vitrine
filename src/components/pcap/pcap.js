// @ts-check
/**
 * Reads packet captures in the browser: pcap (microsecond and nanosecond, both byte orders)
 * and pcapng (section, interface, enhanced, simple and obsolete packet blocks). Decodes
 * Ethernet with VLAN tags, Linux cooked captures, loopback and raw IP; ARP, IPv4, IPv6,
 * ICMP, ICMPv6, TCP, UDP, DNS, HTTP/1 and TLS handshakes (server name and ALPN). Every field
 * keeps its byte range so the hex dump can show it. Nothing is sent anywhere.
 *
 * @module components/pcap/pcap
 */

/** Most packets read. */
export const MAX_PACKETS = 20000;

/**
 * @typedef {{ key: string, value: string, start: number, end: number }} Field
 *   `key` names the field (translated by the element); `value` is already written out.
 * @typedef {{ id: string, name: string, start: number, end: number, fields: Field[] }} Layer
 * @typedef {object} Summary
 * @property {string} src
 * @property {string} dst
 * @property {number} srcPort - -1 without ports.
 * @property {number} dstPort
 * @property {string} protocol - The highest layer decoded (`DNS`, `TLS`, `TCP`…).
 * @property {string} info
 * @property {string[]} names - Host names seen: DNS questions and answers, TLS server name, HTTP Host.
 * @property {{ name: string, type: string, data: string }[]} answers - DNS answers.
 * @property {string} transport - `TCP`, `UDP` or ``.
 * @typedef {object} Packet
 * @property {number} index - 1-based.
 * @property {number} time - Microseconds since the epoch.
 * @property {number} length - On the wire.
 * @property {Uint8Array} data - Bytes captured.
 * @property {number} linkType
 * @property {Summary} summary
 * @typedef {object} Capture
 * @property {"pcap" | "pcapng"} format
 * @property {number} linkType - Of the first interface.
 * @property {string[]} interfaces - Names of pcapng interfaces.
 * @property {Packet[]} packets
 * @property {boolean} capped
 * @property {boolean} truncated - The file ends in the middle of a packet.
 * @property {State} state - Initial TCP sequence numbers, to decode packets again.
 * @typedef {{ ok: true, capture: Capture } | { ok: false, error: "empty" | "format" | "truncated" }} ParseResult
 */

/** Link types read (LINKTYPE_*). */
export const LINK_TYPES = Object.freeze({ 0: 'Loopback', 1: 'Ethernet', 12: 'Raw IP', 14: 'Raw IP', 101: 'Raw IP', 113: 'Linux cooked', 228: 'Raw IPv4', 229: 'Raw IPv6', 276: 'Linux cooked v2' }); // prettier-ignore

const ETHER_TYPES = { 0x0800: 'IPv4', 0x0806: 'ARP', 0x86dd: 'IPv6', 0x8100: '802.1Q', 0x88a8: '802.1ad', 0x8847: 'MPLS', 0x888e: 'EAPOL', 0x88cc: 'LLDP' }; // prettier-ignore
const IP_PROTOCOLS = { 1: 'ICMP', 2: 'IGMP', 6: 'TCP', 17: 'UDP', 41: 'IPv6', 47: 'GRE', 50: 'ESP', 51: 'AH', 58: 'ICMPv6', 89: 'OSPF', 132: 'SCTP' }; // prettier-ignore
const DNS_TYPES = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 41: 'OPT', 43: 'DS', 46: 'RRSIG', 48: 'DNSKEY', 64: 'SVCB', 65: 'HTTPS', 255: 'ANY', 257: 'CAA' }; // prettier-ignore
const DNS_RCODES = ['No error', 'Format error', 'Server failure', 'No such name', 'Not implemented', 'Refused']; // prettier-ignore
const ICMP_TYPES = { 0: 'Echo reply', 3: 'Destination unreachable', 5: 'Redirect', 8: 'Echo request', 11: 'Time exceeded', 13: 'Timestamp', 14: 'Timestamp reply' }; // prettier-ignore
const ICMP6_TYPES = { 1: 'Destination unreachable', 2: 'Packet too big', 3: 'Time exceeded', 128: 'Echo request', 129: 'Echo reply', 133: 'Router solicitation', 134: 'Router advertisement', 135: 'Neighbor solicitation', 136: 'Neighbor advertisement', 143: 'MLDv2 report' }; // prettier-ignore
const TLS_HANDSHAKES = { 1: 'Client Hello', 2: 'Server Hello', 4: 'New Session Ticket', 8: 'Encrypted Extensions', 11: 'Certificate', 12: 'Server Key Exchange', 13: 'Certificate Request', 14: 'Server Hello Done', 15: 'Certificate Verify', 16: 'Client Key Exchange', 20: 'Finished' }; // prettier-ignore
const TLS_CONTENT = { 20: 'Change Cipher Spec', 21: 'Alert', 22: 'Handshake', 23: 'Application Data', 24: 'Heartbeat' }; // prettier-ignore
const TLS_VERSIONS = { 0x0300: 'SSL 3.0', 0x0301: 'TLS 1.0', 0x0302: 'TLS 1.1', 0x0303: 'TLS 1.2', 0x0304: 'TLS 1.3' }; // prettier-ignore
/** Well-known ports, for the protocol column when nothing else is decoded. */
const PORTS = { 20: 'FTP-DATA', 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 67: 'DHCP', 68: 'DHCP', 69: 'TFTP', 110: 'POP3', 123: 'NTP', 137: 'NetBIOS', 138: 'NetBIOS', 139: 'NetBIOS', 143: 'IMAP', 161: 'SNMP', 162: 'SNMP', 389: 'LDAP', 445: 'SMB', 465: 'SMTPS', 514: 'Syslog', 587: 'SMTP', 636: 'LDAPS', 993: 'IMAPS', 995: 'POP3S', 1900: 'SSDP', 3306: 'MySQL', 3389: 'RDP', 5060: 'SIP', 5432: 'PostgreSQL', 6379: 'Redis' }; // prettier-ignore
const HTTP_START =
  /^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|CONNECT|TRACE) \S+ HTTP\/1\.[01]\r?\n|^HTTP\/1\.[01] \d{3}/;

/**
 * @param {Record<number, string>} map
 * @param {number} value
 * @returns {string}
 */
const named = (map, value) => map[value] ?? String(value);

/**
 * Reads a capture file.
 *
 * @param {Uint8Array} bytes
 * @returns {ParseResult}
 */
export function parseCapture(bytes) {
  if (!bytes.length) return { ok: false, error: 'empty' };
  if (bytes.length < 24) return { ok: false, error: 'truncated' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, false);
  if (magic === 0x0a0d0d0a) return readPcapng(bytes, view);
  const le = magic === 0xd4c3b2a1 || magic === 0x4d3cb2a1;
  const be = magic === 0xa1b2c3d4 || magic === 0xa1b23c4d;
  if (!le && !be) return { ok: false, error: 'format' };
  const nano = magic === 0x4d3cb2a1 || magic === 0xa1b23c4d;
  const linkType = view.getUint32(20, le) & 0x0fffffff;
  /** @type {Packet[]} */
  const packets = [];
  let at = 24;
  let truncated = false;
  let capped = false;
  const state = newState();
  while (at + 16 <= bytes.length) {
    if (packets.length >= MAX_PACKETS) {
      capped = true;
      break;
    }
    const sec = view.getUint32(at, le);
    const frac = view.getUint32(at + 4, le);
    const captured = view.getUint32(at + 8, le);
    const length = view.getUint32(at + 12, le);
    if (at + 16 + captured > bytes.length) {
      truncated = true;
      break;
    }
    const data = bytes.subarray(at + 16, at + 16 + captured);
    const time = sec * 1e6 + (nano ? frac / 1000 : frac);
    packets.push(makePacket(packets.length + 1, time, length, data, linkType, state));
    at += 16 + captured;
  }
  if (at < bytes.length && !capped) truncated = true;
  return { ok: true, capture: { format: 'pcap', linkType, interfaces: [], packets, capped, truncated, state } }; // prettier-ignore
}

/**
 * @param {Uint8Array} bytes
 * @param {DataView} view
 * @returns {ParseResult}
 */
function readPcapng(bytes, view) {
  /** @type {{ linkType: number, scale: number, name: string, snap: number }[]} */
  let interfaces = [];
  /** @type {string[]} */
  const names = [];
  /** @type {Packet[]} */
  const packets = [];
  let le = true;
  let at = 0;
  let truncated = false;
  let capped = false;
  let firstLink = -1;
  const state = newState();
  while (at + 12 <= bytes.length) {
    const type = view.getUint32(at, le);
    if (type === 0x0a0d0d0a) {
      const order = view.getUint32(at + 8, true);
      if (order === 0x1a2b3c4d) le = true;
      else if (order === 0x4d3c2b1a) le = false;
      else return { ok: false, error: 'format' };
      interfaces = [];
    }
    const size = view.getUint32(at + 4, le);
    if (size < 12 || size % 4 || at + size > bytes.length) {
      truncated = true;
      break;
    }
    const body = at + 8;
    const end = at + size - 4;
    if (type === 1 && end - body >= 8) {
      const linkType = view.getUint16(body, le);
      const snap = view.getUint32(body + 4, le);
      let scale = 1; // microseconds per unit
      let name = '';
      for (const option of options(view, body + 8, end, le)) {
        if (option.code === 9 && option.length >= 1) {
          const r = bytes[option.start];
          const units = r & 0x80 ? 2 ** (r & 0x7f) : 10 ** r;
          scale = 1e6 / units;
        } else if (option.code === 2) name = text(bytes.subarray(option.start, option.start + option.length)); // prettier-ignore
      }
      interfaces.push({ linkType, scale, name, snap });
      names.push(name);
      if (firstLink < 0) firstLink = linkType;
    } else if (type === 6 || type === 2 || type === 3) {
      if (packets.length >= MAX_PACKETS) {
        capped = true;
        break;
      }
      let iface = 0;
      let high = 0;
      let low = 0;
      /** @type {number} */
      let captured;
      /** @type {number} */
      let length;
      /** @type {number} */
      let dataAt;
      if (type === 6) {
        iface = view.getUint32(body, le);
        high = view.getUint32(body + 4, le);
        low = view.getUint32(body + 8, le);
        captured = view.getUint32(body + 12, le);
        length = view.getUint32(body + 16, le);
        dataAt = body + 20;
      } else if (type === 2) {
        iface = view.getUint16(body, le);
        high = view.getUint32(body + 4, le);
        low = view.getUint32(body + 8, le);
        captured = view.getUint32(body + 12, le);
        length = view.getUint32(body + 16, le);
        dataAt = body + 20;
      } else {
        length = view.getUint32(body, le);
        dataAt = body + 4;
        captured = Math.min(length, end - dataAt, interfaces[0]?.snap || Infinity);
      }
      const info = interfaces[iface];
      if (info && dataAt + captured <= end) {
        const time = type === 3 ? 0 : (high * 2 ** 32 + low) * info.scale;
        packets.push(makePacket(packets.length + 1, time, length, bytes.subarray(dataAt, dataAt + captured), info.linkType, state)); // prettier-ignore
      }
    }
    at += size;
  }
  if (at < bytes.length && !capped) truncated = true;
  if (firstLink < 0 && !packets.length) return { ok: false, error: truncated ? 'truncated' : 'format' }; // prettier-ignore
  return { ok: true, capture: { format: 'pcapng', linkType: firstLink, interfaces: names, packets, capped, truncated, state } }; // prettier-ignore
}

/**
 * @param {DataView} view
 * @param {number} from
 * @param {number} to
 * @param {boolean} le
 * @returns {{ code: number, start: number, length: number }[]}
 */
function options(view, from, to, le) {
  const out = [];
  let at = from;
  while (at + 4 <= to) {
    const code = view.getUint16(at, le);
    const length = view.getUint16(at + 2, le);
    if (code === 0 || at + 4 + length > to) break;
    out.push({ code, start: at + 4, length });
    at += 4 + Math.ceil(length / 4) * 4;
  }
  return out;
}

/** Control, zero-width and direction characters, shown escaped. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

/**
 * Text from packet bytes: UTF-8, with control characters written as `\xNN`.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function text(bytes) {
  const s = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return s.replace(CONTROL, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

/**
 * Text on one line: tabs and line breaks escaped too (names, server names).
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
const oneLine = (bytes) =>
  text(bytes).replace(/[\t\n]/g, (c) => `\\x0${c.charCodeAt(0).toString(16)}`);

/**
 * One character per byte, nothing replaced: for finding line ends before reading text.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
const latin1 = (bytes) => String.fromCharCode(...bytes);

/**
 * @typedef {{ streams: Map<string, number> }} State - Initial TCP sequence numbers, per direction.
 * @returns {State}
 */
const newState = () => ({ streams: new Map() });

/**
 * @param {number} index
 * @param {number} time
 * @param {number} length
 * @param {Uint8Array} data
 * @param {number} linkType
 * @param {State} state
 * @returns {Packet}
 */
function makePacket(index, time, length, data, linkType, state) {
  /** @type {Packet} */
  const packet = { index, time, length, data, linkType, summary: emptySummary() };
  try {
    packet.summary = decode(packet, state).summary;
  } catch {
    // A packet that cannot be read keeps an empty summary.
  }
  return packet;
}

/** @returns {Summary} */
const emptySummary = () => ({ src: '', dst: '', srcPort: -1, dstPort: -1, protocol: '', info: '', names: [], answers: [], transport: '' }); // prettier-ignore

/**
 * @param {Uint8Array} b
 * @param {number} at
 */
const mac = (b, at) => [...b.subarray(at, at + 6)].map((x) => x.toString(16).padStart(2, '0')).join(':'); // prettier-ignore

/**
 * @param {Uint8Array} b
 * @param {number} at
 */
export const ipv4 = (b, at) => `${b[at]}.${b[at + 1]}.${b[at + 2]}.${b[at + 3]}`;

/**
 * An IPv6 address in its short form (RFC 5952).
 *
 * @param {Uint8Array} b
 * @param {number} at
 * @returns {string}
 */
export function ipv6(b, at) {
  const groups = [];
  for (let i = 0; i < 8; i += 1)
    groups.push(((b[at + i * 2] << 8) | b[at + i * 2 + 1]).toString(16));
  let best = -1;
  let bestLength = 1;
  for (let i = 0; i < 8;) {
    if (groups[i] !== '0') {
      i += 1;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === '0') j += 1;
    if (j - i > bestLength) {
      best = i;
      bestLength = j - i;
    }
    i = j;
  }
  if (best < 0) return groups.join(':');
  return `${groups.slice(0, best).join(':')}::${groups.slice(best + bestLength).join(':')}`;
}

const hex = (/** @type {number} */ n, /** @type {number} */ w) => `0x${n.toString(16).padStart(w, '0')}`; // prettier-ignore

/**
 * Decodes the layers of a packet.
 *
 * @param {Packet} packet
 * @param {State} [state] - Initial TCP sequence numbers, for relative ones.
 * @returns {{ layers: Layer[], summary: Summary }}
 */
export function decode(packet, state = newState()) {
  const b = packet.data;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  /** @type {Layer[]} */
  const layers = [];
  const summary = emptySummary();
  /** @type {Layer | null} */
  let layer = null;
  const open = (
    /** @type {string} */ id,
    /** @type {string} */ name,
    /** @type {number} */ start,
    /** @type {number} */ end,
  ) => {
    layer = { id, name, start, end: Math.min(end, b.length), fields: [] };
    layers.push(layer);
    summary.protocol = name;
    return layer;
  };
  const field = (/** @type {string} */ key, /** @type {string | number} */ value, /** @type {number} */ start, /** @type {number} */ length) =>
    /** @type {Layer} */ (layer).fields.push({ key, value: String(value), start, end: Math.min(b.length, start + length) }); // prettier-ignore
  const need = (/** @type {number} */ end) => {
    if (end > b.length) throw new RangeError('short');
  };

  // Link layer: the EtherType (or IP version) of what follows.
  let at = 0;
  /** @type {number} */
  let ether;
  const link = packet.linkType;
  if (link === 1) {
    need(14);
    open('eth', 'Ethernet', 0, 14);
    field('ethDst', mac(b, 0), 0, 6);
    field('ethSrc', mac(b, 6), 6, 6);
    ether = v.getUint16(12);
    at = 14;
    while (ether === 0x8100 || ether === 0x88a8) {
      need(at + 4);
      open('vlan', '802.1Q', at - 2, at + 4);
      field('vlanId', v.getUint16(at) & 0x0fff, at, 2);
      ether = v.getUint16(at + 2);
      at += 4;
    }
    field('etherType', `${named(ETHER_TYPES, ether)} (${hex(ether, 4)})`, at - 2, 2);
    summary.src = mac(b, 6);
    summary.dst = mac(b, 0);
  } else if (link === 113) {
    need(16);
    open('sll', 'Linux cooked', 0, 16);
    const alen = v.getUint16(4);
    if (alen === 6) field('ethSrc', mac(b, 6), 6, 6);
    ether = v.getUint16(14);
    field('etherType', `${named(ETHER_TYPES, ether)} (${hex(ether, 4)})`, 14, 2);
    at = 16;
  } else if (link === 276) {
    need(20);
    open('sll', 'Linux cooked v2', 0, 20);
    ether = v.getUint16(0);
    field('etherType', `${named(ETHER_TYPES, ether)} (${hex(ether, 4)})`, 0, 2);
    field('ifIndex', v.getUint32(4), 4, 4);
    if (b[11] === 6) field('ethSrc', mac(b, 12), 12, 6);
    at = 20;
  } else if (link === 0) {
    need(4);
    open('null', 'Loopback', 0, 4);
    const family = v.getUint32(0, b[0] !== 0) || v.getUint32(0, false);
    ether = family === 2 ? 0x0800 : [10, 24, 28, 30].includes(family) ? 0x86dd : -1;
    field('family', family, 0, 4);
    at = 4;
  } else if ([12, 14, 101, 228, 229].includes(link)) {
    need(1);
    ether = b[0] >> 4 === 6 ? 0x86dd : 0x0800;
  } else {
    summary.protocol = LINK_TYPES[/** @type {keyof typeof LINK_TYPES} */ (link)] ?? `Link ${link}`;
    return { layers, summary };
  }

  if (ether === 0x0806) {
    need(at + 28);
    open('arp', 'ARP', at, at + 28);
    const op = v.getUint16(at + 6);
    field('arpOp', op === 1 ? 'request' : op === 2 ? 'reply' : op, at + 6, 2);
    field('arpSenderMac', mac(b, at + 8), at + 8, 6);
    field('arpSenderIp', ipv4(b, at + 14), at + 14, 4);
    field('arpTargetMac', mac(b, at + 18), at + 18, 6);
    field('arpTargetIp', ipv4(b, at + 24), at + 24, 4);
    summary.info = op === 1 ? `Who has ${ipv4(b, at + 24)}? Tell ${ipv4(b, at + 14)}` : `${ipv4(b, at + 14)} is at ${mac(b, at + 8)}`; // prettier-ignore
    return { layers, summary };
  }

  /** @type {number} */
  let proto;
  let end = b.length;
  if (ether === 0x0800) {
    need(at + 20);
    const ihl = (b[at] & 0x0f) * 4;
    const total = v.getUint16(at + 2);
    need(at + ihl);
    open('ip', 'IPv4', at, at + ihl);
    field('ipVersion', 4, at, 1);
    field('ipHeaderLength', `${ihl} bytes`, at, 1);
    field('ipTotalLength', total, at + 2, 2);
    field('ipId', hex(v.getUint16(at + 4), 4), at + 4, 2);
    const flags = v.getUint16(at + 6);
    const fragment = (flags & 0x1fff) * 8;
    field('ipFlags', [flags & 0x4000 ? 'DF' : '', flags & 0x2000 ? 'MF' : ''].filter(Boolean).join(', ') || '—', at + 6, 2); // prettier-ignore
    if (fragment) field('ipFragment', fragment, at + 6, 2);
    field('ipTtl', b[at + 8], at + 8, 1);
    proto = b[at + 9];
    field('ipProtocol', `${named(IP_PROTOCOLS, proto)} (${proto})`, at + 9, 1);
    field('ipChecksum', hex(v.getUint16(at + 10), 4), at + 10, 2);
    summary.src = ipv4(b, at + 12);
    summary.dst = ipv4(b, at + 16);
    field('ipSrc', summary.src, at + 12, 4);
    field('ipDst', summary.dst, at + 16, 4);
    if (total >= ihl) end = Math.min(b.length, at + total);
    at += ihl;
    if (fragment) {
      summary.info = `Fragment at ${fragment}`;
      return { layers, summary };
    }
  } else if (ether === 0x86dd) {
    need(at + 40);
    open('ip', 'IPv6', at, at + 40);
    field('ipVersion', 6, at, 1);
    field('ipFlow', hex(v.getUint32(at) & 0xfffff, 5), at, 4);
    const payload = v.getUint16(at + 4);
    field('ipPayloadLength', payload, at + 4, 2);
    proto = b[at + 6];
    field('ipNextHeader', `${named(IP_PROTOCOLS, proto)} (${proto})`, at + 6, 1);
    field('ipHopLimit', b[at + 7], at + 7, 1);
    summary.src = ipv6(b, at + 8);
    summary.dst = ipv6(b, at + 24);
    field('ipSrc', summary.src, at + 8, 16);
    field('ipDst', summary.dst, at + 24, 16);
    end = Math.min(b.length, at + 40 + payload);
    at += 40;
    // Extension headers: hop-by-hop, routing, fragment, destination options.
    while ([0, 43, 44, 60].includes(proto) && at + 8 <= end) {
      const next = b[at];
      const size = proto === 44 ? 8 : (b[at + 1] + 1) * 8;
      if (proto === 44 && v.getUint16(at + 2) & 0xfff8) {
        summary.info = 'Fragment';
        return { layers, summary };
      }
      proto = next;
      at += size;
    }
  } else {
    summary.protocol = named(ETHER_TYPES, ether);
    return { layers, summary };
  }
  summary.protocol = named(IP_PROTOCOLS, proto);

  if (proto === 1 || proto === 58) {
    need(at + 4);
    const types = proto === 1 ? ICMP_TYPES : ICMP6_TYPES;
    open('icmp', proto === 1 ? 'ICMP' : 'ICMPv6', at, end);
    const type = b[at];
    field('icmpType', `${named(types, type)} (${type})`, at, 1);
    field('icmpCode', b[at + 1], at + 1, 1);
    let info = named(types, type);
    if (
      (proto === 1 && (type === 0 || type === 8)) ||
      (proto === 58 && (type === 128 || type === 129))
    ) {
      need(at + 8);
      field('icmpId', v.getUint16(at + 4), at + 4, 2);
      field('icmpSeq', v.getUint16(at + 6), at + 6, 2);
      info += ` id=${v.getUint16(at + 4)} seq=${v.getUint16(at + 6)}`;
    }
    summary.info = info;
    return { layers, summary };
  }

  if (proto === 6) {
    need(at + 20);
    const offset = (b[at + 12] >> 4) * 4;
    open('tcp', 'TCP', at, at + offset);
    const sp = v.getUint16(at);
    const dp = v.getUint16(at + 2);
    summary.srcPort = sp;
    summary.dstPort = dp;
    summary.transport = 'TCP';
    const seq = v.getUint32(at + 4);
    const ack = v.getUint32(at + 8);
    const flagBits = v.getUint16(at + 12) & 0x01ff;
    const flags = ['FIN', 'SYN', 'RST', 'PSH', 'ACK', 'URG', 'ECE', 'CWR', 'AE'].filter((_, i) => flagBits & (1 << i)); // prettier-ignore
    const key = `${summary.src}:${sp}>${summary.dst}:${dp}`;
    const back = `${summary.dst}:${dp}>${summary.src}:${sp}`;
    if (!state.streams.has(key)) state.streams.set(key, flags.includes('SYN') ? seq : seq - 1);
    const base = /** @type {number} */ (state.streams.get(key));
    const relSeq = (seq - base) >>> 0;
    const relAck = state.streams.has(back) ? (ack - /** @type {number} */ (state.streams.get(back))) >>> 0 : ack; // prettier-ignore
    field('srcPort', sp, at, 2);
    field('dstPort', dp, at + 2, 2);
    field('tcpSeq', `${relSeq} (${seq})`, at + 4, 4);
    if (flags.includes('ACK')) field('tcpAck', `${relAck} (${ack})`, at + 8, 4);
    field('tcpHeaderLength', `${offset} bytes`, at + 12, 1);
    field('tcpFlags', flags.join(', ') || '—', at + 12, 2);
    const window = v.getUint16(at + 14);
    field('tcpWindow', window, at + 14, 2);
    field('tcpChecksum', hex(v.getUint16(at + 16), 4), at + 16, 2);
    const payloadAt = at + offset;
    const payload = b.subarray(Math.min(payloadAt, end), end);
    summary.info = `${sp} → ${dp} [${flags.join(', ')}] Seq=${relSeq}${flags.includes('ACK') ? ` Ack=${relAck}` : ''} Win=${window} Len=${payload.length}`; // prettier-ignore
    summary.protocol = 'TCP';
    if (payload.length) application(payload, payloadAt, sp, dp, 'TCP');
    return { layers, summary };
  }

  if (proto === 17) {
    need(at + 8);
    open('udp', 'UDP', at, at + 8);
    const sp = v.getUint16(at);
    const dp = v.getUint16(at + 2);
    summary.srcPort = sp;
    summary.dstPort = dp;
    summary.transport = 'UDP';
    field('srcPort', sp, at, 2);
    field('dstPort', dp, at + 2, 2);
    field('udpLength', v.getUint16(at + 4), at + 4, 2);
    field('udpChecksum', hex(v.getUint16(at + 6), 4), at + 6, 2);
    const payload = b.subarray(Math.min(at + 8, end), end);
    summary.info = `${sp} → ${dp} Len=${payload.length}`;
    summary.protocol = 'UDP';
    if (payload.length) application(payload, at + 8, sp, dp, 'UDP');
    return { layers, summary };
  }
  return { layers, summary };

  /**
   * @param {Uint8Array} payload
   * @param {number} start - Offset of the payload in the packet.
   * @param {number} sp
   * @param {number} dp
   * @param {"TCP" | "UDP"} transport
   */
  function application(payload, start, sp, dp, transport) {
    const ports = [sp, dp];
    if (ports.some((p) => p === 53 || p === 5353 || p === 5355)) {
      const offset = transport === 'TCP' ? 2 : 0;
      if (payload.length >= offset + 12) dns(start + offset, start + payload.length, sp === 5353 || dp === 5353 ? 'mDNS' : sp === 5355 || dp === 5355 ? 'LLMNR' : 'DNS'); // prettier-ignore
      return;
    }
    if (transport === 'TCP' && HTTP_START.test(latin1(payload.subarray(0, 120)))) {
      http(payload, start);
      return;
    }
    if (
      transport === 'TCP' &&
      payload.length >= 5 &&
      TLS_CONTENT[/** @type {keyof typeof TLS_CONTENT} */ (payload[0])] &&
      payload[1] === 3 &&
      payload[2] <= 4
    ) {
      tls(start, start + payload.length);
      return;
    }
    const port = Math.min(sp, dp) in PORTS ? Math.min(sp, dp) : dp in PORTS ? dp : sp in PORTS ? sp : -1; // prettier-ignore
    if (port >= 0) summary.protocol = PORTS[/** @type {keyof typeof PORTS} */ (port)];
  }

  /**
   * @param {number} start
   * @param {number} stop
   * @param {string} name
   */
  function dns(start, stop, name) {
    open('dns', name, start, stop);
    const id = v.getUint16(start);
    const flags = v.getUint16(start + 2);
    const response = Boolean(flags & 0x8000);
    const rcode = flags & 0x0f;
    const qd = v.getUint16(start + 4);
    const an = v.getUint16(start + 6);
    field('dnsId', hex(id, 4), start, 2);
    field('dnsKind', response ? 'response' : 'query', start + 2, 2);
    if (response) field('dnsRcode', DNS_RCODES[rcode] ?? rcode, start + 2, 2);
    field('dnsQuestions', qd, start + 4, 2);
    field('dnsAnswers', an, start + 6, 2);
    let at = start + 12;
    /** @type {string[]} */
    const asked = [];
    for (let q = 0; q < Math.min(qd, 20) && at < stop; q += 1) {
      const n = dnsName(b, at, start, stop);
      if (!n) break;
      need(n.end + 4);
      const type = v.getUint16(n.end);
      field('dnsQuestion', `${n.name} ${named(DNS_TYPES, type)}`, at, n.end + 4 - at);
      asked.push(`${named(DNS_TYPES, type)} ${n.name}`);
      summary.names.push(n.name);
      at = n.end + 4;
    }
    /** @type {string[]} */
    const shown = [];
    for (let a = 0; a < Math.min(an, 50) && at < stop; a += 1) {
      const n = dnsName(b, at, start, stop);
      if (!n || n.end + 10 > stop) break;
      const type = v.getUint16(n.end);
      const ttl = v.getUint32(n.end + 4);
      const size = v.getUint16(n.end + 8);
      const dataAt = n.end + 10;
      if (dataAt + size > stop) break;
      let data = '';
      if (type === 1 && size === 4) data = ipv4(b, dataAt);
      else if (type === 28 && size === 16) data = ipv6(b, dataAt);
      else if (type === 5 || type === 2 || type === 12) data = dnsName(b, dataAt, start, stop)?.name ?? ''; // prettier-ignore
      else if (type === 15) data = `${v.getUint16(dataAt)} ${dnsName(b, dataAt + 2, start, stop)?.name ?? ''}`; // prettier-ignore
      else if (type === 16) data = text(b.subarray(dataAt + 1, dataAt + 1 + Math.min(b[dataAt], size - 1))); // prettier-ignore
      const typeName = named(DNS_TYPES, type);
      field('dnsAnswer', `${n.name} ${typeName} ${data || `(${size} bytes)`} TTL ${ttl}`, at, dataAt + size - at); // prettier-ignore
      summary.answers.push({ name: n.name, type: typeName, data });
      if (data) shown.push(`${typeName} ${data}`);
      at = dataAt + size;
    }
    summary.info = response
      ? `Response ${hex(id, 4)} ${asked.join(', ')}${rcode ? ` ${DNS_RCODES[rcode] ?? `rcode ${rcode}`}` : ''}${shown.length ? ` → ${shown.slice(0, 4).join(', ')}${shown.length > 4 ? ' …' : ''}` : ''}` // prettier-ignore
      : `Query ${hex(id, 4)} ${asked.join(', ')}`;
  }

  /**
   * @param {Uint8Array} payload
   * @param {number} start
   */
  function http(payload, start) {
    const head = latin1(payload.subarray(0, Math.min(payload.length, 8192)));
    const stop = head.search(/\r?\n\r?\n/);
    const lines = (stop < 0 ? head : head.slice(0, stop)).split(/\r?\n/);
    open('http', 'HTTP', start, start + (stop < 0 ? payload.length : stop + 4));
    let offset = start;
    // Lines are cut on the raw bytes (one character per byte), then read as UTF-8.
    const clean = (/** @type {string} */ s) => text(Uint8Array.from(s, (c) => c.charCodeAt(0)));
    for (const [n, line] of lines.slice(0, 60).entries()) {
      field(n === 0 ? 'httpLine' : 'httpHeader', clean(line), offset, line.length);
      const colon = line.indexOf(':');
      if (n > 0 && colon > 0 && line.slice(0, colon).toLowerCase() === 'host') summary.names.push(clean(line.slice(colon + 1)).trim().replace(/:\d+$/, '').toLowerCase()); // prettier-ignore
      offset += line.length + (head[offset - start + line.length] === '\r' ? 2 : 1);
    }
    summary.info = clean(lines[0]);
  }

  /**
   * @param {number} start
   * @param {number} stop
   */
  function tls(start, stop) {
    open('tls', 'TLS', start, stop);
    /** @type {string[]} */
    const infos = [];
    let at = start;
    while (at + 5 <= stop && infos.length < 8) {
      const type = b[at];
      const version = v.getUint16(at + 1);
      const length = v.getUint16(at + 3);
      const recordEnd = Math.min(stop, at + 5 + length);
      if (!TLS_CONTENT[/** @type {keyof typeof TLS_CONTENT} */ (type)]) break;
      field('tlsRecord', `${named(TLS_CONTENT, type)}, ${named(TLS_VERSIONS, version)}, ${length} bytes`, at, 5); // prettier-ignore
      if (type === 22 && at + 9 <= recordEnd) {
        const hs = b[at + 5];
        const name = TLS_HANDSHAKES[/** @type {keyof typeof TLS_HANDSHAKES} */ (hs)];
        if (name) {
          infos.push(name);
          field('tlsHandshake', name, at + 5, 4);
          if (hs === 1 || hs === 2) hello(at + 9, recordEnd, hs === 1, infos);
        } else infos.push('Encrypted Handshake Message');
      } else if (type === 21)
        infos.push(length === 2 && at + 7 <= recordEnd ? `Alert (${b[at + 5] === 2 ? 'fatal' : 'warning'}, ${b[at + 6]})` : 'Encrypted Alert'); // prettier-ignore
      else infos.push(named(TLS_CONTENT, type));
      at += 5 + length;
    }
    summary.protocol = 'TLS';
    summary.info = [...new Set(infos)].join(', ');
  }

  /**
   * Client and Server Hello: version, server name, ALPN, chosen version.
   *
   * @param {number} at - After the handshake header.
   * @param {number} stop
   * @param {boolean} client
   * @param {string[]} infos
   */
  function hello(at, stop, client, infos) {
    if (at + 38 > stop) return;
    field('tlsVersion', named(TLS_VERSIONS, v.getUint16(at)), at, 2);
    let p = at + 34;
    p += 1 + b[p]; // session id
    if (client) {
      if (p + 2 > stop) return;
      const suites = v.getUint16(p);
      field('tlsCipherSuites', suites / 2, p, 2 + suites);
      p += 2 + suites;
      if (p + 1 > stop) return;
      p += 1 + b[p]; // compression methods
    } else {
      if (p + 3 > stop) return;
      field('tlsCipherSuite', hex(v.getUint16(p), 4), p, 2);
      p += 3;
    }
    if (p + 2 > stop) return;
    const extEnd = Math.min(stop, p + 2 + v.getUint16(p));
    p += 2;
    while (p + 4 <= extEnd) {
      const type = v.getUint16(p);
      const size = v.getUint16(p + 2);
      const body = p + 4;
      if (body + size > extEnd) break;
      if (type === 0 && client && size >= 5) {
        const length = v.getUint16(body + 3);
        const name = oneLine(b.subarray(body + 5, Math.min(body + 5 + length, body + size))).toLowerCase(); // prettier-ignore
        field('tlsSni', name, body + 5, length);
        summary.names.push(name);
        infos[infos.length - 1] += ` (${name})`;
      } else if (type === 16 && size >= 2) {
        /** @type {string[]} */
        const protocols = [];
        let q = body + 2;
        while (q < body + size) {
          const l = b[q];
          protocols.push(text(b.subarray(q + 1, q + 1 + l)));
          q += 1 + l;
        }
        field('tlsAlpn', protocols.join(', '), body, size);
      } else if (type === 43) {
        const versions = client
          ? Array.from({ length: Math.floor(b[body] / 2) }, (_, i) => named(TLS_VERSIONS, v.getUint16(body + 1 + i * 2))).filter((x) => !/^\d+$/.test(x)) // prettier-ignore
          : [named(TLS_VERSIONS, v.getUint16(body))];
        field('tlsSupportedVersions', versions.join(', '), body, size);
      }
      p = body + size;
    }
  }
}

/**
 * Reads a DNS name with compression pointers (at most 20 jumps).
 *
 * @param {Uint8Array} b
 * @param {number} at
 * @param {number} base - Start of the DNS message.
 * @param {number} stop
 * @returns {{ name: string, end: number } | null} `end` is after the name where it was written.
 */
export function dnsName(b, at, base, stop) {
  /** @type {string[]} */
  const labels = [];
  let p = at;
  let end = -1;
  for (let jumps = 0; jumps < 20 && p < stop;) {
    const length = b[p];
    if (length === 0) {
      if (end < 0) end = p + 1;
      return { name: labels.join('.').toLowerCase() || '.', end };
    }
    if ((length & 0xc0) === 0xc0) {
      if (p + 1 >= stop) return null;
      if (end < 0) end = p + 2;
      p = base + (((length & 0x3f) << 8) | b[p + 1]);
      jumps += 1;
      continue;
    }
    if (length > 63 || p + 1 + length > stop) return null;
    labels.push(oneLine(b.subarray(p + 1, p + 1 + length)));
    p += 1 + length;
    if (labels.length > 127) return null;
  }
  return null;
}

/**
 * @typedef {object} Conversation
 * @property {string} a - Address (and port) of one side.
 * @property {string} b
 * @property {string} transport
 * @property {string} protocol - Most common protocol of its packets.
 * @property {number} packets
 * @property {number} bytes
 * @property {number} first - Microseconds.
 * @property {number} last
 */

/**
 * Groups packets by pair of endpoints.
 *
 * @param {Packet[]} packets
 * @returns {Conversation[]} Most packets first.
 */
export function conversations(packets) {
  /** @type {Map<string, Conversation & { protocols: Map<string, number> }>} */
  const map = new Map();
  for (const p of packets) {
    const s = p.summary;
    if (!s.src) continue;
    const end = (/** @type {string} */ ip, /** @type {number} */ port) => (port >= 0 ? (ip.includes(':') ? `[${ip}]:${port}` : `${ip}:${port}`) : ip); // prettier-ignore
    const x = end(s.src, s.srcPort);
    const y = end(s.dst, s.dstPort);
    const [a, b] = x < y ? [x, y] : [y, x];
    const key = `${s.transport}|${a}|${b}`;
    let c = map.get(key);
    if (!c) {
      c = { a, b, transport: s.transport || s.protocol, protocol: '', packets: 0, bytes: 0, first: p.time, last: p.time, protocols: new Map() }; // prettier-ignore
      map.set(key, c);
    }
    c.packets += 1;
    c.bytes += p.length;
    c.first = Math.min(c.first, p.time);
    c.last = Math.max(c.last, p.time);
    c.protocols.set(s.protocol, (c.protocols.get(s.protocol) ?? 0) + 1);
  }
  return [...map.values()]
    .map(({ protocols, ...c }) => {
      const top = [...protocols].filter(([name]) => name !== c.transport).sort((m, n) => n[1] - m[1])[0]; // prettier-ignore
      return { ...c, protocol: top ? top[0] : c.transport };
    })
    .sort((m, n) => n.packets - m.packets || n.bytes - m.bytes);
}

/**
 * @typedef {{ name: string, sources: string[], addresses: string[], packets: number[] }} Name
 *   `sources`: `dns`, `sni`, `http`.
 */

/**
 * The host names seen in a capture: DNS questions with their answers, TLS server names and
 * HTTP Host headers. What an analyst copies as indicators.
 *
 * @param {Packet[]} packets
 * @returns {Name[]} Sorted by name.
 */
export function hostNames(packets) {
  /** @type {Map<string, { sources: Set<string>, addresses: Set<string>, packets: number[] }>} */
  const map = new Map();
  const get = (/** @type {string} */ name) => {
    let entry = map.get(name);
    if (!entry) {
      entry = { sources: new Set(), addresses: new Set(), packets: [] };
      map.set(name, entry);
    }
    return entry;
  };
  for (const p of packets) {
    const s = p.summary;
    const source = s.protocol === 'TLS' ? 'sni' : s.protocol === 'HTTP' ? 'http' : 'dns';
    for (const name of new Set(s.names)) {
      if (!name || name === '.') continue;
      const entry = get(name);
      entry.sources.add(source);
      if (entry.packets.length < 50) entry.packets.push(p.index);
    }
    for (const answer of s.answers) {
      if (!answer.data) continue;
      const entry = get(answer.name);
      entry.sources.add('dns');
      if (answer.type === 'A' || answer.type === 'AAAA' || answer.type === 'CNAME') entry.addresses.add(answer.data); // prettier-ignore
      if (entry.packets.length < 50 && !entry.packets.includes(p.index))
        entry.packets.push(p.index);
    }
  }
  return [...map]
    .map(([name, e]) => ({
      name,
      sources: [...e.sources].sort(),
      addresses: [...e.addresses],
      packets: e.packets,
    })) // prettier-ignore
    .sort((m, n) => m.name.localeCompare(n.name));
}

/**
 * Protocols of a capture with their packet counts, most common first.
 *
 * @param {Packet[]} packets
 * @returns {[string, number][]}
 */
export function protocols(packets) {
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const p of packets) map.set(p.summary.protocol || '?', (map.get(p.summary.protocol || '?') ?? 0) + 1); // prettier-ignore
  return [...map].sort((m, n) => n[1] - m[1] || m[0].localeCompare(n[0]));
}

/**
 * The packet list as CSV (formulas neutralized).
 *
 * @param {Packet[]} packets
 * @param {number} origin - Time of the first packet (µs).
 * @returns {string}
 */
export function toCsv(packets, origin) {
  const cell = (/** @type {string | number} */ value) => {
    let s = String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) || s !== String(value) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['No.', 'Time', 'Source', 'Destination', 'Protocol', 'Length', 'Info']];
  for (const p of packets) {
    const s = p.summary;
    rows.push([String(p.index), ((p.time - origin) / 1e6).toFixed(6), s.src, s.dst, s.protocol, String(p.length), s.info]); // prettier-ignore
  }
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}
