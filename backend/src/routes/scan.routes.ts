import { Router } from 'express';
import multer from 'multer';
import { scanController } from '../controllers/scan.controller';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
});

// POST /api/v1/scan/extract - Extracts readable text and runs OCR if scanned PDF or image
router.post('/extract', upload.single('file'), scanController.extractFile);

// POST /api/v1/scan/ocr - Runs explicit Tesseract OCR on uploaded file
router.post('/ocr', upload.single('file'), scanController.ocrFile);

// POST /api/v1/scan/detect - Multi-signal evidence aggregation & calibrated decisioning
router.post('/detect', upload.single('file'), scanController.detectTextOrFile);

export default router;
