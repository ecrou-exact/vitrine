// @ts-check
import { afterEach, describe, expect, it } from 'vitest';
import {
  clfTime,
  maskIp,
  readAccessLog,
  readAgent,
  summarize,
  timeline,
  top,
} from '../../src/components/access-log/access.js';
import { VtAccessLog } from '../../src/components/access-log/vt-access-log.js';

if (!customElements.get('vt-access-log')) customElements.define('vt-access-log', VtAccessLog);

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'; // prettier-ignore
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'; // prettier-ignore
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const NGINX = [
  `203.0.113.7 - - [15/Nov/2026:10:00:01 +0100] "GET /index.html HTTP/2.0" 200 5120 "-" "${CHROME}" 0.012`,
  `203.0.113.7 - - [15/Nov/2026:10:00:02 +0100] "GET /assets/app.js HTTP/2.0" 200 81920 "https://example.com/" "${CHROME}" 0.004`, // prettier-ignore
  `198.51.100.23 - alice [15/Nov/2026:10:05:40 +0100] "POST /login HTTP/1.1" 302 0 "https://example.com/login" "${IPHONE}" 0.250`, // prettier-ignore
  `66.249.66.1 - - [15/Nov/2026:10:20:00 +0100] "GET /old-page HTTP/1.1" 404 153 "-" "${GOOGLEBOT}" 0.002`,
  `192.0.2.44 - - [15/Nov/2026:10:31:12 +0100] "GET /api/orders?page=2 HTTP/1.1" 500 87 "-" "curl/8.10.1" 1.734`, // prettier-ignore
  'this line is not a request',
].join('\n');

/**
 * @param {Record<string, string>} attributes
 * @param {string} content
 * @returns {Promise<VtAccessLog>}
 */
