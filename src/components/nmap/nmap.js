// @ts-check
/**
 * Nmap results: XML (`-oX`), normal (`-oN` or the terminal) and grepable (`-oG`) output read
 * into one shape, and the services that are risky to expose.
 *
 * @module components/nmap/nmap
 */
import { parseXml, rootElement } from '../xml/parser.js';

/**
 * @typedef {{ id: string, output: string }} Script
 * @typedef {{ port: number, protocol: string, state: string, reason: string, service: string, version: string, tunnel: string, scripts: Script[] }} Port
 * @typedef {{ address: string, addressType: string, mac: string, vendor: string, hostnames: string[], status: string, latency: string, os: string, ports: Port[], scripts: Script[] }} Host
 * @typedef {{ command: string, started: string, elapsed: string, summary: string, hosts: Host[] }} Scan
 * @typedef {{ ok: true, scan: Scan } | { ok: false, error: 'empty' | 'format' | 'xml', detail?: string }} ScanResult
 */

/** Most hosts and ports kept. */
export const MAX_HOSTS = 5000;
export const MAX_PORTS = 50000;

/**
 * Services that should rarely face the Internet: clear-text logins, remote desktops,
 * file shares and databases that often run without a password.
 */
export const RISKY = Object.freeze({
  21: 'ftp', 23: 'telnet', 69: 'tftp', 111: 'rpcbind', 135: 'msrpc', 139: 'netbios', 161: 'snmp',
  445: 'smb', 512: 'rexec', 513: 'rlogin', 514: 'rsh', 873: 'rsync', 1433: 'mssql', 1521: 'oracle',
  2049: 'nfs', 2375: 'docker', 3306: 'mysql', 3389: 'rdp', 5432: 'postgresql', 5900: 'vnc',
  5984: 'couchdb', 6379: 'redis', 9200: 'elasticsearch', 11211: 'memcached', 27017: 'mongodb',
}); // prettier-ignore

/** @returns {Host} */
function newHost() {
  return { address: '', addressType: '', mac: '', vendor: '', hostnames: [], status: 'up', latency: '', os: '', ports: [], scripts: [] }; // prettier-ignore
}

/**
 * @param {string} text
 * @returns {ScanResult}
 */
