# Markdown Annotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Code Editor 的 Markdown 可视化预览中支持右键添加标注，并将多个标注以独立 JSON 文件形式保存与回显。

**Architecture:** 方案沿用现有 `CodeEditor -> CodeEditorSurface -> MarkdownPreview` 渲染链路，在 Markdown 渲染阶段保留源码位置信息，并新增一层标注状态与持久化适配。前端通过预览选区回溯到 Markdown 源码行列范围，后端新增面向标注 JSON 的项目内读写接口，确保目录创建、读取、保存和失效处理都在项目根目录内完成。

**Tech Stack:** React 18、TypeScript、react-markdown、remark-gfm、remark-math、Node/Express、node:test、现有 `api` 工具与 Code Editor 组件体系

---

## File Structure

### Existing files to modify

- `src/components/code-editor/view/subcomponents/markdown/MarkdownPreview.tsx`
  负责 Markdown 可视化渲染；需要升级为可注入源码位置、显示高亮和挂接交互事件的标注预览组件。
- `src/components/code-editor/view/subcomponents/CodeEditorSurface.tsx`
  负责在代码视图和 Markdown 预览之间切换；需要向预览层传入文件信息和标注控制器。
- `src/components/code-editor/view/CodeEditor.tsx`
  负责组合文件内容、保存、顶部状态和预览模式；需要承载 Markdown 标注状态、失效提示和回显入口。
- `src/components/code-editor/hooks/useCodeEditorDocument.ts`
  已负责读取 Markdown 内容；需要暴露给标注逻辑的刷新时机，避免保存标注后预览不同步。
- `src/utils/api.js`
  现有统一 API 封装；需要新增读取/保存 Markdown 标注 JSON 的接口。
- `server/index.js`
  现有项目内文件读写 API 所在位置；需要新增标注专用读写端点并做路径校验、目录创建和 JSON 响应。

### New files to create

- `src/components/code-editor/types/markdownAnnotations.ts`
  统一声明标注实体、失效状态、选区映射结果和预览回显类型。
- `src/components/code-editor/utils/markdownAnnotationPath.ts`
  负责将 Markdown 文件路径映射到 `.ccui/annotations/...annotations.json`。
- `src/components/code-editor/utils/markdownAnnotationPath.test.mjs`
  覆盖路径映射与跨平台路径归一化。
- `src/components/code-editor/utils/markdownAnnotationSelection.ts`
  负责从源码位置信息和预览选区计算 `startLine/startColumn/endLine/endColumn`，并返回校验结果。
- `src/components/code-editor/utils/markdownAnnotationSelection.test.mjs`
  覆盖节点级定位、偏移换算、归一化校验与失败场景。
- `src/components/code-editor/hooks/useMarkdownAnnotations.ts`
  负责加载、保存、编辑、删除标注与失效统计。
- `src/components/code-editor/view/subcomponents/markdown/MarkdownAnnotationContextMenu.tsx`
  可复用的预览区右键菜单，风格参照 `FileContextMenu.tsx`。
- `src/components/code-editor/view/subcomponents/markdown/MarkdownAnnotationComposer.tsx`
  负责添加/编辑标注的轻量弹层。
- `src/components/code-editor/view/subcomponents/markdown/MarkdownAnnotationBanner.tsx`
  负责显示“存在失效标注”的轻提示。
- `src/components/code-editor/view/subcomponents/markdown/MarkdownAnnotationHighlight.tsx`
  负责将有效标注渲染为高亮片段和悬浮信息。

## Task 1: 建立标注路径与数据类型基础

**Files:**
- Create: `src/components/code-editor/types/markdownAnnotations.ts`
- Create: `src/components/code-editor/utils/markdownAnnotationPath.ts`
- Test: `src/components/code-editor/utils/markdownAnnotationPath.test.mjs`

- [ ] **Step 1: Write the failing path-mapping tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getMarkdownAnnotationFilePath,
  normalizeProjectRelativeMarkdownPath,
} from './markdownAnnotationPath.ts';

test('maps a markdown file to a project-local annotation json path', () => {
  assert.equal(
    getMarkdownAnnotationFilePath('docs/guide/setup.md'),
    '.ccui/annotations/docs/guide/setup.md.annotations.json',
  );
});

