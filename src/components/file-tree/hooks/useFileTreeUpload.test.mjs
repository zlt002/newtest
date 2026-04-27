import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUploadFormData,
  createPastedFileName,
  extractClipboardFiles,
  shouldHandleTreePaste,
} from './fileTreeUploadHelpers.ts';

test('createPastedFileName 为图片 mime 生成稳定扩展名', () => {
  assert.match(createPastedFileName('image/png'), /^pasted-image-\d{8}-\d{6}\.png$/);
  assert.match(createPastedFileName('image/jpeg'), /^pasted-image-\d{8}-\d{6}\.jpg$/);
  assert.match(createPastedFileName('image/webp'), /^pasted-image-\d{8}-\d{6}\.webp$/);
});

test('extractClipboardFiles 优先提取 clipboard items 里的文件，并给无名截图补文件名', () => {
  const screenshot = new File(['demo'], '', { type: 'image/png' });
  const doc = new File(['hello'], 'notes.txt', { type: 'text/plain' });

  const files = extractClipboardFiles({
    items: [
      {
        kind: 'file',
        type: 'image/png',
        getAsFile: () => screenshot,
      },
      {
        kind: 'file',
        type: 'text/plain',
        getAsFile: () => doc,
      },
    ],
    files: [],
  });

  assert.equal(files.length, 2);
  assert.match(files[0].name, /^pasted-image-\d{8}-\d{6}\.png$/);
  assert.equal(files[1].name, 'notes.txt');
});

test('extractClipboardFiles 在 items 为空时回退到 clipboard files', () => {
  const pasted = new File(['a'], 'asset.png', { type: 'image/png' });

  const files = extractClipboardFiles({
    items: [],
    files: [pasted],
  });

  assert.equal(files.length, 1);
  assert.equal(files[0].name, 'asset.png');
});

test('buildUploadFormData 为上传接口保留 relativePaths', () => {
  const nested = new File(['x'], 'folder/demo.txt', { type: 'text/plain' });
  const formData = buildUploadFormData([nested], 'docs');

  assert.equal(formData.get('targetPath'), 'docs');
  assert.equal(JSON.parse(String(formData.get('relativePaths')))[0], 'folder/demo.txt');

  const uploaded = formData.getAll('files');
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].name, 'demo.txt');
});

test('shouldHandleTreePaste 会跳过输入框和可编辑区域', () => {
  const previousHTMLElement = globalThis.HTMLElement;

  class MockElement {
    constructor(tagName, isContentEditable = false) {
      this.tagName = tagName;
      this.isContentEditable = isContentEditable;
    }
  }

  globalThis.HTMLElement = MockElement;

  try {
    assert.equal(shouldHandleTreePaste(new MockElement('INPUT')), false);
    assert.equal(shouldHandleTreePaste(new MockElement('TEXTAREA')), false);
    assert.equal(shouldHandleTreePaste(new MockElement('DIV', true)), false);
    assert.equal(shouldHandleTreePaste(new MockElement('DIV', false)), true);
    assert.equal(shouldHandleTreePaste(null), true);
  } finally {
    globalThis.HTMLElement = previousHTMLElement;
  }
});
