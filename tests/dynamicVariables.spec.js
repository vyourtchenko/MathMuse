const { test, expect } = require('@playwright/test');

test.describe('Intelligent Dynamic Variables', () => {
    
  test('Mutating domain boundaries securely clamps manually inputted values', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the AST MathLive processing to finish generating the variable controllers
    await page.waitForTimeout(500);

    // Target the first variable ('a') dynamically generated from the default \sin(a*x) function
    const varGroupA = page.locator('.variable-control-group').first();
    
    // Overwrite the Max boundary to '500' programmatically representing user configuration
    const maxInput = varGroupA.locator('.variable-settings label:has-text("Max") input');
    await maxInput.fill('500');
    await maxInput.dispatchEvent('change');
    
    // Attempt an out-of-bounds mutation by pushing '9999' natively into the variable's value field
    const valueInput = varGroupA.locator('.variable-number-input');
    await valueInput.fill('9999');
    
    // Fire 'change' event. This triggers `updateVar(newVal)` inside app.js 
    // which mathematically evaluates Math.min(Math.max(...)) for hard clamping.
    await valueInput.dispatchEvent('change'); 
    
    // Validate the clamping algorithm securely constrained our input dynamically limiting it strictly to 500
    await expect(valueInput).toHaveValue('500.00');
  });

  test('Animation system dynamically loops and increments variables automatically via requestAnimationFrame', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    // Target the first variable 'a'
    const varGroupA = page.locator('.variable-control-group').first();
    
    const valueInput = varGroupA.locator('.variable-number-input');
    
    // Ensure the default mode dropdown accurately parses to 'oscillate'
    const modeSelect = varGroupA.locator('select[title="Animation Mode"]');
    await expect(modeSelect).toHaveValue('oscillate');
    
    // Speed modifiers are strictly parsed automatically
    const speedInput = varGroupA.locator('input[title="Speed multiplier (e.g. 1, 2, 0.5)"]');
    await expect(speedInput).toHaveValue('1');
    
    // Start with a reliable base line state
    const startValue = await valueInput.inputValue();
    
    // Trigger the Animation Loop explicitly
    const playBtn = varGroupA.locator('.btn-play-var');
    await playBtn.click();
    
    // Give the browser 300ms to execute roughly 18 loops of native `requestAnimationFrame` iterations
    await page.waitForTimeout(300);
    
    // The native value input should have mathematically climbed automatically
    const playingValue = await valueInput.inputValue();
    expect(playingValue).not.toBe(startValue);
    
    // Pause the animation accurately
    await playBtn.click();
    
    // Grab the exact frame paused position
    const pausedValue = await valueInput.inputValue();
    
    // Wait explicitly again to verify mutation halted securely
    await page.waitForTimeout(200);
    expect(await valueInput.inputValue()).toBe(pausedValue);
  });
});
