const { test, expect } = require('@playwright/test');

// Mock authenticated user and portfolio data
async function mockAuth(page) {
  await page.goto('/');
  await page.evaluate(() => {
    // Mock user (these are let/var in global scope)
    currentUser = { uid: 'test123', displayName: 'Test User', email: 'test@test.com', photoURL: '' };
    firebaseReady = true;
    userProfile = { displayName: 'Test User', language: 'uk' };

    // Mock portfolio items
    portfolioItems = [
      {
        id: 1001, name: 'ОВДП тест', type: 'ovdp', invested: 100000, rate: 15,
        tax: 19.5, dateStart: '2026-01-01', dateEnd: '2026-07-01',
        bank: 'Приватбанк', card: '5168****1234', notes: 'Тестова нотатка',
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      {
        id: 1002, name: 'Депозит Моно', type: 'deposit', invested: 50000, rate: 14,
        dateStart: '2026-03-01', dateEnd: '2026-09-01',
        createdAt: '2026-03-01T00:00:00.000Z'
      }
    ];

    // Show portfolio content, stub Firestore
    document.getElementById('portfolioAuth').style.display = 'none';
    document.getElementById('portfolioContent').style.display = 'block';
    savePortfolioToFirestore = () => {};
    saveProfileToFirestore = () => {};

    renderPortfolio();
  });
}

test.describe('Portfolio (authenticated)', () => {
  test('portfolio list shows items', async ({ page }) => {
    await mockAuth(page);
    const items = page.locator('.p-item');
    await expect(items).toHaveCount(2);
  });

  test('portfolio item shows name', async ({ page }) => {
    await mockAuth(page);
    await expect(page.locator('.p-item').first()).toContainText('ОВДП тест');
  });

  test('portfolio item shows invested amount', async ({ page }) => {
    await mockAuth(page);
    await expect(page.locator('.p-item').first()).toContainText('100 000');
  });

  test('clicking item opens detail page', async ({ page }) => {
    await mockAuth(page);
    await page.locator('.p-item').first().click();
    const detail = page.locator('#investmentDetail');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('ОВДП тест');
  });

  test('detail page shows progress bar', async ({ page }) => {
    await mockAuth(page);
    await page.locator('.p-item').first().click();
    await expect(page.locator('.detail-progress')).toBeVisible();
  });

  test('back button returns to portfolio list', async ({ page }) => {
    await mockAuth(page);
    await page.locator('.p-item').first().click();
    await expect(page.locator('#investmentDetail')).toBeVisible();
    await page.click('button:has-text("Назад")');
    await expect(page.locator('#investmentDetail')).toBeHidden();
    await expect(page.locator('#portfolioContent')).toBeVisible();
  });

  test('edit button opens form with data', async ({ page }) => {
    await mockAuth(page);
    await page.locator('.p-item').first().locator('.btn-delete:has-text("✎")').click();
    await expect(page.locator('#portfolioFormCard')).toBeVisible();
    await expect(page.locator('#pName')).toHaveValue('ОВДП тест');
    await expect(page.locator('#pRate')).toHaveValue('15');
  });

  test('delete removes item', async ({ page }) => {
    await mockAuth(page);
    const items = page.locator('.p-item');
    await expect(items).toHaveCount(2);
    page.on('dialog', dialog => dialog.accept());
    await page.locator('.p-item').first().locator('.btn-delete:has-text("✕")').click();
    await expect(items).toHaveCount(1);
  });

  test('new entry button shows form', async ({ page }) => {
    await mockAuth(page);
    await page.click('#btnTogglePortfolioForm');
    await expect(page.locator('#portfolioFormCard')).toBeVisible();
  });

  test('dashboard shows total value', async ({ page }) => {
    await mockAuth(page);
    const hero = page.locator('#dashTotalValue');
    await expect(hero).not.toHaveText('0 грн');
  });

  test('dashboard shows active count', async ({ page }) => {
    await mockAuth(page);
    const count = page.locator('#dashActiveCount');
    await expect(count).not.toHaveText('0');
  });
});

test.describe('Credit calculator (authenticated)', () => {
  test('credit section visible when logged in', async ({ page }) => {
    await mockAuth(page);
    await page.evaluate(() => {
      if (typeof updateCreditCalcVisibility === 'function') updateCreditCalcVisibility();
    });
    await page.click('.main-tab[onclick*="calc"]');
    await expect(page.locator('#creditCalcSection')).toBeVisible();
  });

  test('credit calculator computes', async ({ page }) => {
    await mockAuth(page);
    await page.evaluate(() => {
      if (typeof updateCreditCalcVisibility === 'function') updateCreditCalcVisibility();
    });
    await page.click('.main-tab[onclick*="calc"]');
    await page.fill('#creditAmount', '500000');
    await page.fill('#creditRate', '20');
    await page.fill('#creditMonths', '24');
    await page.click('button:has-text("Розрахувати кредит")');
    await expect(page.locator('#creditResults')).toBeVisible();
    await expect(page.locator('#creditMonthly')).not.toHaveText('0 грн');
  });
});
