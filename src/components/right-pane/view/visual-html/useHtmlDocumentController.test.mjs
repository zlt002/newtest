import test from 'node:test';
import assert from 'node:assert/strict';

import {
  reserveNextHtmlDocumentRevision,
  createHtmlDocumentControllerState,
  applyDesignToSourceState,
  applySourceToDesignState,
  setPersistedDocumentState,
  setDocumentTextState,
  setSourceLocationResultState,
  updateCurrentDocumentState,
} from './useHtmlDocumentController.ts';

test('setPersistedDocument advances revision tracking and resets mapping freshness', () => {
  const initial = createHtmlDocumentControllerState();
  const afterEdit = updateCurrentDocumentState(initial, '<section></section>', 'design');
  const afterPersist = setPersistedDocumentState(afterEdit, {
    content: '<html><body></body></html>',
    version: 'v1',
  });
  const afterSecondPersist = setPersistedDocumentState(afterPersist, {
    content: '<html><body><main></main></body></html>',
    version: 'v2',
  });

  assert.equal(afterPersist.documentText, '<html><body></body></html>');
  assert.equal(afterPersist.persistedText, '<html><body></body></html>');
  assert.equal(afterPersist.version, 'v1');
  assert.equal(afterPersist.editorRevision, 2);
  assert.equal(afterPersist.lastChangeOrigin, 'load');
  assert.equal(afterPersist.sourceLocationState.isStale, false);
  assert.equal(afterPersist.sourceLocationState.revision, 2);
  assert.equal(afterPersist.sourceLocationState.status, 'idle');
  assert.equal(afterPersist.sourceLocationState.reason, null);
  assert.equal(afterPersist.dirtyDesign, false);
  assert.equal(afterPersist.dirtySource, false);
  assert.equal(afterPersist.syncConflictError, null);

  assert.equal(afterSecondPersist.documentText, '<html><body><main></main></body></html>');
  assert.equal(afterSecondPersist.persistedText, '<html><body><main></main></body></html>');
  assert.equal(afterSecondPersist.version, 'v2');
  assert.equal(afterSecondPersist.editorRevision, 3);
  assert.equal(afterSecondPersist.sourceLocationState.revision, 3);
  assert.equal(afterSecondPersist.sourceLocationState.isStale, false);
});

test('updateCurrentDocument bumps revision, records origin, and marks mapping stale', () => {
  const initial = setPersistedDocumentState(createHtmlDocumentControllerState(), {
    content: '<html><body></body></html>',
    version: 'v1',
  });
  const next = updateCurrentDocumentState(initial, '<html><body><section></section></body></html>', 'design');

  assert.equal(next.documentText, '<html><body><section></section></body></html>');
  assert.equal(next.editorRevision, 2);
  assert.equal(next.lastChangeOrigin, 'design');
  assert.equal(next.sourceLocationState.isStale, true);
  assert.equal(next.sourceLocationState.revision, 2);
  assert.equal(next.sourceLocationState.status, 'idle');
  assert.equal(next.sourceLocationState.reason, null);
  assert.equal(next.dirtyDesign, false);
  assert.equal(next.dirtySource, false);
});

test('setDocumentText updates revision, origin, and stale mapping state', () => {
  const initial = setPersistedDocumentState(createHtmlDocumentControllerState(), {
    content: '<html><body></body></html>',
    version: 'v1',
  });
  const revisionRef = { current: initial.editorRevision };
  const reservedBeforeWrite = reserveNextHtmlDocumentRevision(revisionRef);
  const next = setDocumentTextState(initial, '<html><body><p>edited</p></body></html>');
  const reservedAfterWrite = reserveNextHtmlDocumentRevision(revisionRef);

  assert.equal(reservedBeforeWrite, 2);
  assert.equal(reservedAfterWrite, 3);
  assert.equal(next.documentText, '<html><body><p>edited</p></body></html>');
  assert.equal(next.editorRevision, 2);
  assert.equal(next.lastChangeOrigin, 'source');
  assert.equal(next.sourceLocationState.isStale, true);
  assert.equal(next.sourceLocationState.revision, 2);
  assert.equal(next.sourceLocationState.status, 'idle');
  assert.equal(next.sourceLocationState.reason, null);
});

