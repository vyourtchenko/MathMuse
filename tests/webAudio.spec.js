const { test, expect } = require('@playwright/test');

test.describe('Real-time Web Audio API Sonification', () => {
  test('Continuous Wavetable Mapping safely normalizes and clips audio math rendering', async ({ page }) => {
    // Inject spys before page load to catch audio execution inside the closed scope
    await page.addInitScript(() => {
      window.__capturedBuffers = [];
      const OrigContext = window.AudioContext || window.webkitAudioContext;
      
      // We overwrite the global constructor
      window.AudioContext = function() {
        const ctx = new OrigContext();
        const origCreateBuffer = ctx.createBuffer.bind(ctx);
        
        ctx.createBuffer = function(channels, length, sampleRate) {
          const buffer = origCreateBuffer(channels, length, sampleRate);
          window.__capturedBuffers.push(buffer);
          return buffer;
        };
        
        return ctx;
      };
    });

    await page.goto('/');
    
    // Wait for the math parsing to complete which evaluates the default formula 
    // \sin(a*x) + \cos(b*x). Since 'a' and 'b' default to large numbers natively, 
    // this will generate a highly dense buffer!
    await page.waitForTimeout(500);

    // Click play to physically force the Audio generation cycle to boot
    // NOTE: AudioContext requires user interaction to resume
    await page.locator('#btn-play').click();

    // Give it a moment to spawn the nodes
    await page.waitForTimeout(300);

    // Evaluate the captured buffer arrays natively inside the browser context
    const maxAmplitude = await page.evaluate(() => {
      if (window.__capturedBuffers.length === 0) return 0;
      
      const buffer = window.__capturedBuffers[0];
      const data = buffer.getChannelData(0); // Float32Array
      
      let maxAbs = 0;
      for (let i = 0; i < data.length; i++) {
         if (Math.abs(data[i]) > maxAbs) {
           maxAbs = Math.abs(data[i]);
         }
      }
      return maxAbs;
    });

    // The wavetable engine should explicitly normalize/clip all values so they never exceed 1.0
    // thus protecting the speaker hardware.
    expect(maxAmplitude).toBeLessThanOrEqual(1.0);
    // Since our formula defaults to sin(a*x) + cos(b*x) which can organically sum up to 2.0 natively, 
    // capturing a maxAbs > 0.0 mathematically ensures the buffer DID render actual math outputs.
    expect(maxAmplitude).toBeGreaterThan(0.0);
  });

  test('Audio fades attach linearly to hardware buffer crossover edges', async ({ page }) => {
     // verify the cosine fading directly inside the generated array buffer
     await page.addInitScript(() => {
      window.__capturedBuffers = [];
      const OrigContext = window.AudioContext || window.webkitAudioContext;
      window.AudioContext = function() {
        const ctx = new OrigContext();
        const origCreateBuffer = ctx.createBuffer.bind(ctx);
        ctx.createBuffer = function(c, l, s) {
          const buffer = origCreateBuffer(c, l, s);
          window.__capturedBuffers.push(buffer);
          return buffer;
        };
        return ctx;
      };
    });

    await page.goto('/');
    // Setting domain wide so there is definite wave data at the edges
    const xMinInput = page.locator('#x-min');
    await xMinInput.fill('0');
    // Hit play to trigger buffer generation
    await page.locator('#btn-play').click();
    await page.waitForTimeout(500);

    const edgeFadeAsserts = await page.evaluate(() => {
      if (window.__capturedBuffers.length === 0) return null;
      const data = window.__capturedBuffers[0].getChannelData(0);
      
      // Because we apply 40ms Hann-style cosine fades, the very first and very last 
      // array iterations strictly mathematically approach exactly 0.0
      return {
        firstValue: data[0],
        lastValue: data[data.length - 1]
      };
    });

    expect(edgeFadeAsserts).not.toBeNull();
    // Verify hardware crossover safety mathematically! 
    expect(Math.abs(edgeFadeAsserts.firstValue)).toBeCloseTo(0, 5);
    expect(Math.abs(edgeFadeAsserts.lastValue)).toBeCloseTo(0, 5);
  });
});
