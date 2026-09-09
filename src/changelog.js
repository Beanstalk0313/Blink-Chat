// Changelog loader. The human-editable source of truth is src/changelog.md
// (see the header of that file for the format). This module parses it into
// entries at build time via Vite's ?raw import, and exposes the same API the
// native What's New screen has always used.
import raw from './changelog.md?raw';

const ENTRY_HEADER_RE = /^##\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(.+?)\s*$/;

export const CHANGELOG = String(raw || '')
  .split(/\r?\n/)
  .reduce((entries, line) => {
    const match = line.match(ENTRY_HEADER_RE);
    if (match) {
      entries.push({ version: match[1], date: match[2], title: match[3], notes: [] });
      return entries;
    }
    const note = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (note && entries.length) entries[entries.length - 1].notes.push(note[1]);
    return entries;
  }, [])
  .filter(entry => entry.notes.length);

export function changelogEntryFor(version) {
  return CHANGELOG.find(entry => entry.version === version) || null;
}
