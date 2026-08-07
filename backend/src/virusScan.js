// Optional antivirus scan for uploaded files, using ClamAV (clamd daemon).
//
// This is a no-op UNLESS CLAMAV_ENABLED=true AND a clamd daemon is reachable.
// That way environments without ClamAV (e.g. the current Render deploy) keep
// working unchanged — nothing is scanned, nothing breaks.
//
// When enabled, every uploaded resume is streamed to ClamAV. If ClamAV reports
// the file infected, the upload is rejected. If the scanner cannot be reached,
// we FAIL CLOSED by default (reject the upload) because a resume portal should
// err on the side of safety; set CLAMAV_FAIL_CLOSED=false to allow instead.
import NodeClam from 'clamscan';

const ENABLED = String(process.env.CLAMAV_ENABLED || '').toLowerCase() === 'true';
const HOST = process.env.CLAMAV_HOST || '127.0.0.1';
const PORT = Number(process.env.CLAMAV_PORT || 3310);
const TIMEOUT = Number(process.env.CLAMAV_TIMEOUT_MS || 60000);
const FAIL_CLOSED =
  String(process.env.CLAMAV_FAIL_CLOSED || 'true').toLowerCase() === 'true';

let clamPromise = null;

// Connect to the clamd daemon lazily, and only once.
function getClam() {
  if (!clamPromise) {
    clamPromise = new NodeClam().init({
      clamdscan: {
        host: HOST,
        port: PORT,
        timeout: TIMEOUT,
        localFallback: false // use the daemon only; do not shell out locally
      },
      preference: 'clamdscan'
    });
  }
  return clamPromise;
}

export function clamavEnabled() {
  return ENABLED;
}

/**
 * Scan a file on disk.
 * @returns {Promise<{ ok: true, skipped?: boolean } | { ok: false, reason: string }>}
 */
export async function scanFile(filePath) {
  if (!ENABLED) return { ok: true, skipped: true };

  try {
    const clam = await getClam();
    const { isInfected, viruses } = await clam.scanFile(filePath);
    if (isInfected) {
      const name = (viruses && viruses[0]) || 'threat detected';
      return { ok: false, reason: `File failed the virus scan (${name}).` };
    }
    return { ok: true };
  } catch (error) {
    console.error('Virus scan error:', error.message);
    if (FAIL_CLOSED) {
      return { ok: false, reason: 'Virus scanner is unavailable. Please try again in a moment.' };
    }
    return { ok: true, skipped: true };
  }
}
