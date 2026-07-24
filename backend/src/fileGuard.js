// Upload safety checks for resume files.
//
// The browser's declared Content-Type can be faked (rename virus.exe to
// resume.pdf and it still claims application/pdf), so we verify the file by its
// actual leading bytes — the "magic number" — after it is written to disk. A
// file whose real content is not a genuine PDF or Word document is rejected and
// deleted before any record is stored.
//
// This is defence in depth on top of: an extension/MIME allow-list, a 5 MB
// size cap, random stored filenames, a non-executable upload folder, and
// downloads served strictly as attachments with nosniff.
import fs from 'fs';

// Known-good file signatures for the formats a resume may use.
const SIGNATURES = [
  // PDF — "%PDF"
  { type: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  // Modern Office (.docx) is a ZIP container — "PK\x03\x04" / "PK\x05\x06" / "PK\x07\x08"
  { type: 'docx', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { type: 'docx', bytes: [0x50, 0x4b, 0x05, 0x06] },
  { type: 'docx', bytes: [0x50, 0x4b, 0x07, 0x08] },
  // Legacy Word (.doc) OLE2 compound file — "D0 CF 11 E0 A1 B1 1A E1"
  { type: 'doc', bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }
];

// Byte patterns that must NEVER appear at the start of an upload: executables
// and scripts. A clear, explicit block on top of the allow-list above.
const FORBIDDEN = [
  { label: 'Windows executable', bytes: [0x4d, 0x5a] }, // "MZ" — .exe/.dll
  { label: 'Linux executable', bytes: [0x7f, 0x45, 0x4c, 0x46] }, // ELF
  { label: 'shell script', bytes: [0x23, 0x21] } // "#!"
];

function startsWith(buffer, bytes) {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

// Read just the first bytes of a file — enough to identify its true type.
function readHeader(filePath, length = 8) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, 0);
    return buffer;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Verify a saved upload really is a PDF or Word document.
 * @returns {{ ok: true, type: string } | { ok: false, reason: string }}
 */
function verifyResumeFile(filePath) {
  let header;
  try {
    header = readHeader(filePath);
  } catch {
    return { ok: false, reason: 'The uploaded file could not be read.' };
  }

  if (!header.length) {
    return { ok: false, reason: 'The uploaded file is empty.' };
  }

  for (const bad of FORBIDDEN) {
    if (startsWith(header, bad.bytes)) {
      return { ok: false, reason: `Executable files are not allowed (${bad.label}).` };
    }
  }

  const match = SIGNATURES.find((signature) => startsWith(header, signature.bytes));
  if (!match) {
    return {
      ok: false,
      reason: 'The file is not a valid PDF or Word document. Please upload a real resume file.'
    };
  }

  return { ok: true, type: match.type };
}

// Delete a rejected upload so nothing untrusted lingers on disk.
function removeFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Already gone — nothing to do.
  }
}

export {
  verifyResumeFile,
  removeFile
};
