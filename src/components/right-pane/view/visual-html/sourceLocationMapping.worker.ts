import { buildSourceLocationMap, type SourceLocationMap } from './sourceLocationMapping';

type SourceLocationWorkerRequest = {
  type: 'build-source-location-map';
  html: string;
  revision: number;
};

type SourceLocationWorkerResponse =
  | {
      type: 'source-location-map-result';
      revision: number;
      mapping: SourceLocationMap;
    }
  | {
      type: 'source-location-map-error';
      revision: number;
      reason: string;
    };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<SourceLocationWorkerRequest>) => void) | null;
  postMessage: (message: SourceLocationWorkerResponse) => void;
};

workerScope.onmessage = (event: MessageEvent<SourceLocationWorkerRequest>) => {
  const message = event.data;
  if (message?.type !== 'build-source-location-map') {
    return;
  }

  try {
    const mapping = buildSourceLocationMap(message.html, message.revision);
    workerScope.postMessage({
      type: 'source-location-map-result',
      revision: message.revision,
      mapping,
    } satisfies SourceLocationWorkerResponse);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    workerScope.postMessage({
      type: 'source-location-map-error',
      revision: message.revision,
      reason,
    } satisfies SourceLocationWorkerResponse);
  }
};
