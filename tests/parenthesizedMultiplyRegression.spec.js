const { test, expect } = require('@playwright/test');

// Regression: when a user wraps the default expression in parens and prefixes
// a fresh variable like `d` (the natural way to add a new amplitude knob in the
// math field), MathLive emits ASCII-math that drops the multiplication symbol —
// e.g. `d(sin(a*x)+cos(b*x))`. mathjs then parses that as a function *call*
// rather than implicit multiplication, and parseAndDraw shows
// "Invalid mathematical expression." Even though the user wrote a perfectly
// well-formed product. This test should keep failing until the parsing layer
// treats `<identifier>(...)` as multiplication when the identifier is a free
// variable, not a known function.

test.describe('Parenthesized-multiplication regression', () => {
  test('Wrapping the default expression in parens and prefixing a variable parses as multiplication', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(600);

    // Sanity: default load shows two variables and no error.
    await expect(page.locator('#equation-error')).toHaveText('');
    await expect(page.locator('.variable-control-group')).toHaveCount(2);

    // What the user types: select the default formula, wrap it in parens, then
    // prefix `d`. MathLive renders this as `d \left(...\right)` (no \cdot).
    await page.evaluate(() => {
      const mf = document.getElementById('formula');
      mf.value = 'd \\left(\\sin(a \\cdot x) + \\cos(b \\cdot x)\\right)';
      mf.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.waitForTimeout(300);

    // The expression is mathematically valid — no error banner should appear.
    await expect(page.locator('#equation-error')).toHaveText('');

    // And `d` should join `a` and `b` as a third variable slider.
    await expect(page.locator('.variable-control-group')).toHaveCount(3);
    await expect(page.locator('.variable-header label', { hasText: 'd =' })).toBeVisible();
    await expect(page.locator('.variable-header label', { hasText: 'a =' })).toBeVisible();
    await expect(page.locator('.variable-header label', { hasText: 'b =' })).toBeVisible();
  });

  test('Bare-paren shape `d(...)` (no \\left/\\right, no \\cdot) is also accepted', async ({ page }) => {
    // Same root cause via a different MathLive output path: `d(sin(a*x)+...)`.
    await page.goto('/');
    await page.waitForTimeout(600);

    await page.evaluate(() => {
      const mf = document.getElementById('formula');
      mf.value = 'd(\\sin(a \\cdot x) + \\cos(b \\cdot x))';
      mf.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.waitForTimeout(300);

    await expect(page.locator('#equation-error')).toHaveText('');
    await expect(page.locator('.variable-control-group')).toHaveCount(3);
  });

  test('Explicit `d \\cdot (...)` continues to work (control case)', async ({ page }) => {
    // This shape has always worked — pinning it down so a future fix to the
    // implicit-multiply path can't regress the explicit-multiply path.
    await page.goto('/');
    await page.waitForTimeout(600);

    await page.evaluate(() => {
      const mf = document.getElementById('formula');
      mf.value = 'd \\cdot \\left(\\sin(a \\cdot x) + \\cos(b \\cdot x)\\right)';
      mf.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.waitForTimeout(300);

    await expect(page.locator('#equation-error')).toHaveText('');
    await expect(page.locator('.variable-control-group')).toHaveCount(3);
  });
});