test('normalizes windows-style separators before building annotation path', () => {
  assert.equal(
    normalizeProjectRelativeMarkdownPath('docs\\\\guide\\\\setup.md'),
    'docs/guide/setup.md',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test "src/components/code-editor/utils/markdownAnnotationPath.test.mjs"`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `markdownAnnotationPath.ts`

- [ ] **Step 3: Write the minimal type and path implementation**

```ts
export type MarkdownAnnotation = {
  id: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  selectedText: string;
  note: string;
  quoteHash: string;
  createdAt: string;
  updatedAt: string;
};

export type MarkdownAnnotationFile = {
  version: 1;
  filePath: string;
  fileHash?: string;
  annotations: MarkdownAnnotation[];
};

export function normalizeProjectRelativeMarkdownPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function getMarkdownAnnotationFilePath(filePath: string): string {
  const normalized = normalizeProjectRelativeMarkdownPath(filePath);
  return `.ccui/annotations/${normalized}.annotations.json`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test "src/components/code-editor/utils/markdownAnnotationPath.test.mjs"`
Expected: PASS with 2 passing subtests

- [ ] **Step 5: Commit**

```bash
git add src/components/code-editor/types/markdownAnnotations.ts src/components/code-editor/utils/markdownAnnotationPath.ts src/components/code-editor/utils/markdownAnnotationPath.test.mjs
git commit -m "feat: add markdown annotation path utilities"
```

## Task 2: 为标注 JSON 增加项目内读写 API

**Files:**
- Modify: `src/utils/api.js`
- Modify: `server/index.js`
- Test: `src/components/code-editor/utils/markdownAnnotationPath.test.mjs`

- [ ] **Step 1: Write the failing API contract test as a narrow utility assertion**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { getMarkdownAnnotationFilePath } from './markdownAnnotationPath.ts';

test('annotation path stays under the .ccui annotations folder', () => {
  assert.match(
    getMarkdownAnnotationFilePath('docs/setup.md'),
    /^\.ccui\/annotations\/.+\.annotations\.json$/,
  );
});
```

- [ ] **Step 2: Run test to verify the current API surface is missing the needed helpers**

Run: `node --experimental-strip-types --test "src/components/code-editor/utils/markdownAnnotationPath.test.mjs"`
Expected: PASS for path utility tests only, confirming the gap is implementation and API wiring rather than path rules

- [ ] **Step 3: Add dedicated annotation endpoints and client helpers**

```js
// src/utils/api.js
readMarkdownAnnotations: (projectName, filePath) =>
  authenticatedFetch(`/api/projects/${projectName}/markdown-annotations?filePath=${encodeURIComponent(filePath)}`),
saveMarkdownAnnotations: (projectName, filePath, annotationFile) =>
  authenticatedFetch(`/api/projects/${projectName}/markdown-annotations`, {
    method: 'PUT',
    body: JSON.stringify({ filePath, annotationFile }),
  }),
```

```js
// server/index.js
app.get('/api/projects/:projectName/markdown-annotations', authenticateToken, async (req, res) => {
  const { projectName } = req.params;
  const { filePath } = req.query;
  const projectRoot = await extractProjectDirectory(projectName);
  const annotationPath = path.resolve(projectRoot, getMarkdownAnnotationFilePath(String(filePath)));
  const validation = validatePathInProject(projectRoot, annotationPath);

  if (!validation.valid) {
    return res.status(403).json({ error: validation.error });
  }

  try {
    const content = await fsPromises.readFile(validation.resolved, 'utf8');
    res.json(JSON.parse(content));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.json({ version: 1, filePath, annotations: [] });
    }
    throw error;
  }
});

app.put('/api/projects/:projectName/markdown-annotations', authenticateToken, async (req, res) => {
  const { projectName } = req.params;
  const { filePath, annotationFile } = req.body;
  const projectRoot = await extractProjectDirectory(projectName);
  const annotationPath = path.resolve(projectRoot, getMarkdownAnnotationFilePath(String(filePath)));
  const validation = validatePathInProject(projectRoot, annotationPath);

  if (!validation.valid) {
    return res.status(403).json({ error: validation.error });
  }

  await fsPromises.mkdir(path.dirname(validation.resolved), { recursive: true });
  await fsPromises.writeFile(validation.resolved, JSON.stringify(annotationFile, null, 2), 'utf8');
  res.json({ success: true, path: validation.resolved });
});
```

- [ ] **Step 4: Run verification commands**

Run: `npm run typecheck`
Expected: PASS with no TypeScript errors after adding the new client helper names and endpoint payloads

- [ ] **Step 5: Commit**

```bash
git add src/utils/api.js server/index.js
git commit -m "feat: add markdown annotation api endpoints"
```

## Task 3: 实现源码位置透传与选区映射纯逻辑

**Files:**
- Create: `src/components/code-editor/utils/markdownAnnotationSelection.ts`
- Test: `src/components/code-editor/utils/markdownAnnotationSelection.test.mjs`
- Modify: `src/components/code-editor/view/subcomponents/markdown/MarkdownPreview.tsx`
- Modify: `src/components/code-editor/view/subcomponents/markdown/MarkdownCodeBlock.tsx`

- [ ] **Step 1: Write the failing selection-mapping tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSelectedText,
  validateSelectedSlice,
  buildAnnotationRange,
} from './markdownAnnotationSelection.ts';

test('normalizes whitespace before comparing selected text against source text', () => {
  assert.equal(normalizeSelectedText('hello \n world'), 'hello world');
});

test('accepts a matching source slice after normalization', () => {
  assert.equal(validateSelectedSlice('wire_api="chat"', 'wire_api="chat"'), true);
});

test('builds a source range from a preview node anchor and text offsets', () => {
  assert.deepEqual(
    buildAnnotationRange({
      sourceStartLine: 8,
      sourceStartColumn: 1,
      sourceTextOffsetStart: 5,
      sourceTextOffsetEnd: 15,
    }),
    {
      startLine: 8,
      startColumn: 6,
      endLine: 8,
      endColumn: 16,
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test "src/components/code-editor/utils/markdownAnnotationSelection.test.mjs"`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `markdownAnnotationSelection.ts`

- [ ] **Step 3: Write the minimal selection utilities and metadata-aware preview hooks**

```ts
export function normalizeSelectedText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

export function validateSelectedSlice(sourceSlice: string, selectedText: string): boolean {
  return normalizeSelectedText(sourceSlice) === normalizeSelectedText(selectedText);
}

export function buildAnnotationRange({
  sourceStartLine,
  sourceStartColumn,
  sourceTextOffsetStart,
  sourceTextOffsetEnd,
}: {
  sourceStartLine: number;
  sourceStartColumn: number;
  sourceTextOffsetStart: number;
  sourceTextOffsetEnd: number;
}) {
  return {
    startLine: sourceStartLine,
    startColumn: sourceStartColumn + sourceTextOffsetStart,
    endLine: sourceStartLine,
    endColumn: sourceStartColumn + sourceTextOffsetEnd,
  };
}
```

```tsx
// MarkdownPreview.tsx
const paragraph = ({ node, children }) => (
  <p
    data-node-type="paragraph"
    data-source-start-line={node?.position?.start?.line}
    data-source-start-column={node?.position?.start?.column}
    data-source-end-line={node?.position?.end?.line}
    data-source-end-column={node?.position?.end?.column}
  >
    {children}
  </p>
);
```

- [ ] **Step 4: Run the focused tests and typecheck**

Run: `node --experimental-strip-types --test "src/components/code-editor/utils/markdownAnnotationSelection.test.mjs"`
Expected: PASS with 3 passing subtests

Run: `npm run typecheck`
Expected: PASS after `react-markdown` custom component typings are updated

- [ ] **Step 5: Commit**

```bash
git add src/components/code-editor/utils/markdownAnnotationSelection.ts src/components/code-editor/utils/markdownAnnotationSelection.test.mjs src/components/code-editor/view/subcomponents/markdown/MarkdownPreview.tsx src/components/code-editor/view/subcomponents/markdown/MarkdownCodeBlock.tsx
git commit -m "feat: add markdown annotation selection mapping"
```

## Task 4: 接入标注状态与 JSON 持久化

**Files:**
- Create: `src/components/code-editor/hooks/useMarkdownAnnotations.ts`
- Modify: `src/components/code-editor/view/CodeEditor.tsx`
- Modify: `src/components/code-editor/view/subcomponents/CodeEditorSurface.tsx`
- Modify: `src/utils/api.js`
- Test: `src/components/code-editor/utils/markdownAnnotationPath.test.mjs`

- [ ] **Step 1: Write the failing hook-level test around serialization helpers**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyAnnotationFile, upsertAnnotation } from './useMarkdownAnnotations.ts';

test('creates an empty annotation file payload for a markdown file', () => {
  assert.deepEqual(createEmptyAnnotationFile('docs/setup.md'), {
    version: 1,
    filePath: 'docs/setup.md',
    annotations: [],
  });
});

test('upsertAnnotation replaces an existing annotation by id', () => {
  const next = upsertAnnotation(
    { version: 1, filePath: 'docs/setup.md', annotations: [{ id: 'a', note: 'old' }] },
    { id: 'a', note: 'new' },
  );

  assert.equal(next.annotations[0].note, 'new');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test "src/components/code-editor/hooks/useMarkdownAnnotations.ts"`
Expected: FAIL because the hook helpers do not exist yet

- [ ] **Step 3: Implement the minimal annotation state hook and wire it into CodeEditor**

```ts
export function createEmptyAnnotationFile(filePath: string): MarkdownAnnotationFile {
  return { version: 1, filePath, annotations: [] };
}

export function upsertAnnotation(
  annotationFile: MarkdownAnnotationFile,
  annotation: MarkdownAnnotation,
): MarkdownAnnotationFile {
  const existing = annotationFile.annotations.filter((item) => item.id !== annotation.id);
  return { ...annotationFile, annotations: [...existing, annotation] };
}

export function useMarkdownAnnotations({ projectName, filePath, content }: Params) {
  const [annotationFile, setAnnotationFile] = useState<MarkdownAnnotationFile | null>(null);
  const loadAnnotations = useCallback(async () => { /* call api.readMarkdownAnnotations */ }, []);
  const saveAnnotation = useCallback(async (annotation) => { /* upsert + api.saveMarkdownAnnotations */ }, []);
  return { annotationFile, loadAnnotations, saveAnnotation };
}
```

```tsx
// CodeEditor.tsx
const markdownAnnotations = useMarkdownAnnotations({
  projectName: file.projectName ?? projectPath,
  filePath: file.path,
  content,
});
```

- [ ] **Step 4: Run verification commands**

Run: `npm run typecheck`
Expected: PASS after `CodeEditorSurface` props and `CodeEditor.tsx` wiring are updated

Run: `node --experimental-strip-types --test "src/components/code-editor/utils/markdownAnnotationPath.test.mjs" "src/components/code-editor/utils/markdownAnnotationSelection.test.mjs"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/code-editor/hooks/useMarkdownAnnotations.ts src/components/code-editor/view/CodeEditor.tsx src/components/code-editor/view/subcomponents/CodeEditorSurface.tsx src/utils/api.js
git commit -m "feat: wire markdown annotation persistence"
```

## Task 5: 增加预览右键菜单和标注输入层

**Files:**
- Create: `src/components/code-editor/view/subcomponents/markdown/MarkdownAnnotationContextMenu.tsx`
- Create: `src/components/code-editor/view/subcomponents/markdown/MarkdownAnnotationComposer.tsx`
- Modify: `src/components/code-editor/view/subcomponents/markdown/MarkdownPreview.tsx`
- Test: `src/components/code-editor/utils/markdownAnnotationSelection.test.mjs`

- [ ] **Step 1: Write the failing UI-state utility test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { canCreateMarkdownAnnotation } from './markdownAnnotationSelection.ts';

test('allows create action only when selection has a validated source range', () => {
  assert.equal(canCreateMarkdownAnnotation({ hasSelection: true, isValidSourceMapping: true }), true);
  assert.equal(canCreateMarkdownAnnotation({ hasSelection: true, isValidSourceMapping: false }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test "src/components/code-editor/utils/markdownAnnotationSelection.test.mjs"`
Expected: FAIL with missing `canCreateMarkdownAnnotation`

- [ ] **Step 3: Implement context menu and composer with existing menu patterns**

```tsx
export default function MarkdownAnnotationContextMenu({
  isOpen,
  position,
  canCreate,
  onCreate,
  onEdit,
  onDelete,
  onClose,
}: Props) {
  return isOpen ? (
    <div style={{ left: position.x, top: position.y }} role="menu">
      {canCreate && <button onClick={onCreate}>添加标注</button>}
      <button onClick={onEdit}>编辑标注</button>
      <button onClick={onDelete}>删除标注</button>
    </div>
  ) : null;
}
```

```tsx
export default function MarkdownAnnotationComposer({ selectedText, note, onChange, onSave, onCancel }: Props) {
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="text-xs text-muted-foreground">{selectedText}</p>
      <textarea value={note} onChange={(event) => onChange(event.target.value)} />
      <button onClick={onSave}>保存</button>
      <button onClick={onCancel}>取消</button>
    </div>
  );
}
```

- [ ] **Step 4: Run verification commands**

Run: `npm run typecheck`
Expected: PASS after the new preview props and menu/composer components are wired

Run: `node --experimental-strip-types --test "src/components/code-editor/utils/markdownAnnotationSelection.test.mjs"`
Expected: PASS with the new `canCreateMarkdownAnnotation` assertion included

- [ ] **Step 5: Commit**

```bash
git add src/components/code-editor/view/subcomponents/markdown/MarkdownAnnotationContextMenu.tsx src/components/code-editor/view/subcomponents/markdown/MarkdownAnnotationComposer.tsx src/components/code-editor/view/subcomponents/markdown/MarkdownPreview.tsx src/components/code-editor/utils/markdownAnnotationSelection.ts src/components/code-editor/utils/markdownAnnotationSelection.test.mjs
git commit -m "feat: add markdown annotation context menu"
```

## Task 6: 实现高亮回显、失效提示与最终验证

**Files:**
- Create: `src/components/code-editor/view/subcomponents/markdown/MarkdownAnnotationBanner.tsx`
- Create: `src/components/code-editor/view/subcomponents/markdown/MarkdownAnnotationHighlight.tsx`
- Modify: `src/components/code-editor/view/subcomponents/markdown/MarkdownPreview.tsx`
- Modify: `src/components/code-editor/view/CodeEditor.tsx`
- Test: `src/components/code-editor/utils/markdownAnnotationSelection.test.mjs`

- [ ] **Step 1: Write the failing helper tests for invalid annotations**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyAnnotationMatch } from './markdownAnnotationSelection.ts';

test('marks annotations as invalid when the stored slice no longer matches the source text', () => {
  assert.equal(
    classifyAnnotationMatch({
      sourceSlice: 'wire_api="responses"',
      selectedText: 'wire_api="chat"',
    }),
    'invalid',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test "src/components/code-editor/utils/markdownAnnotationSelection.test.mjs"`
Expected: FAIL with missing `classifyAnnotationMatch`

- [ ] **Step 3: Implement highlight rendering and invalid banner**

```ts
export function classifyAnnotationMatch({
  sourceSlice,
  selectedText,
}: {
  sourceSlice: string;
  selectedText: string;
}): 'valid' | 'invalid' {
  return validateSelectedSlice(sourceSlice, selectedText) ? 'valid' : 'invalid';
}
```

```tsx
export default function MarkdownAnnotationBanner({ invalidCount }: { invalidCount: number }) {
  if (invalidCount <= 0) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      {`该文档有 ${invalidCount} 条标注未能匹配到当前内容。`}
    </div>
  );
}
```

```tsx
export default function MarkdownAnnotationHighlight({ children, note }: Props) {
  return (
    <mark className="rounded-sm bg-yellow-200/80 px-0.5 text-inherit" title={note}>
      {children}
    </mark>
  );
}
```

- [ ] **Step 4: Run final verification**

Run: `node --experimental-strip-types --test "src/components/code-editor/utils/markdownAnnotationPath.test.mjs" "src/components/code-editor/utils/markdownAnnotationSelection.test.mjs"`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

Run: `npm run test`
Expected: PASS for the existing repository test suite plus any newly registered tests, or document any unrelated pre-existing failures before proceeding

- [ ] **Step 5: Commit**

```bash
git add src/components/code-editor/view/subcomponents/markdown/MarkdownAnnotationBanner.tsx src/components/code-editor/view/subcomponents/markdown/MarkdownAnnotationHighlight.tsx src/components/code-editor/view/subcomponents/markdown/MarkdownPreview.tsx src/components/code-editor/view/CodeEditor.tsx src/components/code-editor/utils/markdownAnnotationSelection.ts src/components/code-editor/utils/markdownAnnotationSelection.test.mjs
git commit -m "feat: add markdown annotation highlights"
```

## Spec Coverage Check

- Markdown 预览中选中并右键添加标注：Task 3、Task 5
- 标注独立保存为 JSON：Task 1、Task 2、Task 4
- 一个 Markdown 文件支持多个标注区块：Task 1、Task 4
- 渲染阶段保留源码位置信息并做选区回溯：Task 3
- 已有标注回显：Task 4、Task 6
- 失效标注保守处理：Task 6

## Placeholder Scan

已检查本计划未使用 `TODO`、`TBD`、`implement later`、`add appropriate handling` 之类占位描述。每个任务都包含明确文件路径、失败测试、最小实现、验证命令和提交点。

## Type Consistency Check

计划中统一使用以下术语和类型命名：

- `MarkdownAnnotation`
- `MarkdownAnnotationFile`
- `getMarkdownAnnotationFilePath`
- `useMarkdownAnnotations`
- `validateSelectedSlice`
- `classifyAnnotationMatch`

后续实现中应保持这些命名一致，避免跨任务改名。
