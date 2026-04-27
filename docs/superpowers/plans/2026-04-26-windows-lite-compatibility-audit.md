# Windows Lite Compatibility Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirm whether the current project can still ship with the existing Windows Lite lightweight release flow after the recent architecture refactor.

**Architecture:** Keep the current Windows Lite release model unchanged and perform a layered audit against the live repository. First verify architecture assumptions and release-script assumptions statically, then execute the existing test and release pipeline, and finally record a green/yellow/red conclusion in a dedicated audit report.

**Tech Stack:** Node.js, npm scripts, Vite, Express, Windows Lite release scripts, Markdown documentation

---

### Task 1: Create the audit report skeleton

**Files:**
- Create: `docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md`

- [ ] **Step 1: Create the report file with the required structure**

````md
# Windows Lite Compatibility Audit Report

**Date:** 2026-04-26
**Scope:** Confirm whether the existing Windows Lite lightweight release flow still works after the recent refactor.
**Spec:** `docs/superpowers/specs/2026-04-26-windows-lite-compatibility-audit-design.md`
**Plan:** `docs/superpowers/plans/2026-04-26-windows-lite-compatibility-audit.md`

## Final Status

`NOT ASSESSED YET`

## Layer 1: Architecture Assumptions

### Checks

- Audit has not been executed yet.

### Findings

- No findings recorded yet.

## Layer 2: Release Script Assumptions

### Checks

- Audit has not been executed yet.

### Findings

- No findings recorded yet.

## Layer 3: Executed Validation

### Commands

```bash
node --test scripts/windows-lite-optimization.test.mjs scripts/build-release.test.mjs
npm run release:windows-lite:x64
find release/windows-lite -maxdepth 2 \( -name dist -o -name server -o -name shared -o -name node_modules -o -name start.cmd -o -name start.vbs -o -name README.zh-CN.md \) | sort
```

### Results

- No validation results recorded yet.

## Conclusion

- Status: `NOT ASSESSED YET`
- Summary: Audit execution has not been completed yet.
- Required follow-up: Run the layered audit and replace this section with the final outcome.
````

- [ ] **Step 2: Verify the report file exists**

Run: `test -f docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md && echo ok`
Expected: `ok`

- [ ] **Step 3: Commit the report skeleton**

```bash
git add docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md
git commit -m "docs: add windows lite audit report skeleton"
```

### Task 2: Audit architecture assumptions

**Files:**
- Modify: `docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md`

- [ ] **Step 1: Capture the current architecture evidence**

Run: `sed -n '1,260p' server/index.js && printf '\n---\n' && sed -n '1,220p' vite.config.js && printf '\n---\n' && sed -n '1,220p' windows-lite/start.cmd && printf '\n---\n' && sed -n '1,220p' windows-lite/README.zh-CN.md`
Expected: output shows `server/index.js` remains the runtime entry, `vite build` outputs `dist`, `start.cmd` still launches `node server\\index.js`, and the README still documents the browser-based local service flow.

- [ ] **Step 2: Write the architecture layer findings into the report**

```md
## Layer 1: Architecture Assumptions

### Checks

- Verified that `server/index.js` remains the runtime entry used by the lightweight package.
- Verified that `vite.config.js` still builds to `dist`.
- Verified that `windows-lite/start.cmd` still expects `dist/index.html`, launches `node server\index.js`, writes logs to `logs/server.log`, and probes `http://127.0.0.1:3001/`.
- Verified that `windows-lite/README.zh-CN.md` still describes the same launch model: double-click script, local Node service, browser access.

### Findings

- `PASS` if all four assumptions still match the current codebase.
- `FAIL` if any runtime entry, build output path, launch path, log path, or probe URL has drifted.
```

- [ ] **Step 3: Verify the architecture section was written**

Run: `rg -n "Layer 1: Architecture Assumptions|server/index.js|dist/index.html|127.0.0.1:3001" docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md`
Expected: matching lines for the Layer 1 heading and the key assumptions.

- [ ] **Step 4: Commit the architecture audit**

```bash
git add docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md
git commit -m "docs: record windows lite architecture audit"
```

### Task 3: Audit release script assumptions

**Files:**
- Modify: `docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md`

- [ ] **Step 1: Capture the release-script evidence**

Run: `sed -n '1,260p' scripts/build-release.mjs && printf '\n---\n' && sed -n '1,220p' scripts/release-manifest.mjs && printf '\n---\n' && sed -n '1,220p' scripts/prune-release-node-modules.mjs && printf '\n---\n' && sed -n '1,260p' scripts/verify-release.mjs && printf '\n---\n' && sed -n '1,220p' package.json`
Expected: output shows the copy list, required paths, dependency whitelist, prune targets, verification checks, and `release:windows-lite:x64` script currently used by the project.

- [ ] **Step 2: Write the release-script layer findings into the report**

```md
## Layer 2: Release Script Assumptions

### Checks

