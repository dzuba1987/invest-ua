const { test, expect } = require('@playwright/test');

test.describe('Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('portfolio tab is active by default', async ({ page }) => {
    const portfolioTab = page.locator('.main-tab.active');
    await expect(portfolioTab).toHaveText(/Портфель/);
    const portfolioPanel = page.locator('#panel-portfolio');
    await expect(portfolioPanel).toHaveClass(/active/);
  });

  test('switch to calculator tab', async ({ page }) => {
    await page.click('.main-tab[onclick*="calc"]');
    const panel = page.locator('#panel-calc');
    await expect(panel).toHaveClass(/active/);
    await expect(page.locator('#panel-portfolio')).not.toHaveClass(/active/);
  });

  test('switch to analytics tab', async ({ page }) => {
    await page.click('.main-tab[onclick*="analytics"]');
    const panel = page.locator('#panel-analytics');
    await expect(panel).toHaveClass(/active/);
  });

  test('switch to currencies tab', async ({ page }) => {
    await page.click('.main-tab[onclick*="currencies"]');
    const panel = page.locator('#panel-currencies');
    await expect(panel).toHaveClass(/active/);
  });

  test('switch to profile tab', async ({ page }) => {
    await page.click('.main-tab[onclick*="profile"]');
    const panel = page.locator('#panel-profile');
    await expect(panel).toHaveClass(/active/);
  });

  test('all 5 tabs exist', async ({ page }) => {
    const tabs = page.locator('.main-tab');
    await expect(tabs).toHaveCount(5);
  });
});
