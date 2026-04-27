import test from 'node:test';
import assert from 'node:assert/strict';
import { MERMAID_RENDER_CONFIG } from './mermaidRenderConfig.ts';

test('MERMAID_RENDER_CONFIG 关闭 htmlLabels 以兼容导出栅格化', () => {
  assert.equal(MERMAID_RENDER_CONFIG.startOnLoad, false);
  assert.equal(MERMAID_RENDER_CONFIG.securityLevel, 'loose');
  assert.equal(MERMAID_RENDER_CONFIG.theme, 'default');
  assert.equal(MERMAID_RENDER_CONFIG.htmlLabels, false);
});