- Verified that `scripts/build-release.mjs` still copies the runtime package set: `dist`, `server`, `shared`, `package.json`, `package-lock.json`, plus `windows-lite/` launch files.
- Verified that `scripts/release-manifest.mjs` still defines the required runtime paths and dependency whitelist used by verification.
- Verified that `scripts/prune-release-node-modules.mjs` and `scripts/windows-lite-optimization.mjs` still prune optional assets and non-target binaries rather than current runtime requirements.
- Verified that `scripts/verify-release.mjs` still checks for the paths and dependencies required by the current Windows Lite package.
- Verified that `package.json` still exposes the supported release scripts, especially `release:windows-lite:x64`.

### Findings

- `PASS` if the script assumptions still match the current repository layout and runtime dependency model.
- `FAIL` if a required runtime path, dependency, or script entry has drifted from the current architecture.
```

- [ ] **Step 3: Verify the release-script section was written**

Run: `rg -n "Layer 2: Release Script Assumptions|build-release.mjs|release-manifest.mjs|release:windows-lite:x64" docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md`
Expected: matching lines for the Layer 2 heading and the key script references.

- [ ] **Step 4: Commit the release-script audit**

```bash
git add docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md
git commit -m "docs: record windows lite release script audit"
```

### Task 4: Run the existing validation pipeline

**Files:**
- Modify: `docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md`

- [ ] **Step 1: Run the focused Windows Lite tests**

Run: `node --test scripts/windows-lite-optimization.test.mjs scripts/build-release.test.mjs`
Expected: PASS

- [ ] **Step 2: Run the x64 Windows Lite release pipeline**

Run: `npm run release:windows-lite:x64`
Expected: output ends with `release verification passed`

- [ ] **Step 3: Inspect the generated package layout**

Run: `find release/windows-lite -maxdepth 2 \\( -name dist -o -name server -o -name shared -o -name node_modules -o -name start.cmd -o -name start.vbs -o -name README.zh-CN.md \\) | sort`
Expected: output lists the runtime directories and launch/readme files at `release/windows-lite/`.

- [ ] **Step 4: Record the executed validation results in the report**

````md
## Layer 3: Executed Validation

### Commands

```bash
node --test scripts/windows-lite-optimization.test.mjs scripts/build-release.test.mjs
npm run release:windows-lite:x64
find release/windows-lite -maxdepth 2 \( -name dist -o -name server -o -name shared -o -name node_modules -o -name start.cmd -o -name start.vbs -o -name README.zh-CN.md \) | sort
```

### Results

- Record whether the focused tests passed.
- Record whether `npm run release:windows-lite:x64` completed and whether it ended with `release verification passed`.
- Record whether the generated package contains the expected runtime directories and launcher files.
- Record any mismatch as either `environment-only`, `script drift`, or `architecture mismatch`.
````

- [ ] **Step 5: Verify the validation section was written**

Run: `rg -n "Layer 3: Executed Validation|release verification passed|environment-only|script drift|architecture mismatch" docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md`
Expected: matching lines for the Layer 3 heading and the result classification terms.

- [ ] **Step 6: Commit the validation results**

```bash
git add docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md
git commit -m "docs: record windows lite validation results"
```

### Task 5: Publish the final conclusion

**Files:**
- Modify: `docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md`

- [ ] **Step 1: Replace the initial report status with the final status**

```md
## Final Status

`GREEN`
```

Use `GREEN` only when all three audit layers pass. Use `YELLOW` when the release model still stands but the audit found small script or dependency adjustments. Use `RED` only when the lightweight release model itself no longer matches the refactored architecture.

- [ ] **Step 2: Write the final conclusion section**

```md
## Conclusion

- Status: `GREEN`
- Summary: The current repository still supports the existing Windows Lite lightweight release flow.
- Required follow-up: None before continuing to ship Windows Lite packages.
```

If the audit finds issues, replace `GREEN` and the summary with the actual result:

```md
## Conclusion

- Status: `YELLOW`
- Summary: The lightweight release model still fits the current repository, but the release scripts need targeted updates before the next package.
- Required follow-up: Update the specific script, whitelist, or prune rule identified by the audit.
```

Or:

```md
## Conclusion

- Status: `RED`
- Summary: The current repository no longer matches the Windows Lite lightweight release model, so the existing release scripts cannot be trusted as-is.
- Required follow-up: Redesign or substantially rebuild the Windows Lite release flow.
```

- [ ] **Step 3: Verify there are no pending placeholders left**

Run: `rg -n "NOT ASSESSED YET|PENDING|TODO|TBD" docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md`
Expected: no output

- [ ] **Step 4: Commit the final audit conclusion**

```bash
git add docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md
git commit -m "docs: finalize windows lite compatibility audit"
```

## Self-Review

### Spec coverage

- Architecture assumptions from the spec map to Task 2.
- Release-script assumptions from the spec map to Task 3.
- Executed validation from the spec maps to Task 4.
- Green/yellow/red conclusion and minimal follow-up guidance from the spec map to Task 5.

### Placeholder scan

- The plan avoids `TODO`, `TBD`, and similar placeholders in executable steps.
- Every edit step includes concrete Markdown content to add.
- Every verification step includes an exact command and expected result.

### Type consistency

- Status labels are used consistently as `GREEN`, `YELLOW`, and `RED` in the plan and final report.
- The report path is used consistently as `docs/superpowers/reports/2026-04-26-windows-lite-compatibility-audit.md`.
- The primary release command is used consistently as `npm run release:windows-lite:x64`.