async function mount(attributes, content) {
  const el = /** @type {VtAccessLog} */ (document.createElement('vt-access-log'));
  for (const [name, value] of Object.entries({ 'lang-ui': 'en', ...attributes })) el.setAttribute(name, value); // prettier-ignore
  el.content = content;
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

afterEach(() => document.body.replaceChildren());

describe('access logs', () => {
  it('reads the combined format with the request time of Nginx', () => {
    const list = readAccessLog(NGINX);
    expect(list).toHaveLength(5);
    expect(list[2]).toMatchObject({ ip: '198.51.100.23', user: 'alice', method: 'POST', path: '/login', status: 302, bytes: 0, duration: 250, referer: 'https://example.com/login', line: 3 }); // prettier-ignore
    expect(new Date(/** @type {number} */ (list[0].time)).toISOString()).toBe('2026-11-15T09:00:01.000Z'); // prettier-ignore
    expect(list[0].referer).toBe('');
  });

  it('reads Caddy, Traefik and IIS', () => {
    const caddy = JSON.stringify({ level: 'info', ts: 1763200000.5, logger: 'http.log.access', msg: 'handled request', request: { remote_ip: '203.0.113.9', client_ip: '203.0.113.9', proto: 'HTTP/2.0', method: 'GET', host: 'example.com', uri: '/docs', headers: { 'User-Agent': [CHROME] } }, duration: 0.0021, size: 4096, status: 200 }); // prettier-ignore
    const traefik = JSON.stringify({ ClientHost: '192.0.2.8', RequestMethod: 'DELETE', RequestPath: '/api/x/1', DownstreamStatus: 403, Duration: 1500000, StartUTC: '2026-11-15T10:00:00Z', 'request_User-Agent': 'python-requests/2.32' }); // prettier-ignore
    const iis = '#Software: Microsoft Internet Information Services 10.0\n#Fields: date time s-ip cs-method cs-uri-stem cs-uri-query s-port cs-username c-ip cs(User-Agent) cs(Referer) sc-status sc-substatus sc-win32-status time-taken\n2026-11-15 10:00:00 10.0.0.1 GET /default.aspx q=1 443 - 203.0.113.50 Mozilla/5.0+(Windows+NT+10.0;+Win64;+x64) - 200 0 0 46'; // prettier-ignore
    const list = readAccessLog(`${caddy}\n${traefik}\n${iis}`);
    expect(list.map((r) => [r.ip, r.method, r.path, r.status, r.duration])).toEqual([
      ['203.0.113.9', 'GET', '/docs', 200, 2.1],
      ['192.0.2.8', 'DELETE', '/api/x/1', 403, 1.5],
      ['203.0.113.50', 'GET', '/default.aspx?q=1', 200, 46],
    ]);
    expect(list[0]).toMatchObject({ host: 'example.com', bytes: 4096, client: { browser: 'Chrome', os: 'Windows' } }); // prettier-ignore
    expect(list[1].client).toMatchObject({ device: 'tool', browser: 'Python requests' });
  });

  it('reads user agents', () => {
    expect(readAgent(CHROME)).toEqual({
      browser: 'Chrome',
      os: 'Windows',
      device: 'desktop',
      bot: '',
    });
    expect(readAgent(IPHONE)).toEqual({ browser: 'Safari', os: 'iOS', device: 'mobile', bot: '' });
    expect(readAgent(GOOGLEBOT)).toMatchObject({ device: 'bot', bot: 'Googlebot' });
    expect(readAgent('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)').bot).toBe('ClaudeBot'); // prettier-ignore
    expect(readAgent('SomeCrawler/2.0').bot).toBe('SomeCrawler');
    expect(readAgent('').device).toBe('unknown');
  });

  it('masks IPs and computes totals, tops and the timeline', () => {
    expect(maskIp('203.0.113.7')).toBe('203.0.113.0');
    expect(maskIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::');
    const list = readAccessLog(NGINX);
    expect(summarize(list)).toMatchObject({ requests: 5, visitors: 4, errors: 2, bytes: 87280, bots: 1, median: 12 }); // prettier-ignore
    expect(top(list, (r) => r.ip)[0]).toEqual(['203.0.113.7', 2]);
    const line = timeline(list);
    expect(line?.size).toBe(60_000);
    expect(line?.buckets.reduce((n, b) => n + b['2xx'] + b['3xx'] + b['4xx'] + b['5xx'], 0)).toBe(
      5,
    );
    expect(clfTime('10/Oct/2000:13:55:36 -0700')).toBe(Date.parse('2000-10-10T20:55:36Z'));
  });
});

describe('<vt-access-log>', () => {
  it('shows totals, the chart and the newest request first', async () => {
    const el = await mount({ variant: 'full' }, NGINX);
    expect([...el.root.querySelectorAll('.ax-stat dd')].map((d) => d.textContent).slice(0, 3)).toEqual(['5', '4', '2 (40%)']); // prettier-ignore
    expect(el.root.querySelector('.ax-chart')?.getAttribute('aria-label')).toMatch(
      /^Requests per minute/,
    );
    expect(el.root.querySelector('tbody .ax-toggle')?.textContent).toBe('/api/orders?page=2');
  });

  it('filters by status class, by field and from a top list', async () => {
    const el = await mount({ variant: 'full', anonymize: '' }, NGINX);
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-filter-change', (e) =>
      seen.push(/** @type {CustomEvent} */ (e).detail),
    );
    const errors = [...el.root.querySelectorAll('.ax-class')].find((b) => b.textContent?.startsWith('4xx')); // prettier-ignore
    /** @type {HTMLElement} */ (errors).click();
    expect(seen[0]).toEqual({ status: '4xx', filter: '', shown: 1 });
    expect(el.root.querySelectorAll('tbody tr.ax-row')).toHaveLength(1);
    /** @type {HTMLElement} */ ([...el.root.querySelectorAll('.ax-class')][0]).click();
    el.setFilter('bot:yes');
    expect(el.root.querySelector('tbody .ax-client')?.textContent).toBe('Googlebot');
    el.setFilter('');
    expect(el.root.querySelector('tbody .ax-link')?.textContent).toBe('192.0.2.0');
    el.viewChoice = 'top';
    el.render();
    const ip = [...el.root.querySelectorAll('.ax-top')].find((s) => s.querySelector('h3')?.textContent === 'IP addresses'); // prettier-ignore
    const entry = /** @type {HTMLElement} */ (
      /** @type {Element} */ (ip).querySelector('.ax-entry')
    );
    entry.click();
    expect(el.filter).toBe('ip:203.0.113.0');
    expect(el.root.querySelectorAll('tbody tr.ax-row')).toHaveLength(2);
  });

  it('opens a row on its details, and adds lines live', async () => {
    const el = await mount({}, NGINX);
    /** @type {HTMLElement} */ (el.root.querySelector('.ax-toggle')).click();
    expect(el.root.querySelector('.ax-details')?.textContent).toContain('curl/8.10.1');
    el.write(
      `10.0.0.9 - - [15/Nov/2026:10:40:00 +0100] "GET /health HTTP/1.1" 200 2 "-" "kube-probe/1.31"`,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(el.requests).toHaveLength(6);
    expect(el.root.querySelector('tbody .ax-toggle')?.textContent).toBe('/health');
  });
});
