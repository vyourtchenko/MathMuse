const { test, expect } = require('@playwright/test');

test.describe('Concurrent Variable Animations', () => {

  test('Both variable sliders animate simultaneously when both play buttons are activated', async ({ page }) => {
    await page.goto('/');
    // Wait for MathLive to parse the default equation and spawn variable sliders
    await page.waitForTimeout(600);

    // The default equation sin(a*x) + cos(b*x) should produce two variable groups: 'a' and 'b'
    const varGroups = page.locator('.variable-control-group');
    await expect(varGroups).toHaveCount(2);

    const varGroupA = varGroups.nth(0);
    const varGroupB = varGroups.nth(1);

    const valueInputA = varGroupA.locator('.variable-number-input');
    const valueInputB = varGroupB.locator('.variable-number-input');

    const playBtnA = varGroupA.locator('.btn-play-var');
    const playBtnB = varGroupB.locator('.btn-play-var');

    // Record initial values
    const initialA = await valueInputA.inputValue();
    const initialB = await valueInputB.inputValue();

    // Start animating variable A first
    await playBtnA.click();
    // Verify A's button visually shows pause (animating)
    await expect(playBtnA).toHaveClass(/playing/);

    // Give the animation loop a moment to start moving A
    await page.waitForTimeout(200);

    // Verify A has started moving
    const afterFirstClickA = await valueInputA.inputValue();
    expect(afterFirstClickA).not.toBe(initialA);

    // Now start animating variable B while A is still running
    await playBtnB.click();
    // Verify B's button also visually shows pause (animating)
    await expect(playBtnB).toHaveClass(/playing/);

    // Record B's value immediately after clicking play
    const bAtStart = await valueInputB.inputValue();

    // Wait for both animations to run concurrently
    await page.waitForTimeout(400);

    // Both values should have changed from where they were when B was activated
    const finalA = await valueInputA.inputValue();
    const finalB = await valueInputB.inputValue();

    // A should still be moving (different from when we last checked)
    expect(finalA).not.toBe(afterFirstClickA);

    // B MUST have moved — this is the actual bug assertion.
    // If B didn't animate, finalB will equal bAtStart.
    expect(finalB).not.toBe(bAtStart);

    // Verify both play buttons still show the playing/pause state
    await expect(playBtnA).toHaveClass(/playing/);
    await expect(playBtnB).toHaveClass(/playing/);
  });

  test('Rapid sequential activation of both sliders does not block the second', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(600);

    const varGroups = page.locator('.variable-control-group');
    const varGroupA = varGroups.nth(0);
    const varGroupB = varGroups.nth(1);

    const valueInputA = varGroupA.locator('.variable-number-input');
    const valueInputB = varGroupB.locator('.variable-number-input');

    const playBtnA = varGroupA.locator('.btn-play-var');
    const playBtnB = varGroupB.locator('.btn-play-var');

    // Click both play buttons in rapid succession with no wait between
    await playBtnA.click();
    await playBtnB.click();

    // Record values immediately after both are activated
    const aAfterClicks = await valueInputA.inputValue();
    const bAfterClicks = await valueInputB.inputValue();

    // Wait for animations to run
    await page.waitForTimeout(500);

    const finalA = await valueInputA.inputValue();
    const finalB = await valueInputB.inputValue();

    // Both must have moved
    expect(finalA).not.toBe(aAfterClicks);
    expect(finalB).not.toBe(bAfterClicks);

    // Both buttons must visually show playing state
    await expect(playBtnA).toHaveClass(/playing/);
    await expect(playBtnB).toHaveClass(/playing/);
  });

  test('Activating second slider after first has been running for a while', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(600);

    const varGroups = page.locator('.variable-control-group');
    const varGroupA = varGroups.nth(0);
    const varGroupB = varGroups.nth(1);

    const valueInputA = varGroupA.locator('.variable-number-input');
    const valueInputB = varGroupB.locator('.variable-number-input');

    const playBtnA = varGroupA.locator('.btn-play-var');
    const playBtnB = varGroupB.locator('.btn-play-var');

    // Start A and let it run for a full second
    await playBtnA.click();
    await page.waitForTimeout(1000);

    // Confirm A is happily animating
    const aBeforeB = await valueInputA.inputValue();
    await page.waitForTimeout(200);
    const aStillMoving = await valueInputA.inputValue();
    expect(aStillMoving).not.toBe(aBeforeB);

    // Now activate B
    await playBtnB.click();
    const bAtActivation = await valueInputB.inputValue();

    // Wait for B to have time to animate
    await page.waitForTimeout(500);

    const finalB = await valueInputB.inputValue();
    // B must have moved from its activation value
    expect(finalB).not.toBe(bAtActivation);

    // A must still be animating too (not frozen by B's activation)
    const finalA = await valueInputA.inputValue();
    expect(finalA).not.toBe(aStillMoving);
  });

  test('Second play button accepts a human-speed click while the first is animating', async ({ page }) => {
    // Playwright's default click completes mousedown+mouseup in <1ms, which is
    // why the other tests pass even when the bug is present. A real user takes
    // ~80ms between mousedown and mouseup — long enough for 5 animation frames
    // to fire and rewrite the button's <i> child, breaking the click.
    await page.goto('/');
    await page.waitForTimeout(600);

    const varGroups = page.locator('.variable-control-group');
    const varGroupA = varGroups.nth(0);
    const varGroupB = varGroups.nth(1);

    const valueInputB = varGroupB.locator('.variable-number-input');
    const playBtnA = varGroupA.locator('.btn-play-var');
    const playBtnB = varGroupB.locator('.btn-play-var');

    await playBtnA.click();
    await expect(playBtnA).toHaveClass(/playing/);
    await page.waitForTimeout(200);

    const bAtClick = await valueInputB.inputValue();

    // Human-speed click: 80ms between mousedown and mouseup spans ~5 animation
    // frames, reproducing the innerHTML-swap-kills-the-click bug.
    await playBtnB.click({ delay: 80 });

    await expect(playBtnB).toHaveClass(/playing/);

    await page.waitForTimeout(400);

    const finalB = await valueInputB.inputValue();
    expect(finalB).not.toBe(bAtClick);
  });

  test('Resuming a paused variable while another is still running', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(600);

    const varGroups = page.locator('.variable-control-group');
    const varGroupA = varGroups.nth(0);
    const varGroupB = varGroups.nth(1);

    const valueInputA = varGroupA.locator('.variable-number-input');
    const valueInputB = varGroupB.locator('.variable-number-input');

    const playBtnA = varGroupA.locator('.btn-play-var');
    const playBtnB = varGroupB.locator('.btn-play-var');

    // Start both
    await playBtnA.click();
    await playBtnB.click();
    await page.waitForTimeout(200);

    // Pause B while A is still running
    await playBtnB.click();
    await expect(playBtnB).not.toHaveClass(/playing/);

    // A must still be moving after B is paused
    const aBeforeResume = await valueInputA.inputValue();
    await page.waitForTimeout(200);
    const aAfterPause = await valueInputA.inputValue();
    expect(aAfterPause).not.toBe(aBeforeResume);

    // Capture B's value at the moment of resume
    const bAtResume = await valueInputB.inputValue();

    // Resume B while A is still running
    await playBtnB.click();
    await expect(playBtnB).toHaveClass(/playing/);

    // Wait for B to animate
    await page.waitForTimeout(400);

    const finalB = await valueInputB.inputValue();
    expect(finalB).not.toBe(bAtResume);

    // A must still be animating
    const finalA = await valueInputA.inputValue();
    expect(finalA).not.toBe(aAfterPause);
  });

});
