import { Request, Response } from 'express';
import pdfParse from 'pdf-parse';
import { TesseractOCRProvider } from '../services/ocr/ocr.provider';
import { EvidenceAggregator, CandidateInput } from '../detection/evidenceAggregator';
import { DocumentClassifier } from '../detection/documentClassifier';
import { logger } from '../utils/logger';

export class ScanController {
  private ocrProvider = new TesseractOCRProvider();

  /**
   * Universal document text extraction endpoint with automatic OCR fallback.
   * Extracts clean readable text from PDFs, images, DOCX, CSV, TXT.
   */
  public extractFile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded.' });
        return;
      }

      const fileBuffer = req.file.buffer;
      const originalName = req.file.originalname || 'document.pdf';
      const ext = originalName.split('.').pop()?.toLowerCase() || 'txt';
      const forceOcr = req.body?.ocr === 'true' || req.query?.ocr === 'true';

      logger.info(
        { filename: originalName, size: fileBuffer.length, ext, forceOcr },
        'Scan extraction request received'
      );

      // 1. PDF Processing
      if (ext === 'pdf') {
        let extractedText = '';
        let numPages = 1;
        let method = 'NATIVE_TEXT';

        if (!forceOcr) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pdfModule: any = pdfParse;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const PDFParseClass: any =
              pdfModule?.PDFParse ||
              pdfModule?.default?.PDFParse ||
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              (typeof require !== 'undefined' ? require('pdf-parse')?.PDFParse : undefined);

            if (PDFParseClass) {
              const parser = new PDFParseClass({ data: fileBuffer });
              await parser.load();
              const textResult = await parser.getText();
              const pageTexts = (textResult.pages || [])
                .map((p: { text?: string }) => (p.text ? p.text.trim() : ''))
                .filter((t: string) => t.length > 0);
              extractedText = pageTexts.join('\n\n');
              numPages = textResult.total || 1;
              await parser.destroy();
            } else if (typeof pdfParse === 'function') {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const parsed: any = await (pdfParse as any)(fileBuffer, { max: 500 });
              extractedText = parsed.text ? parsed.text.trim() : '';
              numPages = parsed.numpages || 1;
            }
          } catch (pdfErr) {
            logger.warn({ err: pdfErr }, 'Native PDF text extraction failed, checking for OCR fallback');
          }
        }

        // Check if text is empty/sparse (Scanned image PDF) or forceOcr was requested
        if (forceOcr || !extractedText || extractedText.length < 30) {
          logger.info('PDF contains no native text or OCR requested, running Tesseract OCR...');
          try {
            // Check for embedded JPEG / PNG raster images in the PDF stream
            let imageBuffer: Buffer | null = null;
            const jpegStart = fileBuffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
            const pngStart = fileBuffer.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

            if (jpegStart !== -1) {
              const jpegEnd = fileBuffer.indexOf(Buffer.from([0xff, 0xd9]), jpegStart);
              imageBuffer = jpegEnd !== -1 ? fileBuffer.subarray(jpegStart, jpegEnd + 2) : fileBuffer.subarray(jpegStart);
            } else if (pngStart !== -1) {
              const pngEnd = fileBuffer.indexOf(Buffer.from('IEND'), pngStart);
              imageBuffer = pngEnd !== -1 ? fileBuffer.subarray(pngStart, pngEnd + 8) : fileBuffer.subarray(pngStart);
            }

            if (imageBuffer && imageBuffer.length > 100) {
              const ocrRes = await this.ocrProvider.recognize(imageBuffer, { language: 'eng' });
              if (ocrRes.text && ocrRes.text.trim().length > 0) {
                extractedText = ocrRes.text.trim();
                method = 'OCR';
              }
            }
          } catch (ocrErr) {
            logger.warn({ err: ocrErr }, 'Tesseract OCR on PDF stream failed');
          }
        }

        const lines = extractedText.split('\n').filter((l) => l.trim().length > 0);
        res.status(200).json({
          success: true,
          format: 'PDF',
          text: extractedText || 'No readable text could be extracted from PDF.',
          lineCount: lines.length,
          pageCount: numPages,
          method,
        });
        return;
      }

      // 2. Image Processing (PNG, JPG, JPEG, TIFF)
      if (['png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp'].includes(ext)) {
        logger.info('Running Tesseract OCR on image file...');
        const ocrRes = await this.ocrProvider.recognize(fileBuffer, { language: 'eng' });
        const ocrText = ocrRes.text ? ocrRes.text.trim() : '';
        const lines = ocrText.split('\n').filter((l) => l.trim().length > 0);

        res.status(200).json({
          success: true,
          format: 'IMAGE',
          text: ocrText || 'No text detected by OCR in this image.',
          lineCount: lines.length,
          pageCount: 1,
          method: 'OCR',
          confidence: ocrRes.confidence,
        });
        return;
      }

      // 3. Plain Text / CSV / JSON
      const rawText = fileBuffer.toString('utf-8');
      const lines = rawText.split('\n');
      res.status(200).json({
        success: true,
        format: ext.toUpperCase(),
        text: rawText,
        lineCount: lines.length,
        pageCount: 1,
        method: 'NATIVE_TEXT',
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ error: errMsg }, 'Scan extraction error');
      res.status(500).json({ success: false, error: errMsg });
    }
  };

  /**
   * Dedicated OCR endpoint to explicitly run Tesseract OCR on an image or PDF.
   */
  public ocrFile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded.' });
        return;
      }

      const fileBuffer = req.file.buffer;
      const originalName = req.file.originalname || 'image.png';
      const ocrRes = await this.ocrProvider.recognize(fileBuffer, { language: 'eng' });

      res.status(200).json({
        success: true,
        filename: originalName,
        text: ocrRes.text.trim(),
        confidence: ocrRes.confidence,
        blocks: ocrRes.blocks,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ error: errMsg }, 'Scan OCR error');
      res.status(500).json({ success: false, error: errMsg });
    }
  };

  /**
   * Evidence-based PII Detection endpoint combining pattern detection, context analysis,
   * document type classification, proximity clustering, and three-way decisioning.
   */
  public detectTextOrFile = async (req: Request, res: Response): Promise<void> => {
    try {
      let text = req.body?.text || '';
      if (!text && req.file) {
        text = req.file.buffer.toString('utf-8');
      }

      if (!text || text.trim().length === 0) {
        res.status(400).json({ success: false, message: 'No text or file content provided.' });
        return;
      }

      const policyConfig = req.body?.policy || {};
      const docTypeResult = DocumentClassifier.classify(text);

      // Extract baseline candidates
      const rawCandidates: CandidateInput[] = [];

      // 1. Email pattern
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
      let match: RegExpExecArray | null;
      while ((match = emailRegex.exec(text)) !== null) {
        rawCandidates.push({
          type: 'EMAIL_ADDRESS',
          label: 'EMAIL',
          value: match[0],
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          detector: 'EmailRegexDetector',
          confidence: 0.99,
          reason: 'RFC-compliant email pattern.',
        });
      }

      // 2. Phone pattern
      const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|\b(?:\+91|0)?[6-9]\d{9}\b/g;
      while ((match = phoneRegex.exec(text)) !== null) {
        const val = match[0].trim();
        const digits = val.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 15) {
          rawCandidates.push({
            type: 'PHONE_NUMBER',
            label: 'PHONE',
            value: val,
            startOffset: match.index,
            endOffset: match.index + val.length,
            detector: 'PhoneRegexDetector',
            confidence: 0.95,
            reason: 'International/national telephone format.',
          });
        }
      }

      // 3. Credit Card pattern (with Luhn check)
      const cardRegex = /\b(?:\d{4}[ -]?){3}\d{4}\b|\b\d{13,19}\b/g;
      while ((match = cardRegex.exec(text)) !== null) {
        const val = match[0].trim();
        const clean = val.replace(/\D/g, '');
        let isLuhn = false;
        if (clean.length >= 13 && clean.length <= 19) {
          let sum = 0;
          let dbl = false;
          for (let i = clean.length - 1; i >= 0; i--) {
            let d = parseInt(clean.charAt(i), 10);
            if (dbl) {
              d *= 2;
              if (d > 9) d -= 9;
            }
            sum += d;
            dbl = !dbl;
          }
          isLuhn = sum % 10 === 0;
        }

        rawCandidates.push({
          type: 'CREDIT_CARD',
          label: 'CARD',
          value: val,
          startOffset: match.index,
          endOffset: match.index + val.length,
          detector: isLuhn ? 'CreditCardLuhnDetector' : 'CreditCardPattern',
          confidence: isLuhn ? 0.99 : 0.6,
          reason: isLuhn ? 'Valid Luhn checksum-verified card.' : 'Matches card format without checksum verification.',
        });
      }

      // 4. PAN pattern
      const panRegex = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
      while ((match = panRegex.exec(text)) !== null) {
        rawCandidates.push({
          type: 'PAN_NUMBER',
          label: 'PAN',
          value: match[0],
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          detector: 'PANDirectDetector',
          confidence: 0.96,
          reason: 'Valid Indian PAN structure (5 alpha + 4 numeric + 1 alpha).',
        });
      }

      // 5. Run central Evidence Aggregator
      const enhancedCandidates = EvidenceAggregator.aggregateAndDecide(text, rawCandidates, policyConfig);

      res.status(200).json({
        success: true,
        documentType: docTypeResult.primaryType,
        documentTypeConfidence: docTypeResult.confidence,
        candidateCount: enhancedCandidates.length,
        candidates: enhancedCandidates,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ error: errMsg }, 'Scan detect error');
      res.status(500).json({ success: false, error: errMsg });
    }
  };
}

export const scanController = new ScanController();
