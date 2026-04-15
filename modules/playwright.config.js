const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '../tests',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:8081',
    headless: true,
  },
  webServer: {
    command: 'npx serve -l 8081 -s ..',
    cwd: __dirname,
    port: 8081,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
