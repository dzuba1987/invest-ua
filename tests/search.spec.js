const { test, expect } = require('@playwright/test');

test.describe('Global Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('search input is visible', async ({ page }) => {
    await expect(page.locator('#globalSearchInput')).toBeVisible();
  });

  test('search results hidden by default', async ({ page }) => {
    await expect(page.locator('#globalSearchResults')).toBeHidden();
  });

  test('typing shows results dropdown', async ({ page }) => {
    await page.fill('#globalSearchInput', 'калькулятор');
    await expect(page.locator('#globalSearchResults')).toBeVisible();
  });

  test('search finds navigation items', async ({ page }) => {
    await page.fill('#globalSearchInput', 'валют');
    const results = page.locator('.search-result-item');
    await expect(results.first()).toBeVisible();
    await expect(page.locator('#globalSearchResults')).toContainText('Валюти');
  });

  test('clear button works', async ({ page }) => {
    await page.fill('#globalSearchInput', 'test');
    await expect(page.locator('#globalSearchClear')).toBeVisible();
    await page.click('#globalSearchClear');
    await expect(page.locator('#globalSearchInput')).toHaveValue('');
    await expect(page.locator('#globalSearchResults')).toBeHidden();
  });

  test('clicking outside closes results', async ({ page }) => {
    await page.fill('#globalSearchInput', 'портфель');
    await expect(page.locator('#globalSearchResults')).toBeVisible();
    await page.click('h1');
    await expect(page.locator('#globalSearchResults')).toBeHidden();
  });
});
