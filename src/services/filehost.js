// File hosting for chat attachments.
//
// Temporary files go straight from the browser to Litterbox, Catbox's
// expiring host: it answers cross-origin uploads, so the page can read back
// the link. Permanent files belong on Catbox itself, but catbox.moe sends no
// CORS headers at all, so a browser can send an upload and then never learn
// the URL. That path stays off until there is a small relay to do it.
const LITTERBOX_ENDPOINT = 'https://litterbox.catbox.moe/resources/internals/api.php';

export const PERMANENT_UPLOADS_AVAILABLE = false;

export const UPLOAD_LIMITS = {
  temporary: 1024 * 1024 * 1024, // Litterbox's 1 GB cap
  permanent: 200 * 1024 * 1024 // Catbox's 200 MB cap
};

export const TEMPORARY_DURATIONS = [
  { value: '1h', label: '1 hour', milliseconds: 60 * 60 * 1000 },
  { value: '12h', label: '12 hours', milliseconds: 12 * 60 * 60 * 1000 },
  { value: '24h', label: '24 hours', milliseconds: 24 * 60 * 60 * 1000 },
  { value: '72h', label: '3 days', milliseconds: 72 * 60 * 60 * 1000 }
];

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let scaled = value;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

export function temporaryDuration(value) {
  return TEMPORARY_DURATIONS.find(duration => duration.value === value) || TEMPORARY_DURATIONS[2];
}

// Resolves with { url, name, size, duration, expiresAt }. Litterbox answers
// with the plain link on success and a sentence explaining the refusal on
// failure, so both cases are read as text.
//
// This deliberately uses fetch, not XHR: uploading through XHR with a download
// progress listener makes Chrome preflight the request, and Litterbox answers
// preflights with a 405, so the upload fails. fetch sends it as a plain
// multipart request, which goes straight through.
export async function uploadFile(file, { duration = '24h', signal } = {}) {
  if (!file) throw new Error('Pick a file to upload.');
  if (file.size > UPLOAD_LIMITS.temporary) {
    throw new Error(`Files can be up to ${formatBytes(UPLOAD_LIMITS.temporary)}.`);
  }

  const body = new FormData();
  body.append('reqtype', 'fileupload');
  body.append('time', temporaryDuration(duration).value);
  body.append('fileToUpload', file);

  let response;
  try {
    response = await fetch(LITTERBOX_ENDPOINT, { method: 'POST', body, signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Upload cancelled.', { cause: error });
    throw new Error('Could not reach Litterbox. Check your connection.', { cause: error });
  }

  const answer = (await response.text()).trim();
  // Refusals arrive as a short sentence, but a block or rate limit comes back
  // as a whole HTML error page, which is never worth showing to anyone.
  const isPage = !answer || answer.startsWith('<');
  if (!response.ok) {
    if (response.status === 429 || response.status === 403) {
      throw new Error('Litterbox is turning uploads away right now. Wait a few minutes and try again.');
    }
    throw new Error(isPage ? `Litterbox refused that upload (${response.status}).` : answer);
  }
  if (isPage || !/^https?:\/\/\S+$/.test(answer)) {
    throw new Error('Litterbox did not send back a link. Try again in a moment.');
  }

  return {
    url: answer,
    name: file.name,
    size: file.size,
    duration: temporaryDuration(duration).value,
    expiresAt: new Date(Date.now() + temporaryDuration(duration).milliseconds).toISOString()
  };
}
