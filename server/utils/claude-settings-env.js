import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function normalizeEnvObject(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(candidate).filter(([, value]) => typeof value === 'string'),
  );
}

export function loadClaudeSettingsEnvSync(settingsPath = path.join(os.homedir(), '.claude', 'settings.json')) {
  try {
    const content = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(content);
    return normalizeEnvObject(settings?.env);
  } catch {
    return {};
  }
}

export function buildClaudeSdkProcessEnv({
  processEnv = process.env,
  settingsEnv = loadClaudeSettingsEnvSync(),
} = {}) {
  return {
    ...settingsEnv,
    ...processEnv,
  };
}
