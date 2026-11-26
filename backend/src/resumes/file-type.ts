export const PDF = 'application/pdf';
export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const TXT = 'text/plain';

/** Detect the real file type from magic bytes + extension; reject anything else. */
export function detectResumeType(fileName: string, buf: Buffer): string | null {
  const lower = fileName.toLowerCase();
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return PDF;
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04 && lower.endsWith('.docx'))
    return DOCX;
  if (lower.endsWith('.txt')) {
    const sample = buf.subarray(0, 4096);
    return sample.includes(0) ? null : TXT;
  }
  return null;
}

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'resume';
  return base.replace(/[^\w.-]+/g, '_').slice(-120) || 'resume';
}
