const { test, expect, devices } = require('@playwright/test');

// Audio spy: captures every linearRampToValueAtTime call so we can assert
// attack/release envelopes actually fire when a key is pressed/released.
const installAudioSpy = async (page) => {
  await page.addInitScript(() => {
    window.__ramps = [];
    const OrigContext = window.AudioContext || window.webkitAudioContext;
    window.AudioContext = function () {
      const ctx = new OrigContext();
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

test.describe('Piano pointer input (mouse + touch)', () => {
  test('Mouse click on a piano key plays the note and shows active state', async ({ page }) => {
    await installAudioSpy(page);
    await page.goto('/');
    await page.waitForTimeout(500);

    await page.locator('#btn-piano-mode').click();
    await page.waitForTimeout(300);

    const keyA = page.locator('.piano-key[data-key="KeyA"]');
    const box = await keyA.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();

    await expect(keyA).toHaveClass(/active/);
    await expect(page.locator('#piano-telemetry-mult')).toContainText('1.00 x');

    await page.waitForTimeout(80);
    const attackRamps = await page.evaluate(() => window.__ramps.filter(r => r.value === 1));
    expect(attackRamps.length).toBeGreaterThanOrEqual(1);

    await page.mouse.up();

    await expect(keyA).not.toHaveClass(/active/);

    await page.waitForTimeout(80);
    const releaseRamps = await page.evaluate(() => window.__ramps.filter(r => r.value === 0));
    expect(releaseRamps.length).toBeGreaterThanOrEqual(1);
  });

  test('Releasing a key shows the correct pitch when a black key is pressed', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    await page.locator('#btn-piano-mode').click();
    await page.waitForTimeout(300);

    const keyW = page.locator('.piano-key[data-key="KeyW"]');
    const box = await keyW.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();

    await expect(keyW).toHaveClass(/active/);
    // KeyW is semitone 1 → 2^(1/12) ≈ 1.06
    await expect(page.locator('#piano-telemetry-mult')).toContainText('1.06 x');

    await page.mouse.up();
    await expect(keyW).not.toHaveClass(/active/);
  });

  test('Multi-touch polyphony: simultaneous pointers each play and release independently', async ({ page }) => {
    // Playwright's public API has no multi-finger touchscreen helper, so we
    // dispatch synthetic PointerEvents with distinct pointerIds — the same
    // events a real multi-touch device would produce.
    await page.goto('/');
    await page.waitForTimeout(500);

    await page.locator('#btn-piano-mode').click();
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      window.__fire = (selector, type, id) => {
        const el = document.querySelector(selector);
        el.dispatchEvent(new PointerEvent(type, {
          pointerId: id,
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          isPrimary: id === 1,
        }));
      };
      window.__fire('.piano-key[data-key="KeyA"]', 'pointerdown', 1);
      window.__fire('.piano-key[data-key="KeyD"]', 'pointerdown', 2);
      window.__fire('.piano-key[data-key="KeyG"]', 'pointerdown', 3);
    });

    const keyA = page.locator('.piano-key[data-key="KeyA"]');
    const keyD = page.locator('.piano-key[data-key="KeyD"]');
    const keyG = page.locator('.piano-key[data-key="KeyG"]');

    await expect(keyA).toHaveClass(/active/);
    await expect(keyD).toHaveClass(/active/);
    await expect(keyG).toHaveClass(/active/);

    // Verify all three notes are live in activeNotes
    const activeCount = await page.evaluate(() => {
      // Not directly exposed, so count DOM active keys as a proxy. The real
      // invariant (each pointerId owns a distinct note) is exercised below
      // by releasing one pointer and asserting the others survive.
      return document.querySelectorAll('.piano-key.active').length;
    });
    expect(activeCount).toBe(3);

    // Release only pointer 2 (on KeyD). KeyA and KeyG must survive.
    await page.evaluate(() => {
      window.__fire('.piano-key[data-key="KeyD"]', 'pointerup', 2);
    });

    await expect(keyD).not.toHaveClass(/active/);
    await expect(keyA).toHaveClass(/active/);
    await expect(keyG).toHaveClass(/active/);

    await page.evaluate(() => {
      window.__fire('.piano-key[data-key="KeyA"]', 'pointerup', 1);
      window.__fire('.piano-key[data-key="KeyG"]', 'pointerup', 3);
    });

    await expect(keyA).not.toHaveClass(/active/);
    await expect(keyG).not.toHaveClass(/active/);
  });

  test('pointercancel releases the note (e.g. browser reclaims the gesture)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    await page.locator('#btn-piano-mode').click();
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const keyA = document.querySelector('.piano-key[data-key="KeyA"]');
      keyA.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 7, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true,
      }));
    });

    const keyA = page.locator('.piano-key[data-key="KeyA"]');
    await expect(keyA).toHaveClass(/active/);

    await page.evaluate(() => {
      const keyA = document.querySelector('.piano-key[data-key="KeyA"]');
      keyA.dispatchEvent(new PointerEvent('pointercancel', {
        pointerId: 7, bubbles: true, cancelable: true, pointerType: 'touch',
      }));
    });

    await expect(keyA).not.toHaveClass(/active/);
  });
});

test.describe('Piano pointer input on mobile viewport', () => {
  // Mobile viewport + hasTouch without switching defaultBrowserType — the
  // latter isn't allowed inside a describe block. This still exercises
  // touch-event paths via dispatched PointerEvents.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Tapping a piano key on a mobile viewport activates the note', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    await page.locator('#btn-piano-mode').tap();
    await page.waitForTimeout(300);

    const keyA = page.locator('.piano-key[data-key="KeyA"]');

    // Dispatch a press/release pair; tap() is instantaneous and we want to
    // observe the held state.
    await page.evaluate(() => {
      const keyA = document.querySelector('.piano-key[data-key="KeyA"]');
      keyA.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true,
      }));
    });

    await expect(keyA).toHaveClass(/active/);

    await page.evaluate(() => {
      const keyA = document.querySelector('.piano-key[data-key="KeyA"]');
      keyA.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 1, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true,
      }));
    });

    await expect(keyA).not.toHaveClass(/active/);
  });
});