export function parseScan(text) {
  const source = String(text ?? '').trim();
  if (!source) return { ok: false, error: 'empty' };
  if (/^<\?xml|^<!DOCTYPE nmaprun|^<nmaprun/.test(source)) return parseXmlScan(source);
  if (/^Host: .*\t(?:Status|Ports):/m.test(source) || /^# Nmap .* as: .*-oG/m.test(source))
    return { ok: true, scan: parseGrepable(source) };
  if (/Nmap scan report for /.test(source)) return { ok: true, scan: parseNormal(source) };
  return { ok: false, error: 'format' };
}

/**
 * @param {import('../xml/parser.js').XmlNode} node
 * @param {string} name
 */
const attr = (node, name) => node.attrs.find((a) => a.name === name)?.value ?? '';

/**
 * @param {import('../xml/parser.js').XmlNode} node
 * @param {string} name
 */
const kids = (node, name) => node.children.filter((c) => c.type === 'element' && c.name === name);

/**
 * @param {import('../xml/parser.js').XmlNode} node
 * @returns {Script[]}
 */
const scriptsOf = (node) => kids(node, 'script').map((s) => ({ id: attr(s, 'id'), output: attr(s, 'output').trim() })); // prettier-ignore

/**
 * @param {string} text
 * @returns {ScanResult}
 */
function parseXmlScan(text) {
  const parsed = parseXml(text, { maxDepth: 64 });
  if (!parsed.ok) return { ok: false, error: 'xml', detail: parsed.error.message };
  const root = rootElement(parsed.value);
  if (!root || root.name !== 'nmaprun') return { ok: false, error: 'format' };
  const finished = kids(root, 'runstats').flatMap((r) => kids(r, 'finished'))[0];
  /** @type {Scan} */
  const scan = {
    command: attr(root, 'args'),
    started: attr(root, 'startstr'),
    elapsed: finished ? attr(finished, 'elapsed') : '',
    summary: finished ? attr(finished, 'summary') : '',
    hosts: [],
  };
  let portCount = 0;
  for (const node of kids(root, 'host').slice(0, MAX_HOSTS)) {
    const host = newHost();
    host.status = attr(kids(node, 'status')[0] ?? node, 'state') || 'up';
    for (const address of kids(node, 'address')) {
      const type = attr(address, 'addrtype');
      if (type === 'mac') {
        host.mac = attr(address, 'addr');
        host.vendor = attr(address, 'vendor');
      } else if (!host.address) {
        host.address = attr(address, 'addr');
        host.addressType = type;
      }
    }
    host.hostnames = kids(node, 'hostnames').flatMap((h) => kids(h, 'hostname')).map((h) => attr(h, 'name')).filter(Boolean); // prettier-ignore
    const times = kids(node, 'times')[0];
    if (times && attr(times, 'srtt'))
      host.latency = `${(Number(attr(times, 'srtt')) / 1e6).toFixed(3)}s`;
    const match = kids(node, 'os').flatMap((o) => kids(o, 'osmatch'))[0];
    if (match) host.os = `${attr(match, 'name')}${attr(match, 'accuracy') ? ` (${attr(match, 'accuracy')}%)` : ''}`; // prettier-ignore
    for (const port of kids(node, 'ports').flatMap((p) => kids(p, 'port'))) {
      if (portCount++ >= MAX_PORTS) break;
      const state = kids(port, 'state')[0];
      const service = kids(port, 'service')[0];
      host.ports.push({
        port: Number(attr(port, 'portid')),
        protocol: attr(port, 'protocol'),
        state: state ? attr(state, 'state') : '',
        reason: state ? attr(state, 'reason') : '',
        service: service ? attr(service, 'name') : '',
        version: service ? [attr(service, 'product'), attr(service, 'version'), attr(service, 'extrainfo') && `(${attr(service, 'extrainfo')})`].filter(Boolean).join(' ') : '', // prettier-ignore
        tunnel: service ? attr(service, 'tunnel') : '',
        scripts: scriptsOf(port),
      });
    }
    host.scripts = kids(node, 'hostscript').flatMap(scriptsOf);
    scan.hosts.push(host);
  }
  return { ok: true, scan };
}

/**
 * Normal output, as Nmap prints it in a terminal or with `-oN`.
 *
 * @param {string} text
 * @returns {Scan}
 */
function parseNormal(text) {
  /** @type {Scan} */
  const scan = { command: '', started: '', elapsed: '', summary: '', hosts: [] };
  /** @type {Host | null} */
  let host = null;
  /** @type {Port | null} */
  let port = null;
  /** @type {Script | null} */
  let script = null;
  let columns = 0;
  let portCount = 0;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if ((m = /^(?:# )?Nmap [\d.]+\w* scan initiated (.+?) as: (.+)$/.exec(line))) {
      scan.started = m[1];
      scan.command = m[2];
    } else if ((m = /^Starting Nmap .* at (.+)$/.exec(line))) scan.started = m[1];
    else if ((m = /^(?:# )?Nmap done(?: at .+?)?: (.+?)(?: in ([\d.]+) seconds)?$/.exec(line))) {
      scan.summary = m[1];
      scan.elapsed = m[2] ?? '';
    } else if ((m = /^Nmap scan report for (.+)$/.exec(line))) {
      if (scan.hosts.length >= MAX_HOSTS) break;
      host = newHost();
      scan.hosts.push(host);
      port = null;
      script = null;
      columns = 0;
      const named = /^(.+) \(([^)]+)\)$/.exec(m[1]);
      if (named) {
        host.hostnames.push(named[1]);
        host.address = named[2];
      } else host.address = m[1];
      host.addressType = host.address.includes(':') ? 'ipv6' : 'ipv4';
    } else if (!host) continue;
    else if ((m = /^Host is (up|down)(?: \(([\d.]+s) latency\))?/.exec(line))) {
      host.status = m[1];
      host.latency = m[2] ?? '';
    } else if ((m = /^MAC Address: ([0-9A-F:]{17})(?: \((.+)\))?/i.exec(line))) {
      host.mac = m[1];
      host.vendor = m[2] ?? '';
    } else if ((m = /^(?:OS details|Running|Aggressive OS guesses): (.+)$/.exec(line))) {
      if (!host.os) host.os = m[1];
    } else if (/^PORT\s+STATE\s+SERVICE/.test(line)) columns = /VERSION/.test(line) ? 4 : 3;
    else if (
      columns &&
      (m = /^(\d{1,5})\/(tcp|udp|sctp)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/.exec(line))
    ) {
      if (portCount++ >= MAX_PORTS) continue;
      const service = m[4].replace(/^ssl\//, '');
      port = { port: Number(m[1]), protocol: m[2], state: m[3], reason: '', service, version: m[5] ?? '', tunnel: m[4].startsWith('ssl/') ? 'ssl' : '', scripts: [] }; // prettier-ignore
      host.ports.push(port);
      script = null;
    } else if ((m = /^\|[_ ]?\s?([\w.-]+):\s?(.*)$/.exec(line)) && !/^\|\s{2,}/.test(line)) {
      script = { id: m[1], output: m[2] };
      (port ?? host).scripts.push(script);
      if (line.startsWith('|_')) script = null;
    } else if (/^\|/.test(line) && script) {
      script.output += `${script.output ? '\n' : ''}${line.replace(/^\|_?\s*/, '')}`;
      if (line.startsWith('|_')) script = null;
    } else if (/^Host script results:/.test(line)) port = null;
    else if (!line) {
      columns = 0;
      port = null;
    }
  }
  return scan;
}

/**
 * Grepable output (`-oG`): a line per host, ports as `port/state/protocol/owner/service/rpc/version/`.
 *
 * @param {string} text
 * @returns {Scan}
 */
function parseGrepable(text) {
  /** @type {Scan} */
  const scan = { command: '', started: '', elapsed: '', summary: '', hosts: [] };
  /** @type {Map<string, Host>} */
  const byAddress = new Map();
  let portCount = 0;
  for (const line of text.split(/\r\n|\r|\n/)) {
    let m;
    if ((m = /^# Nmap [\d.]+\w* scan initiated (.+?) as: (.+)$/.exec(line))) {
      scan.started = m[1];
      scan.command = m[2];
      continue;
    }
    if ((m = /^# Nmap done at .+? -- (.+?) scanned in ([\d.]+) seconds/.exec(line))) {
      scan.summary = m[1];
      scan.elapsed = m[2];
      continue;
    }
    m = /^Host: (\S+) \(([^)]*)\)\t(.*)$/.exec(line);
    if (!m) continue;
    let host = byAddress.get(m[1]);
    if (!host) {
      if (byAddress.size >= MAX_HOSTS) break;
      host = newHost();
      host.address = m[1];
      host.addressType = m[1].includes(':') ? 'ipv6' : 'ipv4';
      if (m[2]) host.hostnames.push(m[2]);
      byAddress.set(m[1], host);
      scan.hosts.push(host);
    }
    for (const field of m[3].split('\t')) {
      const [key, ...rest] = field.split(': ');
      const value = rest.join(': ');
      if (key === 'Status') host.status = value.toLowerCase();
      else if (key === 'OS') host.os = value;
      else if (key === 'Ports')
        for (const item of value.split(/,\s*/)) {
          const [portId, state, protocol, , service, , version] = item.split('/');
          if (!/^\d+$/.test(portId) || portCount++ >= MAX_PORTS) continue;
          host.ports.push({ port: Number(portId), protocol, state, reason: '', service: service.replace(/^ssl\|/, ''), version: version ?? '', tunnel: service.startsWith('ssl|') ? 'ssl' : '', scripts: [] }); // prettier-ignore
        }
    }
  }
  return scan;
}

/**
 * @param {Port} port
 * @returns {boolean} Whether an open port runs a service that is risky to expose.
 */
export function isRisky(port) {
  if (port.state !== 'open') return false;
  const known = /** @type {Record<number, string>} */ (RISKY)[port.port];
  return Boolean(known) || /^(?:telnet|ftp|vnc|ms-wbt-server|microsoft-ds|redis|mongodb|memcache)/.test(port.service); // prettier-ignore
}

/**
 * @param {string} cell
 */
function csvCell(cell) {
  const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(safe) || safe !== cell ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * `host,hostname,port,protocol,state,service,version`, one line per port.
 *
 * @param {Host[]} hosts
 * @returns {string}
 */
export function toCsv(hosts) {
  const rows = hosts.flatMap((host) =>
    host.ports.map(
      (p) =>
      [host.address, host.hostnames[0] ?? '', String(p.port), p.protocol, p.state, p.service, p.version].map(csvCell).join(','), // prettier-ignore
    ),
  );
  return ['host,hostname,port,protocol,state,service,version', ...rows].join('\n');
}
