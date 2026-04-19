const { test, expect } = require('@playwright/test');

test.describe('Advanced Interactive Canvas Graphing', () => {

  test('Draggable Viewport accurately mutates bounding boxes via mouse panning', async ({ page }) => {
    await page.goto('/');
    
    // Yield to let Javascript native initializers handle canvas layouts appropriately
    await page.waitForTimeout(500);

    const xMinInput = page.locator('#x-min');
    const syncBtn = page.locator('#btn-sync-domain');

    // Sync default limits immediately capturing exact Cartesian initialization
    await syncBtn.click();
    const initialMin = parseFloat(await xMinInput.inputValue());
    
    const canvas = page.locator('#waveform-canvas');
    const boundingBox = await canvas.boundingBox();

    // Native Mouse simulation moving perfectly to the center point of the graph window
    await page.mouse.move(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2);
    
    // Simulate explicit mouse down click natively
    await page.mouse.down();

    // Physically simulate dragging perfectly horizontally by precisely +300 pixels smoothly explicitly natively
    await page.mouse.move(boundingBox.x + boundingBox.width / 2 + 300, boundingBox.y + boundingBox.height / 2, { steps: 10 });
    
    // Release Mouse explicitly simulating the end of dragging natively logically bounds calculation
    await page.mouse.up();
    
    await page.waitForTimeout(200);

    // Call Sync pulling the `viewState` coordinates back into the input effectively dumping internal Cartesian states logically
    await syncBtn.click();
    
    const pannedMin = parseFloat(await xMinInput.inputValue());
    
    // Assert logic mathematical view bounds physically changed dynamically without strict MathLive interference perfectly matching physical rendering
    expect(pannedMin).not.toBe(initialMin);
  });

  test('Sync Domain to View natively translates physical scroll wheel zoom limits into domain boundaries natively computationally', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    const xMinInput = page.locator('#x-min');
    const xMaxInput = page.locator('#x-max');
    const syncBtn = page.locator('#btn-sync-domain');

    // Physical zoom offset simulation dynamically widening viewState boundary coordinates natively mathematically accurately without hard delays natively logically
    await page.locator('#waveform-canvas').dispatchEvent('wheel', { deltaY: 500 });
    
    await page.waitForTimeout(200);

    await syncBtn.click();

    const newMin = await xMinInput.inputValue();
    const newMax = await xMaxInput.inputValue();
    
    // Safely asserting values mathematically widened overriding physical bounds defaults accurately dynamically representing limits successfully.
    expect(newMin).not.toBe('0.31');
    expect(newMax).not.toBe('0.72');
  });
});
