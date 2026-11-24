import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, mount } from './helpers.js';

test('Flowtime views, inspector and timeline-only text size work under strict CSP', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto(STRICT);
  await mount(
    page,
    'vt-flowtime',
    { 'lang-ui': 'en', 'text-scale': '1.5' },
    JSON.stringify([
      {
        id: 'alert',
        start: '2026-11-24T08:15:00Z',
        title: 'Identity alert',
        description: 'An unfamiliar device signed in.',
      },
      { id: 'logs', start: '2026-11-24T09:20:00Z', title: 'Logs preserved' },
    ]),
  );
  const el = page.locator('#el');
  await expect(el.locator('.ft-details')).toBeHidden();
  await el.getByRole('button', { name: 'Identity alert', exact: true }).click();
  await expect(el.getByRole('heading', { name: 'Identity alert' })).toBeVisible();
  await el.getByRole('button', { name: '☷ Chronological feed', exact: true }).click();
  await expect(el.getByRole('combobox', { name: 'Text size' })).toBeHidden();
  await expect(el.locator('.ft-feed-text strong').first()).toHaveCSS('font-size', '14px');
  await el.getByRole('button', { name: '⌁ Combined timeline', exact: true }).click();
  await expect(el.getByRole('combobox', { name: 'Text size' })).toHaveValue('1.5');
  await el.getByRole('combobox', { name: 'Text size' }).selectOption('0.5');
  await expect(el.locator('.ft-event strong').first()).toHaveCSS('font-size', '7px');
  await el.getByRole('button', { name: 'Close event inspector' }).click();
  await expect(el.locator('.ft-details')).toBeHidden();
  expect(errors).toEqual([]);
});

test('native Flowtime follows themes, keeps host actions and tears down custom views', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/tests/e2e/fixtures/flowtime.html');
  const el = page.locator('#el');
  await expect(el.getByRole('button', { name: 'Suspicious sign-in', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await expect(el.locator('.ft')).toHaveCSS('background-color', 'rgb(23, 28, 37)');
  await page.getByRole('button', { name: 'Light theme', exact: true }).click();
  await expect(el.locator('.ft')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await el.getByRole('button', { name: 'Add event', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close event form', exact: true }).click();
  await el.getByRole('button', { name: '⌘ Graph', exact: true }).click();
  await expect(page.locator('#graph-state')).toHaveText('Graph mounted');
  await el.getByRole('button', { name: '☷ Chronological feed', exact: true }).click();
  await expect(page.locator('#graph-state')).toHaveText('Graph cleaned up');
  expect(errors).toEqual([]);
});
