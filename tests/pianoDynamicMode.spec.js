const { test, expect } = require('@playwright/test');

// Spy that counts every createBufferSource call and records all gain ramps.
// Installed before page load so the patched AudioContext is used from the start.
const installAudioSpy = async (page) => {
  await page.addInitScript(() => {
    window.__bufferSourceCount = 0;
    window.__ramps = [];
    const OrigContext = window.AudioContext || window.webkitAudioContext;
    window.AudioContext = function () {
      const ctx = new OrigContext();

      const origCreateBufferSource = ctx.createBufferSource.bind(ctx);
      ctx.createBufferSource = function () {
        window.__bufferSourceCount++;
        return origCreateBufferSource();
      };

      const origCreateGain = ctx.createGain.bind(ctx);
      ctx.createGain = function () {
        const g = origCreateGain();
        const origRamp = g.gain.linearRampToValueAtTime.bind(g.gain);
        g.gain.linearRampToValueAtTime = function (value, time) {
          window.__ramps.push({ value, time, currentTime: ctx.currentTime });
          return origRamp(value, time);
        };
        return g;
      };

      return ctx;
    };
  });
};

// Triggers the first variable slider's change event with a new value, which
// causes updatePianoBuffer() to run (throttled to ~100 ms intervals).
const changeFirstVariable = async (page, value) => {
  const valueInput = page.locator('.variable-control-group').first().locator('.variable-number-input');
  await valueInput.fill(String(value));
  await valueInput.dispatchEvent('change');
};

test.describe('Piano dynamic/frozen mode toggle', () => {

  test('toggle button is visible in piano telemetry and starts in Frozen state', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    await page.locator('#btn-piano-mode').click();
    await page.waitForTimeout(300);

    const btn = page.locator('#btn-piano-dynamic');
    await expect(btn).toBeVisible();
    await expect(btn).not.toHaveClass(/\sdynamic/);
    await expect(btn).toContainText('Frozen');
  });

  test('clicking the toggle switches between Frozen and Dynamic, then back', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    await page.locator('#btn-piano-mode').click();
    await page.waitForTimeout(300);

    const btn = page.locator('#btn-piano-dynamic');

    await btn.click();
    await expect(btn).toHaveClass(/\sdynamic/);
    await expect(btn).toContainText('Dynamic');

    await btn.click();
    await expect(btn).not.toHaveClass(/\sdynamic/);
    await expect(btn).toContainText('Frozen');
  });

  test('Frozen mode: changing a variable while a note is held does not create new buffer sources', async ({ page }) => {
    await installAudioSpy(page);
    await page.goto('/');
    await page.waitForTimeout(500);

    await page.locator('#btn-piano-mode').click();
    await page.waitForTimeout(300);

    // Confirm frozen mode is active (default)
    await expect(page.locator('#btn-piano-dynamic')).not.toHaveClass(/\sdynamic/);

    // Hold a key — one BufferSource is created for the note
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(100);

    const countAfterPress = await page.evaluate(() => window.__bufferSourceCount);
    expect(countAfterPress).toBeGreaterThanOrEqual(1);

    // Mutate a variable, triggering a new pianoBuffer generation
    await changeFirstVariable(page, 800);
    await page.waitForTimeout(400);

    const countAfterChange = await page.evaluate(() => window.__bufferSourceCount);

    // Frozen: no new sources created for the active note
    expect(countAfterChange).toBe(countAfterPress);

    await page.keyboard.up('KeyA');
  });

  test('Dynamic mode: changing a variable while a note is held creates a new buffer source', async ({ page }) => {
    await installAudioSpy(page);
    await page.goto('/');
    await page.waitForTimeout(500);

    await page.locator('#btn-piano-mode').click();
    await page.waitForTimeout(300);

    // Switch to dynamic mode
    await page.locator('#btn-piano-dynamic').click();
    await expect(page.locator('#btn-piano-dynamic')).toHaveClass(/\sdynamic/);

    // Hold a key
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(100);

    const countAfterPress = await page.evaluate(() => window.__bufferSourceCount);

    // Mutate a variable to trigger buffer regeneration + refreshActiveNotes
    await changeFirstVariable(page, 800);
    await page.waitForTimeout(400);

    const countAfterChange = await page.evaluate(() => window.__bufferSourceCount);

    // Dynamic: a replacement source must have been created for the held note
    expect(countAfterChange).toBeGreaterThan(countAfterPress);

    await page.keyboard.up('KeyA');
  });

  test('Dynamic mode: crossfade fires both a fade-in and a fade-out gain ramp on buffer refresh', async ({ page }) => {
    await installAudioSpy(page);
    await page.goto('/');
    await page.waitForTimeout(500);

    await page.locator('#btn-piano-mode').click();
    await page.waitForTimeout(300);

    await page.locator('#btn-piano-dynamic').click();

    // Hold a key, then clear the spy so only the crossfade ramps are captured
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(100);
    await page.evaluate(() => { window.__ramps = []; });

    // Trigger a buffer refresh
    await changeFirstVariable(page, 800);
    await page.waitForTimeout(400);

    const ramps = await page.evaluate(() => window.__ramps);

    // refreshActiveNotes: new source ramps to 1, old source ramps to 0
    const fadeIns  = ramps.filter(r => r.value === 1);
    const fadeOuts = ramps.filter(r => r.value === 0);

    expect(fadeIns.length).toBeGreaterThanOrEqual(1);
    expect(fadeOuts.length).toBeGreaterThanOrEqual(1);

    await page.keyboard.up('KeyA');
  });

  test('Frozen mode: state persists correctly after toggling Dynamic and back', async ({ page }) => {
    await installAudioSpy(page);
    await page.goto('/');
    await page.waitForTimeout(500);

    await page.locator('#btn-piano-mode').click();
    await page.waitForTimeout(300);

    const btn = page.locator('#btn-piano-dynamic');

    // Toggle to dynamic then back to frozen
    await btn.click();
    await btn.click();
    await expect(btn).not.toHaveClass(/\sdynamic/);

    // Hold a key
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(100);

    const countAfterPress = await page.evaluate(() => window.__bufferSourceCount);

    // Mutate variable — should not retrigger in frozen mode
    await changeFirstVariable(page, 800);
    await page.waitForTimeout(400);

    const countAfterChange = await page.evaluate(() => window.__bufferSourceCount);
    expect(countAfterChange).toBe(countAfterPress);

    await page.keyboard.up('KeyA');
  });

});
