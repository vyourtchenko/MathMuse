const { test, expect } = require('@playwright/test');

test.describe('Rich Mathematical Parsing Engine', () => {
  test('Correctly extracts custom variables from the default formula and applies assigned defaults', async ({ page }) => {
    await page.goto('/');

    // Wait for the MathLive field to initialize and app.js to perform initial AST parsing
    await page.waitForTimeout(500); 

    // The default formula uses 'a' and 'b'. Therefore, there should be exactly two control groups created.
    const controlGroups = page.locator('.variable-control-group');
    await expect(controlGroups).toHaveCount(2);

    // Assert that the explicit labels 'a =' and 'b =' exist
    const labelA = page.locator('.variable-header label', { hasText: 'a =' });
    const labelB = page.locator('.variable-header label', { hasText: 'b =' });
    
    await expect(labelA).toBeVisible();
    await expect(labelB).toBeVisible();

    // Assert the default values (779.30 and 764.00) were injected accurately based on our earlier config
    // We navigate from the label to its sibling input (`.variable-number-input`)
    const inputA = labelA.locator('..').locator('.variable-number-input');
    const inputB = labelB.locator('..').locator('.variable-number-input');

    await expect(inputA).toHaveValue('779.30');
    await expect(inputB).toHaveValue('764.00');
  });

  test('Dynamically updates variables when the math equation changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500); 

    // Directly assign a new math string into the custom `<math-field>` element and fire the standard input event
    // This perfectly mimics a user typing without having to battle Shadow DOM keystrokes
    await page.evaluate(() => {
      const mf = document.getElementById('formula');
      mf.value = 'z \\cdot x + q';
      mf.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // The parser should detect 'z' and 'q', completely dumping 'a' and 'b'
    const labelZ = page.locator('.variable-header label', { hasText: 'z =' });
    const labelQ = page.locator('.variable-header label', { hasText: 'q =' });
    const labelA = page.locator('.variable-header label', { hasText: 'a =' });

    await expect(labelZ).toBeVisible();
    await expect(labelQ).toBeVisible();
    await expect(labelA).toBeHidden(); 
    
    // They should default to the standard fallback size (1) since they aren't explicit custom cases
    const inputZ = labelZ.locator('..').locator('.variable-number-input');
    await expect(inputZ).toHaveValue('1.00');
  });
});
