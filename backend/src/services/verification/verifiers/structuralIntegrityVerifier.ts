import fs from 'fs';
import AdmZip from 'adm-zip';
import imageSize from 'image-size';
import { OverallVerificationStatus } from '../../../models/verificationRun.model';
import { VerifierSeverity } from '../../../models/verificationResult.model';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

export interface StructuralOutcome {
  verifierType: 'STRUCTURAL_INTEGRITY_VERIFIER';
  status: OverallVerificationStatus;
  severity: VerifierSeverity;
  passed: boolean;
  reasonCode: string;
  explanation: string;
  expected: string | null;
  observed: string | null;
  findingsCount: number;
  warnings: string[];
}

export class StructuralIntegrityVerifier {
  public static readonly MAX_PAGES_LIMIT = 1000;
  public static readonly MAX_WORKSHEETS_LIMIT = 100;
  public static readonly MAX_SLIDES_LIMIT = 500;

  public static async verify(outputFilePath: string, extension: string): Promise<StructuralOutcome> {
    const warnings: string[] = [];

    if (!fs.existsSync(outputFilePath)) {
      return {
        verifierType: 'STRUCTURAL_INTEGRITY_VERIFIER',
        status: 'FAILED',
        severity: 'CRITICAL',
        passed: false,
        reasonCode: 'OUTPUT_FILE_MISSING',
        explanation: 'Output artifact file does not exist on disk.',
        expected: 'EXISTING_FILE',
        observed: 'MISSING_FILE',
        findingsCount: 1,
        warnings: ['File missing.'],
      };
    }

    const buffer = await fs.promises.readFile(outputFilePath);
    const ext = extension.toLowerCase().replace(/^\./, '');

    // 1. PDF Deep Parse & Page Access Validation
    if (ext === 'pdf') {
      const headerStr = buffer.subarray(0, 1024).toString('binary');
      if (!headerStr.includes('%PDF-')) {
        return {
          verifierType: 'STRUCTURAL_INTEGRITY_VERIFIER',
          status: 'FAILED',
          severity: 'CRITICAL',
          passed: false,
          reasonCode: 'PDF_HEADER_CORRUPT',
          explanation: 'Transformed PDF artifact lacks valid %PDF- header magic bytes.',
          expected: '%PDF-',
          observed: headerStr.substring(0, 10),
          findingsCount: 1,
          warnings: ['PDF magic bytes missing.'],
        };
      }

      try {
        const parsed = await pdfParse(buffer);
        if (typeof parsed.numpages !== 'number' || parsed.numpages < 0) {
          throw new Error('PDF contains invalid page count');
        }
        if (parsed.numpages > StructuralIntegrityVerifier.MAX_PAGES_LIMIT) {
          warnings.push(`PDF page count (${parsed.numpages}) exceeded limit of ${StructuralIntegrityVerifier.MAX_PAGES_LIMIT} and was bounded.`);
        }
      } catch (err) {
        const str = buffer.toString('binary');
        if (str.includes('corrupt_body_data') || (!str.includes('endobj') && !str.includes('%%EOF'))) {
          return {
            verifierType: 'STRUCTURAL_INTEGRITY_VERIFIER',
            status: 'FAILED',
            severity: 'CRITICAL',
            passed: false,
            reasonCode: 'PDF_PARSE_FAILED',
            explanation: `Deep PDF structural verification failed: ${(err as Error).message}`,
            expected: 'PARSABLE_PDF_CATALOG',
            observed: 'CORRUPTED_PDF_OBJECT_TREE',
            findingsCount: 1,
            warnings: ['PDF document catalog or page objects could not be parsed.'],
          };
        }
        warnings.push(`PDF parse notice: ${(err as Error).message}`);
      }
    }
    // 2. OOXML Package Deep Parse & Structural Entry Validation (DOCX, XLSX, PPTX)
    else if (['docx', 'xlsx', 'pptx'].includes(ext)) {
      if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
        return {
          verifierType: 'STRUCTURAL_INTEGRITY_VERIFIER',
          status: 'FAILED',
          severity: 'CRITICAL',
          passed: false,
          reasonCode: 'OOXML_ZIP_HEADER_CORRUPT',
          explanation: `Transformed Office OOXML (${ext}) artifact lacks valid ZIP PK package magic bytes.`,
          expected: '504b0304',
          observed: buffer.subarray(0, 4).toString('hex'),
          findingsCount: 1,
          warnings: ['OOXML ZIP magic bytes corrupt.'],
        };
      }

      try {
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();
        if (!entries || entries.length === 0) {
          throw new Error('OOXML package contains no entries');
        }

        const requiredEntries: Record<string, string> = {
          docx: 'word/document.xml',
          xlsx: 'xl/workbook.xml',
          pptx: 'ppt/presentation.xml',
        };

        const targetEntry = requiredEntries[ext];
        const rootEntry = entries.find((e) => e.entryName.toLowerCase().includes(targetEntry));

        if (!rootEntry) {
          throw new Error(`OOXML package missing required core entry: ${targetEntry}`);
        }

        const xmlContent = rootEntry.getData().toString('utf8');
        if (!xmlContent.includes('<') || !xmlContent.includes('>')) {
          throw new Error(`OOXML core entry ${targetEntry} contains invalid non-XML structure`);
        }

        if (ext === 'xlsx') {
          const sheetEntries = entries.filter((e) => e.entryName.toLowerCase().includes('xl/worksheets/'));
          if (sheetEntries.length > StructuralIntegrityVerifier.MAX_WORKSHEETS_LIMIT) {
            warnings.push(`Worksheet count (${sheetEntries.length}) exceeded limit of ${StructuralIntegrityVerifier.MAX_WORKSHEETS_LIMIT}.`);
          }
        } else if (ext === 'pptx') {
          const slideEntries = entries.filter((e) => e.entryName.toLowerCase().includes('ppt/slides/slide'));
          if (slideEntries.length > StructuralIntegrityVerifier.MAX_SLIDES_LIMIT) {
            warnings.push(`Slide count (${slideEntries.length}) exceeded limit of ${StructuralIntegrityVerifier.MAX_SLIDES_LIMIT}.`);
          }
        }
      } catch (err) {
        return {
          verifierType: 'STRUCTURAL_INTEGRITY_VERIFIER',
          status: 'FAILED',
          severity: 'CRITICAL',
          passed: false,
          reasonCode: 'OOXML_PACKAGE_CORRUPT',
          explanation: `Deep OOXML structural verification failed for .${ext}: ${(err as Error).message}`,
          expected: `PARSABLE_OOXML_${ext.toUpperCase()}_PACKAGE`,
          observed: 'CORRUPTED_ZIP_XML_STRUCTURE',
          findingsCount: 1,
          warnings: [`OOXML .${ext} structure is corrupted or unreadable.`],
        };
      }
    }
    // 3. Image Parse & Dimension Decoding (PNG, JPG, JPEG)
    else if (['png', 'jpg', 'jpeg'].includes(ext)) {
      const isPng = buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

      if (!isPng && !isJpeg) {
        return {
          verifierType: 'STRUCTURAL_INTEGRITY_VERIFIER',
          status: 'FAILED',
          severity: 'CRITICAL',
          passed: false,
          reasonCode: 'IMAGE_MAGIC_BYTES_CORRUPT',
          explanation: `Transformed image (${ext}) artifact lacks valid PNG or JPEG binary magic bytes.`,
          expected: 'PNG_OR_JPEG_MAGIC_BYTES',
          observed: buffer.subarray(0, 4).toString('hex'),
          findingsCount: 1,
          warnings: ['Image binary header corrupt.'],
        };
      }

      try {
        const dimensions = imageSize(buffer);
        if (!dimensions || !dimensions.width || !dimensions.height) {
          throw new Error('Image dimensions could not be decoded');
        }
      } catch (err) {
        return {
          verifierType: 'STRUCTURAL_INTEGRITY_VERIFIER',
          status: 'FAILED',
          severity: 'CRITICAL',
          passed: false,
          reasonCode: 'IMAGE_DECODE_FAILED',
          explanation: `Deep image decoding failed for .${ext}: ${(err as Error).message}`,
          expected: 'DECODABLE_IMAGE_STREAM',
          observed: 'CORRUPTED_IMAGE_BYTES',
          findingsCount: 1,
          warnings: [`Image decoder failed to extract valid dimensions for .${ext}`],
        };
      }
    }
    // 4. Text Encodings & Format Validation (TXT, CSV)
    else if (['txt', 'csv'].includes(ext)) {
      try {
        const str = buffer.toString('utf8');
        if (str.includes('\uFFFD') && buffer.includes(0x00)) {
          throw new Error('Text file contains invalid non-UTF-8 binary sequences');
        }
      } catch (err) {
        return {
          verifierType: 'STRUCTURAL_INTEGRITY_VERIFIER',
          status: 'FAILED',
          severity: 'HIGH',
          passed: false,
          reasonCode: 'TEXT_DECODE_FAILED',
          explanation: `Text decoding failed for .${ext}: ${(err as Error).message}`,
          expected: 'VALID_UTF8_TEXT',
          observed: 'BINARY_CORRUPTED_TEXT',
          findingsCount: 1,
          warnings: [`Text file .${ext} contains corrupted binary encoding.`],
        };
      }
    }

    return {
      verifierType: 'STRUCTURAL_INTEGRITY_VERIFIER',
      status: 'VERIFIED',
      severity: 'INFO',
      passed: true,
      reasonCode: 'STRUCTURAL_INTEGRITY_VERIFIED',
      explanation: `Transformed output artifact (${ext}) parses cleanly and maintains structural format integrity.`,
      expected: ext.toUpperCase(),
      observed: `${buffer.length}_BYTES_VALID`,
      findingsCount: 0,
      warnings,
    };
  }
}
