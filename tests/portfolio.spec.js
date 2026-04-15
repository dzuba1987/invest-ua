const { test, expect } = require('@playwright/test');

test.describe('Portfolio (without auth)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows onboarding when not logged in', async ({ page }) => {
    const onboarding = page.locator('.onboarding');
    await expect(onboarding).toBeVisible();
    await expect(onboarding).toContainText('Ласкаво просимо');
  });

  test('onboarding has 3 steps', async ({ page }) => {
    const steps = page.locator('.onboarding-step');
    await expect(steps).toHaveCount(3);
  });

  test('onboarding has Google login button', async ({ page }) => {
    const btn = page.locator('#portfolioAuth .btn-google');
    await expect(btn).toBeVisible();
  });

  test('portfolio form is hidden when not logged in', async ({ page }) => {
    await expect(page.locator('#portfolioContent')).toBeHidden();
  });
});
