# MathMuseSynth | Claude Developer Context Guide

This document is for Claude sessions working on **MathMuseSynth**. It covers project architecture, feature history, critical technical rules, and testing conventions.

## Project Summary

MathMuseSynth is a **vanilla HTML/CSS/JS** single-page app (no build step, no framework) that sonifies mathematical functions using the Web Audio API. Unlike Desmos (which maps Y-values to pitch), MathMuseSynth buffers the entire X→Y function evaluation directly as audio waveform amplitude. Open `index.html` in a browser — no server needed for development, though tests require `npm run serve` (port 3000).

**Stack:** MathLive (equation editor), Math.js (expression parsing/evaluation), HTML5 Canvas (waveform graph), Web Audio API (audio synthesis), Phosphor Icons (UI icons), Playwright (E2E tests).

---

## Core Architecture

- **Math input:** `<math-field>` (MathLive web component), value read as `ascii-math` and injected through `injectImplicitMultiplication()` before being parsed by Math.js into an AST, then compiled to `compiledMath`.
- **Visual graph:** Canvas drawn via `calculatePathPoints()` + `drawWaveform()`. Pan/zoom state lives in `viewState` (`xMin`, `xMax`, `yScale`, etc.). High-DPI handled in `resizeCanvas()` — always call `resizeCanvas()` before `drawWaveform()` when the canvas container changes size.
- **Audio engine:** `generateAudioBuffer()` evaluates the compiled math over the domain `[xMin, xMax]` at `44.1kHz`, normalizes the result to `[-1.0, 1.0]`, applies cosine fade-in/out, and returns an `AudioBuffer`. Normal playback uses a `BufferSourceNode` → `GainNode` (fade) → `GainNode` (master volume) → `destination` chain.
- **Dynamic variables:** Any symbol in the expression that isn't `x` or a math constant automatically becomes a slider in `customVariables` (`{ value, min, max, step, speed, mode, isAnimating }`). Always extract for evaluation via `getVariableScope()` — spreading `customVariables` directly crashes the math parser.

---

## Critical Implementation Rules

### 1. Never call audio generation in tight loops

Evaluating `compiledMath.evaluate()` ~220,500 times (5s at 44.1kHz) is synchronous and blocks the main thread. `generateAudioBuffer()` and `updateAudioLive()` are throttled to **~100ms intervals** via `lastAudioUpdate`. Do not remove this throttle or call these inside `requestAnimationFrame` or `mousemove` handlers without it.

### 2. Always crossfade audio to prevent hardware pops

Abrupt AudioBuffer starts/stops cause audible speaker clicks at non-zero sample values.
- `generateAudioBuffer()` applies 40ms Hann-style cosine fades to the start and end of every buffer.
- Piano note attack uses `linearRampToValueAtTime(1, now + 0.05)` (50ms); release uses `linearRampToValueAtTime(0, now + 0.1)` (100ms).
- Piano dynamic-mode crossfades (when `refreshActiveNotes()` swaps buffers) use a 20ms ramp (`XFADE = 0.02`).

### 3. Piano Mode state model

- `pianoBuffer` — the current base waveform buffer, shared by all notes. Regenerated any time the expression or variables change while piano mode is active.
- `activeNotes[keyCode]` — `{ source, envGain, semitone }`. The `semitone` field is essential for `refreshActiveNotes()` to re-pitch the replacement source correctly.
- `AudioBufferSourceNode.buffer` cannot be hot-swapped after `.start()`. New waveforms take effect only on the next key press (frozen mode) or via a full source replacement crossfade (dynamic mode).
- `pianoDynamicMode` — when true, every `updatePianoBuffer()` call also invokes `refreshActiveNotes()`, crossfading all held notes to the new buffer.
- `updatePianoBuffer()` is the single entry point for regenerating `pianoBuffer`. All variable-change and expression-change handlers route through it (not the old `generateAudioBuffer().then(b => pianoBuffer = b)` pattern).

### 4. Canvas sizing

