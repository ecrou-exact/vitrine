// @ts-check
import { describe, expect, it } from 'vitest';
import { parseCountdown, splitTime } from '../../src/components/countdown/vt-countdown.js';
import { faqStructuredData, filterFaq, parseFaq, slug } from '../../src/components/faq/model.js';
import { parseGallery } from '../../src/components/gallery/vt-gallery.js';
import { parseRoadmap, statusKey } from '../../src/components/roadmap/model.js';
import {
  changeTone,
  parseStats,
  plotPoints,
  readChange,
} from '../../src/components/stats/model.js';
import {
  averageRating,
  initials,
  parseTestimonials,
} from '../../src/components/testimonials/vt-testimonials.js';

describe('<vt-faq>', () => {
  it('reads questions with unique ids usable in a link', () => {
    const result = parseFaq(
      JSON.stringify({
        items: [
          { question: 'Is it free?', answer: 'Yes.', category: 'Billing' },
          { q: 'Is it free?', a: 'Still yes.' },
          { question: 'Où êtes-vous ?', answer: 'Luxembourg', id: 'where' },
          { answer: 'no question' },
        ],
      }),
    );
    expect(result.ok && result.items.map((item) => item.id)).toEqual([
      'is-it-free',
      'is-it-free-2',
      'where',
    ]);
    expect(slug('Où êtes-vous ?')).toBe('ou-etes-vous');
  });

  it('filters by every word and by category', () => {
    const result = parseFaq(
      '[{"question":"Can I pay yearly?","answer":"Yes","category":"Billing"},{"question":"Is data safe?","answer":"Encrypted yearly audits","category":"Security"}]',
    );
    if (!result.ok) throw new Error('not read');
    expect(filterFaq(result.items, 'yearly', null)).toHaveLength(2);
    expect(filterFaq(result.items, 'yearly audits', null)).toHaveLength(1);
    expect(filterFaq(result.items, 'yearly', 'Billing')).toHaveLength(1);
  });

  it('gives schema.org FAQPage data', () => {
    const result = parseFaq('[{"question":"Q?","answer":"A."}]');
    if (!result.ok) throw new Error('not read');
    expect(faqStructuredData(result.items)).toMatchObject({
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'Q?', acceptedAnswer: { text: 'A.' } }],
    });
  });

  it('reports what is not a list', () => {
    expect(parseFaq('{"a":1}')).toMatchObject({ ok: false, error: 'shape' });
    expect(parseFaq('{')).toMatchObject({ ok: false, error: 'json' });
  });
});

describe('<vt-gallery>', () => {
  it('reads addresses and objects, and drops unsafe images', () => {
    const result = parseGallery(
      JSON.stringify([
        '/a.jpg',
        {
          src: 'https://cdn.example.com/b.jpg',
          alt: 'B',
          caption: 'Bee',
          href: 'javascript:alert(1)',
        },
        { src: 'javascript:alert(1)' },
        { src: 'data:image/svg+xml;base64,PHN2Zz4=' },
        { src: 'data:image/png;base64,iVBORw0KGgo=', width: 'x' },
      ]),
    );
    if (!result.ok) throw new Error('not read');
    expect(result.images.map((image) => image.src)).toEqual([
      '/a.jpg',
      'https://cdn.example.com/b.jpg',
      'data:image/png;base64,iVBORw0KGgo=',
    ]);
    expect(result.images[1]).toMatchObject({
      alt: 'B',
      caption: 'Bee',
      href: null,
      thumb: 'https://cdn.example.com/b.jpg',
    });
  });

  it('keeps images of this origin only when asked', () => {
    const result = parseGallery('["/a.jpg","https://elsewhere.example/b.jpg"]', 'same-origin');
    expect(result.ok && result.images.map((image) => image.src)).toEqual(['/a.jpg']);
  });
});

describe('<vt-stats>', () => {
  it('reads figures, changes and histories', () => {
    const result = parseStats(
      JSON.stringify([
        {
          label: 'Visitors',
          value: 120,
          previous: 100,
          series: [1, 2, '3', null, { value: 4, label: 'Apr' }],
        },
        { label: 'Errors', value: '12', change: -20, good: 'down', format: 'percent' },
        { label: 'Plan', value: 'Pro' },
        { value: null },
      ]),
    );
    if (!result.ok) throw new Error('not read');
    const [visitors, errors, plan] = result.stats;
    expect(visitors.change).toBe(20);
    expect(visitors.series.map((point) => point.value)).toEqual([1, 2, 3, 4]);
    expect(errors).toMatchObject({ value: 12, change: -20, good: 'down', format: 'percent' });
    expect(plan).toMatchObject({ value: null, display: 'Pro' });
    expect(result.stats).toHaveLength(3);
  });

  it('has no change from zero, and tells good news from bad', () => {
    expect(readChange({ previous: 0 }, 5)).toBeNull();
    expect(changeTone(5, 'up')).toBe('good');
    expect(changeTone(-5, 'up')).toBe('bad');
    expect(changeTone(-5, 'down')).toBe('good');
    expect(changeTone(5, 'none')).toBe('neutral');
  });

  it('plots a flat history through the middle, inside its margins', () => {
    const flat = plotPoints(
      [
        { label: '', value: 2 },
        { label: '', value: 2 },
      ],
      100,
      40,
      4,
    );
    expect(flat.map((p) => p.y)).toEqual([20, 20]);
    const rising = plotPoints(
      [
        { label: '', value: 0 },
        { label: '', value: 10 },
      ],
      100,
      40,
      4,
    );
    expect(rising).toEqual([
      { x: 4, y: 36 },
      { x: 96, y: 4 },
    ]);
  });
});

