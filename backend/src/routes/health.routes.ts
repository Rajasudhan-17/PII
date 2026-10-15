import { Router } from 'express';
import { getHealth, getLiveness, getReadiness, getMetrics } from '../controllers/health.controller';

const router = Router();

router.get('/', getHealth);
router.get('/health', getHealth);
router.get('/liveness', getLiveness);
router.get('/health/liveness', getLiveness);
router.get('/readiness', getReadiness);
router.get('/health/readiness', getReadiness);
router.get('/metrics', getMetrics);
router.get('/health/metrics', getMetrics);

export default router;
