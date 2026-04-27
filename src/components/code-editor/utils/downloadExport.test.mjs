import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocxDownloadPayload,
  buildMarkdownDownloadPayload,
  createCodeBlockRuns,
  encodeSvgMarkup,
  layoutCodeBlockLines,
  resolveMermaidPngFallbackData,
} from './downloadExport.ts';

test('buildMarkdownDownloadPayload 保留原始 md 文件名和纯文本类型', () => {
  const payload = buildMarkdownDownloadPayload({
    content: '# Title',
    fileName: 'README.md',
  });

  assert.equal(payload.fileName, 'README.md');
  assert.equal(payload.mimeType, 'text/markdown;charset=utf-8');
  assert.deepEqual(payload.parts, ['# Title']);
});

test('buildDocxDownloadPayload 导出同名 docx Word 文档', async () => {
  const payload = await buildDocxDownloadPayload({
    content: '# Title\n<script>alert(1)</script>',
    fileName: 'README.md',
  });

  assert.equal(payload.fileName, 'README.docx');
  assert.equal(
    payload.mimeType,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  assert.equal(payload.parts.length, 1);
  assert.ok(payload.parts[0] instanceof Blob);
});

test('buildDocxDownloadPayload 导出包含中文 Mermaid 流程图的 docx 不应抛错', async () => {
  const payload = await buildDocxDownloadPayload({
    content: '```mermaid\ngraph TD\nA[开始]-->B[结束]\n```',
    fileName: 'diagram.md',
  });

  assert.equal(payload.fileName, 'diagram.docx');
  assert.equal(payload.parts.length, 1);
  assert.ok(payload.parts[0] instanceof Blob);
});

test('createCodeBlockRuns 将代码块按行拆分并保留显式换行', () => {
  const runs = createCodeBlockRuns('line 1\nline 2\n\nline 4');

  assert.equal(runs.length, 4);
  assert.equal(runs[0].root.at(-1)?.root?.[1], 'line 1');
  assert.equal(runs[1].root[1]?.rootKey, 'w:br');
  assert.equal(runs[1].root.at(-1)?.root?.[1], 'line 2');
  assert.equal(runs[2].root[1]?.rootKey, 'w:br');
  assert.equal(runs[2].root.at(-1)?.root?.[1], '');
  assert.equal(runs[3].root[1]?.rootKey, 'w:br');
  assert.equal(runs[3].root.at(-1)?.root?.[1], 'line 4');
});

test('layoutCodeBlockLines 按可用宽度拆分长行并保留空行', () => {
  const lines = layoutCodeBlockLines('abcdef\na\n\nxyz', 3);

  assert.deepEqual(lines, ['abc', 'def', 'a', '', 'xyz']);
});

test('resolveMermaidPngFallbackData 在栅格化失败时返回保底 PNG 字节，避免导出中断', async () => {
  const result = await resolveMermaidPngFallbackData(async () => {
    throw new DOMException('tainted', 'SecurityError');
  });

  assert.ok(result instanceof Uint8Array);
  assert.ok(result.length > 0);
});

test('encodeSvgMarkup 将包含中文的 SVG 文本编码为二进制，避免 docx 误按 base64 解析', () => {
  const encoded = encodeSvgMarkup('<svg><text>流程图</text></svg>');

  assert.ok(encoded instanceof Uint8Array);
  assert.ok(encoded.length > 0);
});