describe('<vt-roadmap>', () => {
  it('puts items in columns, known statuses in their usual order', () => {
    const result = parseRoadmap(
      JSON.stringify([
        { title: 'Shipped thing', status: 'released' },
        { title: 'Odd', status: 'Research' },
        { title: 'Working', status: 'in progress', progress: 140, votes: 12.7, tags: ['api', 3] },
        { title: 'Later', status: 'backlog' },
      ]),
    );
    if (!result.ok) throw new Error('not read');
    expect(result.columns.map((column) => column.id)).toEqual([
      'planned',
      'in-progress',
      'done',
      'research',
    ]);
    expect(result.items[2]).toMatchObject({ progress: 100, votes: 12, tags: ['api', '3'] });
  });

  it('keeps declared columns first', () => {
    const result = parseRoadmap(
      '{"columns":[{"id":"done","title":"Shipped"}],"items":[{"title":"A","status":"planned"}]}',
    );
    expect(result.ok && result.columns).toEqual([
      { id: 'done', title: 'Shipped' },
      { id: 'planned', title: '' },
    ]);
    expect(statusKey('constructor')).toBe('constructor');
  });
});

describe('<vt-testimonials>', () => {
  it('reads quotes, ratings and their average', () => {
    const result = parseTestimonials(
      JSON.stringify([
        { quote: 'Great', author: 'Ada Lovelace', role: 'CTO', company: 'Analytical', rating: 5 },
        { text: 'Good', name: 'Alan', stars: 4, avatar: 'javascript:alert(1)' },
        { quote: 'Fine', rating: 9 },
        { author: 'No quote' },
      ]),
    );
    if (!result.ok) throw new Error('not read');
    expect(result.items).toHaveLength(3);
    expect(result.items[0].role).toBe('CTO, Analytical');
    expect(result.items[1].avatar).toBeNull();
    expect(averageRating(result.items)).toEqual({ rating: 14 / 3, count: 3 });
    expect(initials('Ada Augusta Lovelace')).toBe('AL');
    expect(initials('ébène')).toBe('É');
  });
});

describe('<vt-countdown>', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');

  it('reads one date, or picks the next of a list', () => {
    expect(parseCountdown('2026-12-25T00:00:00Z', now, null)?.to).toBe(
      Date.parse('2026-12-25T00:00:00Z'),
    );
    const next = parseCountdown(
      JSON.stringify({
        events: [
          { to: '2026-01-01T00:00:00Z', title: 'Past' },
          { date: '2027-01-01T00:00:00Z', title: 'New year' },
          { to: '2026-12-01T00:00:00Z', title: 'Soon' },
        ],
      }),
      now,
      null,
    );
    expect(next?.title).toBe('Soon');
    expect(parseCountdown('[{"to":"2020-01-01T00:00:00Z","title":"Old"}]', now, null)?.title).toBe(
      'Old',
    );
    expect(parseCountdown('not a date', now, null)).toBeNull();
  });

  it('reads a date without an offset in a time zone', () => {
    const paris = parseCountdown(
      '{"to":"2026-12-25T00:00:00","timezone":"Europe/Paris"}',
      now,
      null,
    );
    expect(new Date(/** @type {number} */ (paris?.to)).toISOString()).toBe(
      '2026-12-24T23:00:00.000Z',
    );
  });

  it('splits the time left into the units asked for', () => {
    const ms = ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000;
    expect(splitTime(ms)).toEqual([
      { unit: 'day', value: 2 },
      { unit: 'hour', value: 3 },
      { unit: 'minute', value: 4 },
      { unit: 'second', value: 5 },
    ]);
    expect(splitTime(ms, ['hour', 'minute'])).toEqual([
      { unit: 'hour', value: 51 },
      { unit: 'minute', value: 4 },
    ]);
    expect(splitTime(-5000)[0].value).toBe(0);
  });
});