test('applyDesignToSource and applySourceToDesign preserve revision invariants and dirty flags', () => {
  const initial = setPersistedDocumentState(createHtmlDocumentControllerState(), {
    content: '<html><body></body></html>',
    version: 'v1',
  });
  const revisionRef = { current: initial.editorRevision };
  const reservedDesign = reserveNextHtmlDocumentRevision(revisionRef);
  const afterDesign = applyDesignToSourceState(initial, '<html><body><section></section></body></html>');
  const reservedSource = reserveNextHtmlDocumentRevision(revisionRef);
  const afterSource = applySourceToDesignState(initial, '<html><body><aside></aside></body></html>');

  assert.equal(reservedDesign, 2);
  assert.equal(reservedSource, 3);
  assert.equal(afterDesign.documentText, '<html><body><section></section></body></html>');
  assert.equal(afterDesign.editorRevision, 2);
  assert.equal(afterDesign.lastChangeOrigin, 'design');
  assert.equal(afterDesign.sourceLocationState.isStale, true);
  assert.equal(afterDesign.sourceLocationState.revision, 2);
  assert.equal(afterDesign.dirtyDesign, false);
  assert.equal(afterDesign.dirtySource, false);

  assert.equal(afterSource.documentText, '<html><body><aside></aside></body></html>');
  assert.equal(afterSource.editorRevision, 2);
  assert.equal(afterSource.lastChangeOrigin, 'source');
  assert.equal(afterSource.sourceLocationState.isStale, true);
  assert.equal(afterSource.sourceLocationState.revision, 2);
  assert.equal(afterSource.dirtyDesign, false);
  assert.equal(afterSource.dirtySource, false);
});

test('revision reservations stay monotonic across write and persist operations', () => {
  const initial = setPersistedDocumentState(createHtmlDocumentControllerState(), {
    content: '<html><body></body></html>',
    version: 'v1',
  });
  const revisionRef = { current: initial.editorRevision };

  const afterTextRevision = reserveNextHtmlDocumentRevision(revisionRef);
  const afterText = setDocumentTextState(initial, '<html><body><p>edited</p></body></html>');
  const afterPersistRevision = reserveNextHtmlDocumentRevision(revisionRef);
  const afterPersist = setPersistedDocumentState(afterText, {
    content: '<html><body><main></main></body></html>',
    version: 'v2',
  }, afterPersistRevision);

  assert.equal(afterTextRevision, 2);
  assert.equal(afterText.editorRevision, 2);
  assert.equal(afterPersistRevision, 3);
  assert.equal(afterPersist.editorRevision, 3);
  assert.equal(afterPersist.lastChangeOrigin, 'load');
});

test('setSourceLocationResult clears stale state and stores mapping status metadata', () => {
  const initial = setPersistedDocumentState(createHtmlDocumentControllerState(), {
    content: '<html><body></body></html>',
    version: 'v1',
  });
  const stale = updateCurrentDocumentState(initial, '<html><body><section></section></body></html>', 'ai');
  const ignoredOldResult = setSourceLocationResultState(stale, {
    revision: 1,
    status: 'ready',
  });
  const ready = setSourceLocationResultState(stale, {
    revision: 2,
    status: 'ready',
  });
  const unavailable = setSourceLocationResultState(ready, {
    revision: 2,
    status: 'unavailable',
    reason: 'no source locations available',
  });

  assert.equal(ignoredOldResult.sourceLocationState.isStale, true);
  assert.equal(ignoredOldResult.sourceLocationState.revision, 2);
  assert.equal(ignoredOldResult.sourceLocationState.status, 'idle');
  assert.equal(ignoredOldResult.sourceLocationState.reason, null);

  assert.equal(ready.sourceLocationState.isStale, false);
  assert.equal(ready.sourceLocationState.revision, 2);
  assert.equal(ready.sourceLocationState.status, 'ready');
  assert.equal(ready.sourceLocationState.reason, null);

  assert.equal(unavailable.sourceLocationState.isStale, false);
  assert.equal(unavailable.sourceLocationState.revision, 2);
  assert.equal(unavailable.sourceLocationState.status, 'unavailable');
  assert.equal(unavailable.sourceLocationState.reason, 'no source locations available');
});
