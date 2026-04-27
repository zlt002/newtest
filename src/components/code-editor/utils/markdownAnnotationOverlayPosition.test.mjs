import test from 'node:test';
import assert from 'node:assert/strict';

import { calculatePreviewCenteredPosition } from './markdownAnnotationOverlayPosition.ts';

test('编辑弹层在预览容器已滚出顶部时仍应保持在可视区内', () => {
  const position = calculatePreviewCenteredPosition(
    {
      left: 80,
      top: -120,
      width: 720,
      height: 2400,
    },
    360,
    260,
    1280,
    800,
  );

  assert.equal(position.y, 270);
});
