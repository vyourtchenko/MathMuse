const { test, expect } = require('@playwright/test');

test.describe('Polyphonic Piano Mode Synthesizer', () => {

  test('Piano mode halts playback and triggers precise ADSR envelopes via internal GainNodes', async ({ page }) => {
    // Inject audio spy capturing gain nodes and linear ramps for volume shaping
    await page.addInitScript(() => {
      window.__gains = [];
      window.__ramps = [];
      const OrigContext = window.AudioContext || window.webkitAudioContext;
      window.AudioContext = function() {
        const ctx = new OrigContext();
        const origCreateGain = ctx.createGain.bind(ctx);
        ctx.createGain = function() {
          const gainNode = origCreateGain();
          window.__gains.push(gainNode);
          
          const origRamp = gainNode.gain.linearRampToValueAtTime.bind(gainNode.gain);
          gainNode.gain.linearRampToValueAtTime = function(value, time) {
             window.__ramps.push({ value, time, currentTime: ctx.currentTime });
             return origRamp(value, time);
          };
          return gainNode;
        };
        return ctx;
      };
    });

    await page.goto('/');
    await page.waitForTimeout(500);

    // Hit standard play natively
    const playBtn = page.locator('#btn-play');
    await playBtn.click();
    
    // Assert it is actively playing by checking mathmuse HTML state string
    await expect(playBtn).toContainText('Pause');

    const pianoBtn = page.locator('#btn-piano-mode');
    await pianoBtn.click();

    // Verify Piano activation securely halted standard playback
    await expect(playBtn).toContainText('Play');
    await expect(pianoBtn).toContainText('Exit Piano Mode');
    
    // Polyphonic Key press to trigger attack envelope!
    await page.keyboard.press('KeyA');
    await page.waitForTimeout(100);

    const attackRamps = await page.evaluate(() => window.__ramps.filter(r => r.value === 1));
    // Verify an attack ramp strictly fired (volume mathematically approaching 1.0)
    expect(attackRamps.length).toBeGreaterThanOrEqual(1);

    // Verify the math shaping limit computationally
    // Hardware popping rules require a 50ms attack fade. 
    // The precise explicit math passed dynamically natively was { currentTime + 0.05 }
    const attack = attackRamps[attackRamps.length - 1];
    expect(attack.time - attack.currentTime).toBeCloseTo(0.05, 2);

    // Release key sequentially triggering release envelope natively bounded
    await page.keyboard.up('KeyA');
    await page.waitForTimeout(100);

    const releaseRamps = await page.evaluate(() => window.__ramps.filter(r => r.value === 0));
    // Verify mathematical bounds applied pushing envelope to perfectly 0.0 sound output
    expect(releaseRamps.length).toBeGreaterThanOrEqual(1);

    const release = releaseRamps[releaseRamps.length - 1];
    expect(release.time - release.currentTime).toBeCloseTo(0.1, 2);
  });

  test('Variable Timbre Bending dynamically regenerates underlying piano audio buffer asynchronously', async ({ page }) => {
    // Inject audio spy tracking createBuffer calls sequentially
    await page.addInitScript(() => {
      window.__buffersCreated = 0;
      const OrigContext = window.AudioContext || window.webkitAudioContext;
      window.AudioContext = function() {
        const ctx = new OrigContext();
        const origCreateBuffer = ctx.createBuffer.bind(ctx);
        ctx.createBuffer = function(channels, length, sampleRate) {
          window.__buffersCreated++;
          return origCreateBuffer(channels, length, sampleRate);
        };
        return ctx;
      };
    });

    await page.goto('/');
    await page.waitForTimeout(500);

    const pianoBtn = page.locator('#btn-piano-mode');
    await pianoBtn.click();
    
    // Pause to grant audio thread generation time roughly mapping heavy equations
    await page.waitForTimeout(300);

    // Initial buffer tracked
    const initialBufferCount = await page.evaluate(() => window.__buffersCreated);

    // Mutate the mathematical system logically dragging a GUI domain value drastically
    const varGroupA = page.locator('.variable-control-group').first();
    const valueInput = varGroupA.locator('.variable-number-input');

    await valueInput.fill('800');
    await valueInput.dispatchEvent('change'); 
    
    // Yield execution allowing JS logic throttle tracking (100ms internal delta limit boundary)
    await page.waitForTimeout(400);

    const secondaryBufferCount = await page.evaluate(() => window.__buffersCreated);

    // Verify natively the system explicitly instantiated a totally new buffer without a manually re-trigger explicitly
    expect(secondaryBufferCount).toBeGreaterThan(initialBufferCount);
  });
});
