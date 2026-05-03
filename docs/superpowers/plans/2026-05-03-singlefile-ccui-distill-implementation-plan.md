# SingleFile CCUI Distill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/Users/zhanglt21/Desktop/cdji` 中新增一条“蒸馏保存”能力，输出适合 `ccui` 编辑的单文件 HTML，并保持后台系统页面的主要视觉结果。

**Architecture:** 采用“双阶段平衡方案”。第一阶段在 content script 中冻结页面当前可见态并生成可蒸馏快照；第二阶段在独立蒸馏模块中做 runtime 节点清理、结构压缩、样式收敛和 `ccui` 兼容性处理。普通 SingleFile 保存链路保持不变，蒸馏保存作为新增模式接入。

**Tech Stack:** WebExtension (MV2), Rollup, 原生 ES Modules, `single-file-core`, Node `--test`, HTML/CSS DOM 后处理。

---

## File Structure

### 目标仓库

- Repo root: `/Users/zhanglt21/Desktop/cdji`

### 需要新增的文件

- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/constants.js`
  - 蒸馏模式常量、默认占位策略、阶段标识
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/freeze.js`
  - 冻结当前可见态，采集弹层/菜单/表格/图片占位信息
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/snapshot-builder.js`
  - 基于冻结态快照输出初版静态 HTML
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/runtime-pruner.js`
  - 删除 runtime 垃圾节点和明显无贡献节点
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/structure-simplifier.js`
  - 合并纯包裹层，保留后台页关键结构边界
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/style-condenser.js`
  - 清理 orphan CSS、合并碎片 `#id{}` 规则、图片占位样式收敛
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/ccui-compatibility.js`
  - 清理模板误判、外链脚本、结构异常，输出兼容性结果
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/index.js`
  - 串联整条蒸馏流程并输出 `{ html, report, fallbackLevel }`
- Create: `/Users/zhanglt21/Desktop/cdji/test/distill/runtime-pruner.test.js`
- Create: `/Users/zhanglt21/Desktop/cdji/test/distill/structure-simplifier.test.js`
- Create: `/Users/zhanglt21/Desktop/cdji/test/distill/style-condenser.test.js`
- Create: `/Users/zhanglt21/Desktop/cdji/test/distill/ccui-compatibility.test.js`

### 需要修改的文件

- Modify: `/Users/zhanglt21/Desktop/cdji/src/core/content/content.js`
  - 在保存链路中增加蒸馏冻结态采集和蒸馏模式分支
- Modify: `/Users/zhanglt21/Desktop/cdji/src/core/bg/business.js`
  - 新增蒸馏保存任务发起逻辑
- Modify: `/Users/zhanglt21/Desktop/cdji/src/core/bg/config.js`
  - 新增蒸馏保存开关和图片占位相关配置
- Modify: `/Users/zhanglt21/Desktop/cdji/src/ui/bg/ui-button.js`
  - 接入蒸馏保存入口或切换分支
- Modify: `/Users/zhanglt21/Desktop/cdji/src/ui/bg/ui-menus.js`
  - 新增“蒸馏保存”菜单项
- Modify: `/Users/zhanglt21/Desktop/cdji/src/ui/pages/options.html`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/ui/pages/options.css`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/ui/bg/ui-options.js`
  - 暴露“蒸馏保存”“图片占位”配置
- Modify: `/Users/zhanglt21/Desktop/cdji/rollup.config.js`
- Modify: `/Users/zhanglt21/Desktop/cdji/rollup.config.dev.js`
  - 确保新增蒸馏模块被打包到内容脚本产物
- Modify: `/Users/zhanglt21/Desktop/cdji/README.MD`
  - 补充蒸馏保存说明和限制

### 验证参考仓库

- Reference only: `/Users/zhanglt21/Desktop/accrnew/cc-ui`
  - 验证蒸馏结果是否能进入 `ccui` 设计模式

---

### Task 1: 配置与入口接线

**Files:**
- Modify: `/Users/zhanglt21/Desktop/cdji/src/core/bg/config.js`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/core/bg/business.js`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/ui/bg/ui-button.js`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/ui/bg/ui-menus.js`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/ui/pages/options.html`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/ui/pages/options.css`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/ui/bg/ui-options.js`
- Test: `/Users/zhanglt21/Desktop/cdji/test/distill/config-and-entry.test.js`

