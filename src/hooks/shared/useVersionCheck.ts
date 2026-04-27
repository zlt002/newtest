import { useState, useEffect } from 'react';
import { version } from '../../../package.json';
import { ReleaseInfo } from '../../types/sharedTypes';

/**
 * Compare two semantic version strings
 * Works only with numeric versions separated by dots (e.g. "1.2.3")
 * @param {string} v1 
 * @param {string} v2
 * @returns positive if v1 > v2, negative if v1 < v2, 0 if equal
 */
const compareVersions = (v1: string, v2: string) => {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 !== p2) return p1 - p2;
  }
  return 0;
};

export type InstallMode = 'git' | 'npm';

type VersionCheckSnapshot = {
  updateAvailable: boolean;
  latestVersion: string | null;
  releaseInfo: ReleaseInfo | null;
  installMode: InstallMode;
};

const DEFAULT_SNAPSHOT: VersionCheckSnapshot = {
  updateAvailable: false,
  latestVersion: null,
  releaseInfo: null,
  installMode: 'git',
};

const VERSION_POLL_INTERVAL_MS = 5 * 60 * 1000;
const versionCheckStore = new Map<string, VersionCheckSnapshot>();
const versionCheckInflight = new Map<string, Promise<void>>();
const versionCheckIntervals = new Map<string, number>();
const versionCheckSubscribers = new Map<string, Set<(snapshot: VersionCheckSnapshot) => void>>();

const buildVersionCheckKey = (owner: string, repo: string) => `${owner}/${repo}`;

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

const fetchInstallMode = async (key: string) => {
  try {
    const response = await fetch('/health');
    const data = await response.json();
    if (data.installMode === 'npm' || data.installMode === 'git') {
      updateVersionCheckSnapshot(key, { installMode: data.installMode });
    }
  } catch {
    // Default to git on error
  }
};

const runVersionCheck = async (owner: string, repo: string) => {
  const key = buildVersionCheckKey(owner, repo);
  if (versionCheckInflight.has(key)) {
    return versionCheckInflight.get(key);
  }

  const request = (async () => {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
      const data = await response.json();

      if (data.tag_name) {
        const latest = data.tag_name.replace(/^v/, '');
        updateVersionCheckSnapshot(key, {
          latestVersion: latest,
          updateAvailable: compareVersions(latest, version) > 0,
          releaseInfo: {
            title: data.name || data.tag_name,
            body: data.body || '',
            htmlUrl: data.html_url || `https://github.com/${owner}/${repo}/releases/latest`,
            publishedAt: data.published_at,
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

export const useVersionCheck = (owner: string, repo: string) => {
  const key = buildVersionCheckKey(owner, repo);
  const [snapshot, setSnapshot] = useState<VersionCheckSnapshot>(() => versionCheckStore.get(key) ?? DEFAULT_SNAPSHOT);

  useEffect(() => {
    setSnapshot(versionCheckStore.get(key) ?? DEFAULT_SNAPSHOT);

    const subscribers = versionCheckSubscribers.get(key) ?? new Set();
    subscribers.add(setSnapshot);
    versionCheckSubscribers.set(key, subscribers);

    void fetchInstallMode(key);
    void runVersionCheck(owner, repo);

    if (!versionCheckIntervals.has(key)) {
      const intervalId = window.setInterval(() => {
        void runVersionCheck(owner, repo);
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
  }, [key, owner, repo]);

  return {
    updateAvailable: snapshot.updateAvailable,
    latestVersion: snapshot.latestVersion,
    currentVersion: version,
    releaseInfo: snapshot.releaseInfo,
    installMode: snapshot.installMode,
  };
};
