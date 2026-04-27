import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MERMAID_SCALE,
  MIN_MERMAID_SCALE,
  clampMermaidScale,
  computeCenteredViewport,
  computeFitViewport,
  computeWheelZoomViewport,
} from './mermaidViewport.ts';

const assertNear = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${actual} to be near ${expected}`);
};

test('clampMermaidScale 将缩放限制在允许区间内', () => {
  assert.equal(clampMermaidScale(MIN_MERMAID_SCALE / 10), MIN_MERMAID_SCALE);
  assert.equal(clampMermaidScale(MAX_MERMAID_SCALE * 10), MAX_MERMAID_SCALE);
  assert.equal(clampMermaidScale(1.5), 1.5);
});

test('computeFitViewport 计算适配容器并居中的初始视口', () => {
  const viewport = computeFitViewport({
    containerWidth: 800,
    containerHeight: 600,
    contentWidth: 1200,
    contentHeight: 900,
    padding: 24,
  });

  assertNear(viewport.scale, 0.6133333333333333);
  assertNear(viewport.x, 32);
  assertNear(viewport.y, 24);
});

test('computeWheelZoomViewport 以光标位置为锚点缩放', () => {
  const viewport = computeWheelZoomViewport({
    pointerX: 400,
    pointerY: 300,
    deltaY: -100,
    scale: 1,
    x: 100,
    y: 80,
  });

  assertNear(viewport.scale, 1.1);
  assertNear(viewport.x, 70);
  assertNear(viewport.y, 58);
});

test('computeCenteredViewport 按给定缩放居中内容', () => {
  const viewport = computeCenteredViewport({
    containerWidth: 900,
    containerHeight: 700,
    contentWidth: 1200,
    contentHeight: 800,
    scale: 1,
  });

  assertNear(viewport.scale, 1);
  assertNear(viewport.x, -150);
  assertNear(viewport.y, -50);
});