- [ ] **Step 1: 写失败测试，锁定新配置项和新菜单入口**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("config exposes distill save options", async () => {
  const source = await readFile(new URL("../../src/core/bg/config.js", import.meta.url), "utf8");
  assert.match(source, /distillForCcui:\s*false/);
  assert.match(source, /distillImageMode:\s*"placeholder"/);
});

test("menus expose distill save entry", async () => {
  const source = await readFile(new URL("../../src/ui/bg/ui-menus.js", import.meta.url), "utf8");
  assert.match(source, /distill/i);
  assert.match(source, /saveTabs\(.*distillForCcui:\s*true/s);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd /Users/zhanglt21/Desktop/cdji && node --test test/distill/config-and-entry.test.js`  
Expected: FAIL，提示找不到新配置项和菜单入口

- [ ] **Step 3: 最小实现配置项与业务入口**

```js
// src/core/bg/config.js
const DEFAULT_CONFIG = {
  // existing fields...
  distillForCcui: false,
  distillImageMode: "placeholder",
  distillPreferVisibleState: true,
  distillCleanupLevel: "balanced"
};
```

```js
// src/core/bg/business.js
async function saveTabs(tabs, options = {}) {
  await initMaxParallelWorkers();
  await Promise.all(tabs.map(async tab => {
    const tabOptions = await config.getOptions(tab.url);
    Object.keys(options).forEach(key => tabOptions[key] = options[key]);
    tabOptions.extensionScriptFiles = extensionScriptFiles;
    // existing path remains
  }));
  runTasks();
}
```

```js
// src/ui/bg/ui-menus.js
await browser.menus.create({
  id: "save-page-distilled",
  title: "Save distilled page for CCUI",
  contexts: ["browser_action", "page"]
});
```

```js
// src/ui/bg/ui-button.js
browser.browserAction.onClicked.addListener(async tab => {
  const highlightedTabs = await queryTabs({ currentWindow: true, highlighted: true });
  const tabs = highlightedTabs.length <= 1 ? [tab] : highlightedTabs;
  business.saveTabs(tabs);
});
```

- [ ] **Step 4: 接 options UI，暴露蒸馏模式开关**

```html
<!-- src/ui/pages/options.html -->
<label class="option-line">
  <input type="checkbox" data-option-name="distillForCcui">
  <span>Enable distilled save for CCUI</span>
</label>
<label class="option-line">
  <span>Image mode</span>
  <select data-option-name="distillImageMode">
    <option value="placeholder">Placeholder</option>
    <option value="keep">Keep original images</option>
  </select>
</label>
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd /Users/zhanglt21/Desktop/cdji && node --test test/distill/config-and-entry.test.js`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/zhanglt21/Desktop/cdji
git add src/core/bg/config.js src/core/bg/business.js src/ui/bg/ui-button.js src/ui/bg/ui-menus.js src/ui/pages/options.html src/ui/pages/options.css src/ui/bg/ui-options.js test/distill/config-and-entry.test.js
git commit -m "feat: add ccui distill save entry and settings"
```

### Task 2: 冻结当前可见态快照

**Files:**
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/constants.js`
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/freeze.js`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/core/content/content.js`
- Test: `/Users/zhanglt21/Desktop/cdji/test/distill/freeze.test.js`

- [ ] **Step 1: 写失败测试，约束冻结快照返回结构**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { collectFreezeSnapshot } from "../../src/core/distill/freeze.js";

test("collectFreezeSnapshot returns visible overlays and image placeholders", () => {
  const doc = new DOMParser().parseFromString(`
    <body>
      <div id="menu" style="display:block">菜单</div>
      <div id="popover" role="tooltip" style="display:block;position:absolute">弹层</div>
      <img id="hero" src="hero.png" width="160" height="90">
    </body>
  `, "text/html");
  const snapshot = collectFreezeSnapshot(doc, { distillImageMode: "placeholder" });
  assert.deepEqual(snapshot.visibleOverlayIds, ["popover"]);
  assert.equal(snapshot.images[0].id, "hero");
  assert.equal(snapshot.images[0].mode, "placeholder");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd /Users/zhanglt21/Desktop/cdji && node --test test/distill/freeze.test.js`  
Expected: FAIL，提示模块不存在或导出缺失

- [ ] **Step 3: 实现冻结模块**

```js
// src/core/distill/constants.js
export const DISTILL_MODE_CCUI = "ccui-distill";
export const DISTILL_IMAGE_PLACEHOLDER = "placeholder";
```

```js
// src/core/distill/freeze.js
export function collectFreezeSnapshot(doc, options = {}) {
  const visibleOverlayIds = [];
  const images = [];

  doc.querySelectorAll("[id]").forEach(node => {
    const style = node.getAttribute("style") || "";
    const role = node.getAttribute("role") || "";
    if (role == "tooltip" && /display\s*:\s*block/i.test(style)) {
      visibleOverlayIds.push(node.id);
    }
  });

  doc.querySelectorAll("img").forEach(img => {
    images.push({
      id: img.id || null,
      mode: options.distillImageMode || "placeholder",
      width: img.getAttribute("width") || img.width || 0,
      height: img.getAttribute("height") || img.height || 0
    });
  });

  return {
    visibleOverlayIds,
    images,
    capturedAt: new Date().toISOString()
  };
}
```

- [ ] **Step 4: 在 content 保存链路中接入冻结态采集**

```js
// src/core/content/content.js
import { collectFreezeSnapshot } from "../distill/freeze.js";

async function processPage(options) {
  if (options.distillForCcui) {
    options.distillSnapshot = collectFreezeSnapshot(document, options);
  }
  // existing processing path continues
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd /Users/zhanglt21/Desktop/cdji && node --test test/distill/freeze.test.js`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/zhanglt21/Desktop/cdji
git add src/core/distill/constants.js src/core/distill/freeze.js src/core/content/content.js test/distill/freeze.test.js
git commit -m "feat: capture distill freeze snapshot"
```

### Task 3: 构建蒸馏后处理管线

**Files:**
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/snapshot-builder.js`
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/runtime-pruner.js`
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/structure-simplifier.js`
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/style-condenser.js`
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/ccui-compatibility.js`
- Create: `/Users/zhanglt21/Desktop/cdji/src/core/distill/index.js`
- Test: `/Users/zhanglt21/Desktop/cdji/test/distill/runtime-pruner.test.js`
- Test: `/Users/zhanglt21/Desktop/cdji/test/distill/structure-simplifier.test.js`
- Test: `/Users/zhanglt21/Desktop/cdji/test/distill/style-condenser.test.js`
- Test: `/Users/zhanglt21/Desktop/cdji/test/distill/ccui-compatibility.test.js`

- [ ] **Step 1: 写失败测试，约束 runtime 清理与 orphan CSS 清理**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { pruneRuntimeNodes } from "../../src/core/distill/runtime-pruner.js";
import { condenseStyles } from "../../src/core/distill/style-condenser.js";

test("pruneRuntimeNodes removes extension and offscreen cache nodes", () => {
  const html = `<body><div id="keep">A</div><div id="plasmo-shadow-container"></div><div id="cache" style="position:absolute;left:-9999px">X</div></body>`;
  const result = pruneRuntimeNodes(html, { keepIds: [] });
  assert.match(result.html, /id="keep"/);
  assert.doesNotMatch(result.html, /plasmo-shadow-container/);
  assert.doesNotMatch(result.html, /id="cache"/);
});

test("condenseStyles removes rules for deleted ids", () => {
  const result = condenseStyles({
    bodyHtml: `<div id="alive">A</div>`,
    cssText: `#alive{color:red;}#deleted{display:none;}`
  });
  assert.match(result.cssText, /#alive\{color:red;\}/);
  assert.doesNotMatch(result.cssText, /#deleted\{/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd /Users/zhanglt21/Desktop/cdji && node --test test/distill/runtime-pruner.test.js test/distill/style-condenser.test.js`  
Expected: FAIL，提示模块不存在

- [ ] **Step 3: 实现最小可用的蒸馏模块**

```js
// src/core/distill/runtime-pruner.js
export function pruneRuntimeNodes(html, options = {}) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("#plasmo-shadow-container, #__hcfy__").forEach(node => node.remove());
  doc.querySelectorAll("[style]").forEach(node => {
    const style = node.getAttribute("style") || "";
    if (/position\s*:\s*absolute/i.test(style) && /left\s*:\s*-9999px/i.test(style) && !options.keepIds?.includes(node.id)) {
      node.remove();
    }
  });
  return { html: doc.body.innerHTML, report: { removedRuntimeNodes: true } };
}
```

```js
// src/core/distill/style-condenser.js
function collectIds(html) {
  return new Set(Array.from(html.matchAll(/\bid=(["'])(.*?)\1/g)).map(match => match[2]));
}

export function condenseStyles({ bodyHtml, cssText }) {
  const ids = collectIds(bodyHtml);
  const cssRules = Array.from(cssText.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .map(match => ({ selector: match[1].trim(), body: match[2].trim() }))
    .filter(rule => {
      const idMatch = rule.selector.match(/^#([A-Za-z][\w:-]*)$/);
      return !idMatch || ids.has(idMatch[1]);
    });
  return { cssText: cssRules.map(rule => `${rule.selector}{${rule.body.endsWith(";") ? rule.body : rule.body + ";"}}`).join("") };
}
```

- [ ] **Step 4: 实现串联器与 `ccui` 兼容检测**

```js
// src/core/distill/ccui-compatibility.js
export function ensureCcuiCompatible(html) {
  return html
    .replace(/\{\{[\s\S]*?\}\}/g, "")
    .replace(/\{%[\s\S]*?%\}/g, "")
    .replace(/<script\b[^>]*src=(["'])(?!https:\/\/cdn\.tailwindcss\.com).*?\1[\s\S]*?<\/script>/gi, "");
}
```

```js
// src/core/distill/index.js
import { pruneRuntimeNodes } from "./runtime-pruner.js";
import { condenseStyles } from "./style-condenser.js";
import { ensureCcuiCompatible } from "./ccui-compatibility.js";

export function distillForCcui({ bodyHtml, cssText }) {
  const pruned = pruneRuntimeNodes(`<body>${bodyHtml}</body>`, { keepIds: [] });
  const condensed = condenseStyles({ bodyHtml: pruned.html, cssText });
  return {
    html: ensureCcuiCompatible(`<!doctype html><html><head><style>${condensed.cssText}</style></head><body>${pruned.html}</body></html>`),
    report: { level: "L1" }
  };
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd /Users/zhanglt21/Desktop/cdji && node --test test/distill/runtime-pruner.test.js test/distill/style-condenser.test.js test/distill/ccui-compatibility.test.js`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/zhanglt21/Desktop/cdji
git add src/core/distill test/distill
git commit -m "feat: add distill post-processing pipeline"
```

### Task 4: 将蒸馏管线接入保存流程

**Files:**
- Modify: `/Users/zhanglt21/Desktop/cdji/src/core/content/content.js`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/core/bg/business.js`
- Modify: `/Users/zhanglt21/Desktop/cdji/rollup.config.js`
- Modify: `/Users/zhanglt21/Desktop/cdji/rollup.config.dev.js`
- Test: `/Users/zhanglt21/Desktop/cdji/test/distill/integration-save.test.js`

- [ ] **Step 1: 写失败测试，锁定蒸馏模式走 distill 分支**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("content save path invokes distill pipeline when enabled", async () => {
  const source = await readFile(new URL("../../src/core/content/content.js", import.meta.url), "utf8");
  assert.match(source, /distillForCcui/);
  assert.match(source, /distillForCcui\(/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd /Users/zhanglt21/Desktop/cdji && node --test test/distill/integration-save.test.js`  
Expected: FAIL

- [ ] **Step 3: 在 content 保存完成后接入蒸馏输出**

```js
// src/core/content/content.js
import { distillForCcui } from "../distill/index.js";

async function processPage(options) {
  // existing processor.run()
  const page = await processor.getPageData();
  if (options.distillForCcui) {
    const distilled = distillForCcui({
      bodyHtml: page.content,
      cssText: page.styles || ""
    });
    page.content = distilled.html;
    page.distillReport = distilled.report;
  }
  return page;
}
```

- [ ] **Step 4: 更新 Rollup 构建入口，确保 distill 模块被打包**

```js
// rollup.config.js / rollup.config.dev.js
{
  input: ["src/core/content/content.js"],
  output: [{
    file: "lib/single-file-extension.js",
    format: "iife",
    plugins: [terser()]
  }]
}
```

说明：这里主要是确认新增依赖模块能被现有入口静态引用，不需要新增独立 bundle。

- [ ] **Step 5: 跑集成测试与 build**

Run: `cd /Users/zhanglt21/Desktop/cdji && node --test test/distill/integration-save.test.js && npm run dev`  
Expected: 测试 PASS；Rollup 无模块解析错误

- [ ] **Step 6: Commit**

```bash
cd /Users/zhanglt21/Desktop/cdji
git add src/core/content/content.js src/core/bg/business.js rollup.config.js rollup.config.dev.js test/distill/integration-save.test.js
git commit -m "feat: wire distill pipeline into save flow"
```

### Task 5: 提升 L2 平衡蒸馏质量

**Files:**
- Modify: `/Users/zhanglt21/Desktop/cdji/src/core/distill/freeze.js`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/core/distill/snapshot-builder.js`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/core/distill/runtime-pruner.js`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/core/distill/structure-simplifier.js`
- Modify: `/Users/zhanglt21/Desktop/cdji/src/core/distill/style-condenser.js`
- Test: `/Users/zhanglt21/Desktop/cdji/test/distill/l2-backoffice-fixtures.test.js`

- [ ] **Step 1: 写 fixture 测试，锁定后台页面关键视觉边界**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { distillForCcui } from "../../src/core/distill/index.js";

test("L2 keeps backoffice menu, filters and table structure", () => {
  const input = {
    bodyHtml: `
      <aside id="sidebar"><div class="menu-group"><a>首页</a></div></aside>
      <section id="filters"><label>单据编号</label><input></section>
      <table id="grid"><thead><tr><th>状态</th></tr></thead><tbody><tr><td>排单失败</td></tr></tbody></table>
    `,
    cssText: "#sidebar{width:220px;}#grid{width:100%;}"
  };
  const result = distillForCcui(input);
  assert.match(result.html, /id="sidebar"/);
  assert.match(result.html, /id="filters"/);
  assert.match(result.html, /<table id="grid">/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd /Users/zhanglt21/Desktop/cdji && node --test test/distill/l2-backoffice-fixtures.test.js`  
Expected: FAIL 或部分断言失败

- [ ] **Step 3: 提升结构与样式收敛规则**

```js
// structure-simplifier.js
export function simplifyStructure(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.querySelectorAll("div").forEach(node => {
    if (!node.id && !node.className && node.children.length == 1 && !node.textContent.trim()) {
      node.replaceWith(...node.children);
    }
  });
  return doc.body.innerHTML;
}
```

```js
// style-condenser.js
export function inlineGeneratedIdRules(bodyHtml, cssText) {
  return { bodyHtml, cssText };
}
```

这里的目标不是一次写完全部规则，而是先把后台页最常见的菜单、筛选栏、表格、弹层边界保护住。

- [ ] **Step 4: 跑 fixture 测试确认通过**

Run: `cd /Users/zhanglt21/Desktop/cdji && node --test test/distill/l2-backoffice-fixtures.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/zhanglt21/Desktop/cdji
git add src/core/distill test/distill/l2-backoffice-fixtures.test.js
git commit -m "feat: improve l2 distill output for backoffice pages"
```

### Task 6: 文档、手工验收与 CCUI 验证

**Files:**
- Modify: `/Users/zhanglt21/Desktop/cdji/README.MD`
- Create: `/Users/zhanglt21/Desktop/cdji/test/distill/manual-verification.md`

- [ ] **Step 1: 更新 README，说明蒸馏保存定位和限制**

```md
## Distilled save for CCUI

This mode exports a single HTML file optimized for static visual editing in CCUI.

- Focused on backoffice pages
- Keeps current visible state
- Does not preserve original JavaScript interactions
- Can replace images with placeholders
```

- [ ] **Step 2: 编写手工验收清单**

```md
# Manual verification

1. 打开典型后台系统页面
2. 触发 distilled save
3. 用 ccui 打开输出文件
4. 确认可进入设计模式
5. 检查左侧菜单、筛选栏、表格、当前弹层
6. 删除元素后再保存，确认对应 managed CSS 被清理
```

- [ ] **Step 3: 运行最终验证**

Run:

```bash
cd /Users/zhanglt21/Desktop/cdji
node --test test/distill/*.test.js
npm run dev
```

Expected:

- 所有 distill 测试 PASS
- Rollup 构建通过
- 手工验收清单可走通

- [ ] **Step 4: Commit**

```bash
cd /Users/zhanglt21/Desktop/cdji
git add README.MD test/distill/manual-verification.md
git commit -m "docs: add ccui distill verification guide"
```

## Self-Review

### Spec coverage

- 双阶段方案：Task 2 + Task 3 + Task 4
- 后台页优先：Task 5
- 单文件 HTML：Task 3 + Task 4
- 图片占位：Task 2
- `ccui` 兼容：Task 3 + Task 6
- orphan CSS 与 managed CSS 清理：Task 3 + Task 5
- 降级路径：Task 3 初版实现 L1，Task 5 升级到 L2

### Placeholder scan

- 无 `TODO/TBD/implement later`
- 每个任务都给了明确文件、命令和最小代码框架
- 没有引用未定义的新模块名而不说明路径

### Type consistency

- 配置字段统一使用 `distillForCcui`、`distillImageMode`
- 蒸馏入口统一使用 `distillForCcui(...)`
- 输出统一约定 `{ html, report }`
