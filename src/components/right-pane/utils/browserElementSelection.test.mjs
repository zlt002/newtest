import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildElementSelectionPrompt,
  findElementSourceLineRange,
  formatSelectedElementFileReference,
} from './browserElementSelection.ts';

test('buildElementSelectionPrompt keeps only the selector and source reference in the appended prompt', () => {
  const result = buildElementSelectionPrompt({
    selector: '#submit-btn',
    tagName: 'button',
    text: '立即提交',
    pageTitle: 'Demo',
    pageUrl: 'http://localhost:5173/demo',
    fileReference: 'login.html:12-14',
  });

  assert.match(result, /元素选择器：#submit-btn/);
  assert.match(result, /源码位置：login\.html:12-14/);
  assert.doesNotMatch(result, /我在右侧预览里选中了一个页面元素/);
  assert.doesNotMatch(result, /请围绕这个元素说明应该修改哪些代码/);
  assert.doesNotMatch(result, /^-/m);
  assert.doesNotMatch(result, /元素标签/);
  assert.doesNotMatch(result, /元素文本/);
  assert.doesNotMatch(result, /页面标题/);
  assert.doesNotMatch(result, /页面地址/);
  assert.doesNotMatch(result, /元素 HTML/);
});

test('formatSelectedElementFileReference prefers relative project paths with line ranges', () => {
  assert.equal(
    formatSelectedElementFileReference('/workspace/demo/login.html', '/workspace/demo', { startLine: 12, endLine: 14 }),
    'login.html:12-14',
  );
});

test('findElementSourceLineRange matches sanitized outer html against the source file', () => {
  const source = [
    '<div class="form-group">',
    '  <label for="username">账号</label>',
    '  <input type="text" id="username" placeholder="请输入账号" autocomplete="username">',
    '  <div class="error-msg" id="usernameError">请输入账号</div>',
    '</div>',
  ].join('\n');

  const range = findElementSourceLineRange({
    sourceText: source,
    elementOuterHtml: [
      '<div class="form-group" data-ccui-browser-selected-highlight="active">',
      '<label for="username">账号</label>',
      '<input type="text" id="username" placeholder="请输入账号" autocomplete="username">',
      '<div class="error-msg" id="usernameError">请输入账号</div>',
      '</div>',
    ].join(''),
  });

  assert.deepEqual(range, { startLine: 1, endLine: 5 });
});
