import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMermaidSvgElement } from './mermaidSvgPresentation.ts';

test('normalizeMermaidSvgElement 用 viewBox 尺寸接管 Mermaid SVG 展示尺寸', () => {
  const svgElement = {
    style: {
      width: '',
      height: '',
      maxWidth: '',
      display: '',
    },
    viewBox: {
      baseVal: {
        width: 1200,
        height: 800,
      },
    },
    getBoundingClientRect: () => ({
      width: 300,
      height: 200,
    }),
  };

  const result = normalizeMermaidSvgElement(svgElement);

  assert.deepEqual(result, {
    contentWidth: 1200,
    contentHeight: 800,
  });
  assert.equal(svgElement.style.width, '1200px');
  assert.equal(svgElement.style.height, '800px');
  assert.equal(svgElement.style.maxWidth, 'none');
  assert.equal(svgElement.style.display, 'block');
});
