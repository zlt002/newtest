import { useState, useEffect } from 'react';
import { version } from '../../../package.json';
import { ReleaseInfo } from '../../types/sharedTypes';
import { authenticatedFetch } from '../../utils/api';

type VersionCheckSnapshot = {
  updateAvailable: boolean;
  latestVersion: string | null;
  releaseInfo: ReleaseInfo | null;
};

const DEFAULT_SNAPSHOT: VersionCheckSnapshot = {
  updateAvailable: false,
  latestVersion: null,
  releaseInfo: null,
};

const VERSION_POLL_INTERVAL_MS = 5 * 60 * 1000;
const versionCheckStore = new Map<string, VersionCheckSnapshot>();
const versionCheckInflight = new Map<string, Promise<void>>();
const versionCheckIntervals = new Map<string, number>();
const versionCheckSubscribers = new Map<string, Set<(snapshot: VersionCheckSnapshot) => void>>();

const LITE_VERSION_CHECK_KEY = 'lite';

const notifyVersionCheckSubscribers = (key: string, snapshot: VersionCheckSnapshot) => {
  const subscribers = versionCheckSubscribers.get(key);
  if (!subscribers) {
    return;
  }

  for (const subscriber of subscribers) {
    subscriber(snapshot);
  }
};

const updateVersionCheckSnapshot = (key: string, partial: Partial<VersionCheckSnapshot>) => {
  const current = versionCheckStore.get(key) ?? DEFAULT_SNAPSHOT;
  const next = { ...current, ...partial };
  versionCheckStore.set(key, next);
  notifyVersionCheckSubscribers(key, next);
};

const runVersionCheck = async () => {
  const key = LITE_VERSION_CHECK_KEY;
  if (versionCheckInflight.has(key)) {
    return versionCheckInflight.get(key);
  }

  const request = (async () => {
    try {
      const response = await authenticatedFetch('/api/system/update-info');
      const data = await response.json();

      if (response.ok && data.updateAvailable) {
        const latest = data.lastModified || data.packageId || 'lite-update.zip';
        updateVersionCheckSnapshot(key, {
          latestVersion: latest,
          updateAvailable: true,
          releaseInfo: {
            title: 'Lite 更新包已准备就绪',
            body: `更新包来源：${data.packageUrl || ''}`,
            htmlUrl: data.projectUrl || 'https://git.midea.com/zhanglt21/claudecodeuibox/-/tree/main',
            publishedAt: data.lastModified || '',
          },
        });
      } else {
        updateVersionCheckSnapshot(key, {
          updateAvailable: false,
          latestVersion: null,
          releaseInfo: null,
        });
      }
    } catch (error) {
      console.error('Version check failed:', error);
      updateVersionCheckSnapshot(key, {
        updateAvailable: false,
        latestVersion: null,
        releaseInfo: null,
      });
    } finally {
      versionCheckInflight.delete(key);
    }
  })();

  versionCheckInflight.set(key, request);
  return request;
};

export const useVersionCheck = () => {
  const key = LITE_VERSION_CHECK_KEY;
  const [snapshot, setSnapshot] = useState<VersionCheckSnapshot>(() => versionCheckStore.get(key) ?? DEFAULT_SNAPSHOT);

  useEffect(() => {
    setSnapshot(versionCheckStore.get(key) ?? DEFAULT_SNAPSHOT);

    const subscribers = versionCheckSubscribers.get(key) ?? new Set();
    subscribers.add(setSnapshot);
    versionCheckSubscribers.set(key, subscribers);

    void runVersionCheck();

    if (!versionCheckIntervals.has(key)) {
      const intervalId = window.setInterval(() => {
        void runVersionCheck();
      }, VERSION_POLL_INTERVAL_MS);
      versionCheckIntervals.set(key, intervalId);
    }

    return () => {
      const currentSubscribers = versionCheckSubscribers.get(key);
      currentSubscribers?.delete(setSnapshot);
      if (currentSubscribers && currentSubscribers.size === 0) {
        versionCheckSubscribers.delete(key);
      }
    };
  }, [key]);

  return {
    updateAvailable: snapshot.updateAvailable,
    latestVersion: snapshot.latestVersion,
    currentVersion: version,
    releaseInfo: snapshot.releaseInfo,
  };
};
