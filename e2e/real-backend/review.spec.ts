/**
 * REAL-BACKEND E2E — spaced-repetition Review loop.
 *
 * A fresh E2E backend has no scheduled cards, so the Review page must render the
 * "all caught up" empty state (and the route + sidebar wiring must work). The
 * interactive grade flow is covered by the component test (ReviewPage.test.tsx)
 * and the backend due-loop integration tests, which don't need a time-travelled
 * due card.
 */

import { test, expect } from '@playwright/test'

test.describe('Review loop (real backend)', () => {
  test('shows the caught-up empty state when nothing is due', async ({ page }) => {
    await page.goto('/#/review')
    await expect(page.locator('[data-testid="review-empty"]')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/all caught up/i)).toBeVisible()
  })
})
