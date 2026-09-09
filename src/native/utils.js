function isWordCharacter(character) {
  return Boolean(character && /[A-Za-z0-9_]/.test(character));
}

// Scans message text and returns every @user / @everyone / @role / #channel
// mention as a range, preferring the longest display name when names overlap.
// Ported from the web ChatArea so mention semantics stay identical.
export function collectMentionRanges(text, members, channels, roles) {
  if (!text) return [];
  const lowerText = text.toLowerCase();
  const ranges = [];

  const addTriggerMatches = (trigger, candidates) => {
    const ordered = [...candidates].sort((first, second) => second.label.length - first.label.length);
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== trigger || isWordCharacter(text[index - 1])) continue;
      for (const candidate of ordered) {
        const name = candidate.label;
        if (lowerText.slice(index + 1, index + 1 + name.length) !== name) continue;
        if (isWordCharacter(text[index + 1 + name.length])) continue;
        ranges.push({ start: index, end: index + 1 + name.length, ...candidate });
        break;
      }
    }
  };

  addTriggerMatches('@', [
    ...members.filter(member => member?.displayName).map(member => ({ kind: 'user', label: member.displayName.trim().toLowerCase(), user: member })),
    { kind: 'everyone', label: 'everyone' },
    ...Object.values(roles || {}).filter(role => role?.name).map(role => ({ kind: 'role', label: role.name.trim().toLowerCase(), role }))
  ]);
  addTriggerMatches('#', channels
    .filter(channel => channel?.name && channel.type !== 'voice')
    .map(channel => ({ kind: 'channel', label: channel.name.trim().toLowerCase(), channel })));

  ranges.sort((first, second) => first.start - second.start || (second.end - first.end));
  const nonOverlapping = [];
  let cursor = -1;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    nonOverlapping.push(range);
    cursor = range.end;
  }
  return nonOverlapping;
}

export function timeShort(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // Messages older than a day show the date too, so old messages are not
  // mistaken for today's (e.g. "Sep 3, 2:30 PM" instead of "2:30 PM").
  if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
  }
  return time;
}

// iMessage-style send feedback sound, played only on iOS (Android keeps the
// silent Material send). Vite bundles the mp3 as an asset URL; the audio
// element is created per send so repeated sends always play.
import iosSentSound from '../assets/iOS_sent.mp3';
import { detectNativeDevice } from './device';

export function playSentSound() {
  if (detectNativeDevice().os !== 'ios') return;
  try {
    new Audio(iosSentSound).play().catch(() => {});
  } catch {
    /* Audio may be blocked; the message was still sent. */
  }
}
