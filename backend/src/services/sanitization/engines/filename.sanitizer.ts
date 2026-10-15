import path from 'path';

export class FilenameSanitizer {
  public static sanitizeFilename(originalFilename: string, sanitizationRunId: string): { cleanFilename: string; hasPiiPattern: boolean } {
    const ext = path.extname(originalFilename);
    const basename = path.basename(originalFilename, ext);

    // Detect potential PII patterns in original filename (emails, SSNs, names, phone numbers)
    const piiPatterns = [
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email pattern
      /(?:\b|_)\d{3}-\d{2}-\d{4}(?:\b|_)/, // SSN pattern
      /(?:\b|_)\d{10}(?:\b|_)/, // Phone/ID pattern
      /(passport|ssn|invoice|salary|tax|medical|secret|private)/i, // Sensitive label keywords
    ];

    const hasPiiPattern = piiPatterns.some((pattern) => pattern.test(basename));
    const cleanFilename = `sanitized_${sanitizationRunId}${ext.toLowerCase()}`;

    return { cleanFilename, hasPiiPattern };
  }
}
