import { describe, expect, it } from 'vitest';
import {
  acceptNames,
  accepts,
  checkFile,
  fileKind,
  formatSize,
  parseAccept,
  parseSize,
} from '../../src/components/upload/files.js';
import { VtUpload, serverValue } from '../../src/components/upload/vt-upload.js';

describe('<vt-upload> files', () => {
  it('reads sizes as people write them', () => {
    expect(parseSize('5MB')).toBe(5e6);
    expect(parseSize('500 KB')).toBe(5e5);
    expect(parseSize('1,5 Mo')).toBe(1.5e6);
    expect(parseSize('2 MiB')).toBe(2 * 1024 ** 2);
    expect(parseSize(1234)).toBe(1234);
    expect(parseSize('lots')).toBe(0);
    expect(parseSize('5 parsecs')).toBe(0);
    expect(parseSize(-3)).toBe(0);
  });

  it('writes sizes in the units of the language', () => {
    expect(formatSize(52_000, 'en')).toBe('52 kB');
    expect(formatSize(1_250_000, 'en')).toBe('1.3 MB');
    expect(formatSize(1, 'en')).toBe('1 byte');
  });

  it('follows the accept rules of the browser', () => {
    const rules = parseAccept(' image/*, .PDF ,application/json, junk, <b> ');
    expect(rules).toEqual(['image/*', '.pdf', 'application/json']);
    expect(accepts({ name: 'a.png', type: 'image/png' }, rules)).toBe(true);
    expect(accepts({ name: 'Report.Pdf', type: '' }, rules)).toBe(true);
    expect(accepts({ name: 'x.json', type: 'application/json' }, rules)).toBe(true);
    expect(accepts({ name: 'x.txt', type: 'text/plain' }, rules)).toBe(false);
    expect(accepts({ name: 'x.txt', type: 'text/plain' }, [])).toBe(true);
    expect(acceptNames(rules)).toEqual(['Image', 'PDF', 'JSON']);
  });

  it('says why a file is refused', () => {
    const rules = { accept: ['.pdf'], maxSize: 1000, minSize: 10 };
    expect(checkFile({ name: 'a.pdf', type: '', size: 500 }, rules)).toBe('');
    expect(checkFile({ name: 'a.doc', type: '', size: 500 }, rules)).toBe('type');
    expect(checkFile({ name: 'a.pdf', type: '', size: 5000 }, rules)).toBe('tooLarge');
    expect(checkFile({ name: 'a.pdf', type: '', size: 5 }, rules)).toBe('tooSmall');
    expect(checkFile({ name: 'a.pdf', type: '', size: 0 }, rules)).toBe('empty');
  });

  it('knows the kind of a file', () => {
    expect(fileKind({ name: 'a.PNG', type: 'image/png' })).toBe('image');
    expect(fileKind({ name: 'a.pdf', type: '' })).toBe('pdf');
    expect(fileKind({ name: 'a.zip', type: '' })).toBe('archive');
    expect(fileKind({ name: 'a.csv', type: 'text/csv' })).toBe('text');
    expect(fileKind({ name: 'a.bin', type: '' })).toBe('file');
  });

  it('submits what the server answered for a file sent', () => {
    expect(serverValue({ id: 'f_1', url: '/f/1' })).toBe('f_1');
    expect(serverValue({ url: '/f/1' })).toBe('/f/1');
    expect(serverValue({ id: 42 })).toBe('42');
    expect(serverValue(['x'])).toBe('');
    expect(serverValue('ok')).toBe('');
    expect(serverValue({ id: { nested: true } })).toBe('');
  });

  it('reads JSON settings', () => {
    expect(VtUpload.fromData({ accept: ['image/*', '.pdf'], maxSize: '5MB', multiple: true }).attributes).toEqual({ accept: 'image/*,.pdf', 'max-size': '5MB', multiple: true }); // prettier-ignore
  });
});
