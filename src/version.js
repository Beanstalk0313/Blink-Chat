import pkg from '../package.json';
import { CHANGELOG } from './changelog';

// The app version is the newest block in src/changelog.md (newest first).
// Publishing a new "What's new" entry automatically becomes the new app
// version, which is what makes the What's New screen open for everyone on
// first launch. package.json is only a fallback/consistency value.
export const APP_VERSION = CHANGELOG[0]?.version || pkg.version;

const SEEN_VERSIONS_KEY = 'blink-seen-versions';

export function getSeenVersions() {
  try {
    const raw = window.localStorage.getItem(SEEN_VERSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isVersionSeen(version) {
  return getSeenVersions().includes(version);
}

export function markVersionSeen(version = APP_VERSION) {
  try {
    const seen = getSeenVersions();
    if (!seen.includes(version)) {
      seen.push(version);
      window.localStorage.setItem(SEEN_VERSIONS_KEY, JSON.stringify(seen));
    }
    return true;
  } catch {
    return false;
  }
}

// Convenience check used by the shells: returns true (and records the version)
// the first time a build with a given APP_VERSION is opened on this device.
export function checkAndMarkSeenVersion(version = APP_VERSION) {
  if (isVersionSeen(version)) return false;
  markVersionSeen(version);
  return true;
}
