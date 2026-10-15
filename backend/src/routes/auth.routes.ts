import { Router } from 'express';
import { register, login, logout, refresh, getMe } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { registerLimiter, loginLimiter, refreshLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/logout', authenticate, logout);
router.post('/refresh', refreshLimiter, refresh);
router.get('/me', authenticate, getMe);

export default router;