`resizeCanvas()` reads `canvas.parentElement.getBoundingClientRect()`, sets `canvas.width/height` at device pixel ratio, and re-applies `ctx.scale(DPR, DPR)`. It must be called whenever the canvas container changes dimensions — including on sidebar resize drags (currently called every `mousemove` during drag) and on piano mode toggle (which changes the container height).

### 5. Variable scoping

Always use `getVariableScope()` to build the math evaluation scope. Direct spread of `customVariables` will crash because each entry is a config object, not a plain number.

### 6. Aesthetics

- CSS custom properties (`var(--primary)`, `var(--accent)`, `var(--text-muted)`, etc.) for all colours — never hardcode hex values.
- Phosphor Icons loaded from CDN via `<script>` tag. Use `ph-` prefix classes (`ph-fill ph-piano-keys`, `ph ph-snowflake`, etc.).
- No build pipeline, no framework, no TypeScript. Keep everything in `app.js`, `styles.css`, `index.html`.

---

## Layout

```
.split-layout (flex row)
  ├── aside.sidebar          ← fixed-width left panel (resizable via drag handle)
  ├── div.resize-handle      ← 5px drag strip; dragging calls resizeCanvas()+drawWaveform() live
  └── main.main-graph        ← flex:1, holds canvas, piano keyboard, playback controls
```

The sidebar has `min-width: 320px` and is capped at 70vw by the JS drag handler. Width is set via inline style during drag; `parseAndDraw()` is called on mouseup.

---

## Feature Reference

| Feature | Key code locations |
|---|---|
| Math parsing / draw | `parseAndDraw()`, `calculatePathPoints()`, `drawWaveform()` |
| Audio playback | `playAudio()`, `stopAudio()`, `generateAudioBuffer()`, `updateAudioLive()` |
| Dynamic variables | `extractVariables()`, `renderVariableSliders()`, `variableAnimationLoop()` |
| Piano mode | `togglePianoMode()`, `playNote()`, `releaseNote()`, `refreshActiveNotes()`, `updatePianoBuffer()` |
| Piano dynamic/frozen toggle | `pianoDynamicMode` flag, `#btn-piano-dynamic`, `refreshActiveNotes()` |
| Sidebar resize | `#sidebar-resize-handle`, mousemove handler at bottom of `DOMContentLoaded` |
| Canvas resize | `resizeCanvas()` — called at init, window resize, piano toggle, and sidebar drag |

---

## Testing

Tests live in `tests/` and run with `npm test` (Playwright, Chromium only). The dev server (`npm run serve`, port 3000) must be running or Playwright will start it automatically via `webServer` config.

**Patterns used across the test suite:**

- **Audio spying:** Override `window.AudioContext` in `addInitScript()` to patch `createBuffer`, `createBufferSource`, `createGain`, and `linearRampToValueAtTime` before the app loads.
- **Class assertions with multiple classes:** Use `/\sdynamic/` style regex (space-prefixed) when the toggle class shares a substring with a permanent base class (e.g. `btn-piano-dynamic` vs the added `dynamic`). Avoid plain `/word/` regexes in that situation.
- **Variable change simulation:** Fill `.variable-number-input`, then `dispatchEvent('change')`. Buffer regeneration is throttled to ~100ms, so wait ≥ 400ms before asserting audio state changes.
- **Pointer events:** Dispatch synthetic `PointerEvent` with explicit `pointerId` for multi-touch tests; call `setPointerCapture` in app code so pointerup outside the key still fires.

**Test files:**
- `basic.spec.js` — page load, initial state
- `mathParsing.spec.js` — expression parsing and error handling
- `canvasGraphing.spec.js` — graph rendering
- `webAudio.spec.js` — buffer generation, playback
- `dynamicVariables.spec.js` — slider/animation variable system
- `pianoMode.spec.js` — polyphony, ADSR envelopes, buffer regeneration on variable change
- `pianoPointerInput.spec.js` — mouse/touch pointer input, mobile viewport, volume-slider regression
- `pianoDynamicMode.spec.js` — frozen/dynamic toggle: button state, retrigger behaviour, crossfade ramps
- `concurrentAnimations.spec.js` — concurrent variable animations
- `parenthesizedMultiplyRegression.spec.js` — implicit multiplication edge cases
- `wavExport.spec.js` — WAV download
