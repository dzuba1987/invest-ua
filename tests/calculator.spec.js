const { test, expect } = require('@playwright/test');

test.describe('Calculator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('.main-tab[onclick*="calc"]');
  });

  test('form fields are visible', async ({ page }) => {
    await expect(page.locator('#invested')).toBeVisible();
    await expect(page.locator('#annualRateInput')).toBeVisible();
    await expect(page.locator('#dateStart')).toBeVisible();
    await expect(page.locator('#dateEnd')).toBeVisible();
  });

  test('calculate button works and shows results', async ({ page }) => {
    await page.fill('#invested', '100000');
    await page.fill('#annualRateInput', '15');
    await page.click('button[onclick="calculate()"]');
    const results = page.locator('#results');
    await expect(results).toHaveClass(/show/);
    const profit = page.locator('#resProfit');
    await expect(profit).not.toBeEmpty();
  });

  test('clear button resets form', async ({ page }) => {
    await page.fill('#invested', '100000');
    await page.fill('#annualRateInput', '15');
    await page.click('button[onclick="calculate()"]');
    await page.click('button[onclick="clearAll()"]');
    await expect(page.locator('#invested')).toHaveValue('');
    await expect(page.locator('#annualRateInput')).toHaveValue('');
  });

  test('compound interest checkbox shows extra fields', async ({ page }) => {
    await expect(page.locator('#compoundRateField')).toBeHidden();
    await page.check('#compoundCheck');
    await expect(page.locator('#compoundRateField')).toBeVisible();
    await expect(page.locator('#compoundTaxField')).toBeVisible();
    await expect(page.locator('#compoundTermField')).toBeVisible();
    await expect(page.locator('#compoundIndexField')).toBeVisible();
  });

  test('compound interest unchecks and hides fields', async ({ page }) => {
    await page.check('#compoundCheck');
    await expect(page.locator('#compoundRateField')).toBeVisible();
    await page.uncheck('#compoundCheck');
    await expect(page.locator('#compoundRateField')).toBeHidden();
  });

  test('compound calculates and shows chart block', async ({ page }) => {
    await page.fill('#invested', '100000');
    await page.fill('#annualRateInput', '12');
    await page.check('#compoundCheck');
    await page.click('button[onclick="calculate()"]');
    const compoundFull = page.locator('#compoundFullWidth');
    await expect(compoundFull).toBeVisible();
    await expect(page.locator('#resCompoundTotal')).not.toBeEmpty();
  });
});
