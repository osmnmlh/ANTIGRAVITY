---
name: playwright-e2e
description: Write and run Playwright end-to-end tests for the web dashboard in web/, including a demo smoke test and screenshots. Use when adding tests, verifying a web feature works, or checking the demo flow before a merge.
---

# Playwright E2E (web/e2e/)

Few tests, high value: **the demo flow must never break.**

## Setup (once)

```bash
cd web && npm init playwright@latest -- --quiet --lang=ts --gha=false --browser=chromium
```

`web/playwright.config.ts` essentials:

```ts
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

## Tests to have (in this order)

1. `smoke.spec.ts`: dashboard loads, every indicator card visible, disclaimer visible.
2. `entry.spec.ts`: enter SpO2 = 88 → card shows red + guidance contains "flight surgeon".
3. `detail.spec.ts`: click a card → chart and guidance panel visible.

```ts
test('low SpO2 turns red', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('entry-type').selectOption('spo2');
  await page.getByTestId('entry-value').fill('88');
  await page.getByTestId('entry-submit').click();
  await expect(page.getByTestId('status-card-spo2')).toHaveAttribute('data-status', 'red');
});
```

## Rules

- Locators: `getByTestId` / `getByRole` only; no CSS chains, no `waitForTimeout`.
- Each test independent: clear `localStorage` in `beforeEach` if the app persists entries.
- Debug a failure: `npx playwright test --trace on` then `npx playwright show-trace`; or `--ui`.
- Screenshots for the submission: `await page.screenshot({ path: 'docs/screenshots/dashboard.png', fullPage: true })`.
- Run `npx playwright test` before merging any web PR; report the result in the PR.
