# Windows Lite x64 Minimal Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Windows x64`-only release path that prunes `arm64` Windows runtime artifacts from the current `windows-lite` package.

**Architecture:** Keep the existing `release/windows-lite` output structure and release pipeline, but make the prune/verify manifest architecture-aware through a shared target selector. Expose the new behavior through a dedicated npm script so the current generic workflow keeps working.

**Tech Stack:** Node.js ESM scripts, npm scripts, node:test

---

### Task 1: Add failing tests for x64-specific pruning

**Files:**
- Modify: `scripts/windows-lite-optimization.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('windows-lite x64 prune targets remove Windows arm64 ripgrep vendor', () => {
  const ripgrepTargets = getWindowsLitePruneTargets('x64').filter((target) =>
    target.includes('@anthropic-ai/claude-agent-sdk/vendor/ripgrep/')
  );

  assert.ok(
    ripgrepTargets.includes('node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/arm64-win32')
  );
  assert.ok(
    !ripgrepTargets.includes('node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/x64-win32')
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/windows-lite-optimization.test.mjs`
Expected: FAIL because `getWindowsLitePruneTargets` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
function getWindowsLitePruneTargets(targetArch = 'universal') {
  // return shared defaults plus arch-specific prune targets
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/windows-lite-optimization.test.mjs`
Expected: PASS

### Task 2: Wire the x64 target through release scripts

**Files:**
- Modify: `scripts/windows-lite-optimization.mjs`
- Modify: `scripts/release-manifest.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

```js
test('release:windows-lite:x64 script is defined', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  assert.equal(typeof packageJson.scripts['release:windows-lite:x64'], 'string');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/build-release.test.mjs`
Expected: FAIL because the script entry does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
const WINDOWS_LITE_TARGET_ARCH = process.env.WINDOWS_LITE_TARGET_ARCH ?? 'universal';
const PRUNE_TARGETS = getWindowsLitePruneTargets(WINDOWS_LITE_TARGET_ARCH);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/build-release.test.mjs`
Expected: PASS

### Task 3: Document the x64-only workflow

**Files:**
- Modify: `release/windows-lite/windows-lite/README.zh-CN.md`

- [ ] **Step 1: Add the new x64 build command**

```md
如果只需要 Windows x64，可以执行：

```bash
npm run build
npm run release:windows-lite:x64
```
```

- [ ] **Step 2: Verify the documentation matches the script names**

Run: `rg -n "release:windows-lite:x64|WINDOWS x64|x64" release/windows-lite/windows-lite/README.zh-CN.md package.json scripts`
Expected: the new script name and x64 scope appear consistently.

### Task 4: Verify the end-to-end x64 release output

**Files:**
- No source changes required

- [ ] **Step 1: Run the focused script tests**

Run: `node --test scripts/windows-lite-optimization.test.mjs scripts/build-release.test.mjs`
Expected: PASS

- [ ] **Step 2: Run the x64 release pipeline**

Run: `npm run release:windows-lite:x64`
Expected: PASS with `release verification passed`

- [ ] **Step 3: Measure the result**

Run: `du -sh release/windows-lite && cd release/windows-lite && zip -qr /tmp/windows-lite-x64.zip . && du -sh /tmp/windows-lite-x64.zip`
Expected: package is smaller than the current generic Windows Lite output.
