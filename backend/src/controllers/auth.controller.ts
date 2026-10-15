import { Request, Response, NextFunction } from 'express';
import { registerUser, loginUser, logoutUser, getUserProfile } from '../services/auth.service';
import { rotateRefreshToken, verifyRefreshToken } from '../services/token.service';
import { AppError } from '../utils/AppError';

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, role } = req.body;
    const userDTO = await registerUser({
      email,
      password,
      role,
      ip: req.ip,
      requestId: req.id,
    });
    res.status(201).json({ user: userDTO });
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;
    const result = await loginUser({
      email,
      password,
      ip: req.ip,
      requestId: req.id,
    });

    // Set HttpOnly cookie for refresh token for extra security
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;

    let tokenId: string | undefined;
    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        tokenId = payload.tokenId;
      } catch {
        // Ignore invalid token format during logout
      }
    }

    if (userId) {
      await logoutUser(userId, tokenId, req.ip, req.id);
    }

    const cookieClearOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };

    res.clearCookie('refreshToken', cookieClearOptions);
    res.clearCookie('accessToken', cookieClearOptions);

    res.status(200).json({ message: 'Successfully logged out.' });
  } catch (err) {
    next(err);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) {
      throw AppError.badRequest('Refresh token missing.', 'REFRESH_TOKEN_REQUIRED', 401);
    }

    // Verify token to obtain user ID
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError('Invalid or expired refresh token.', 401, 'INVALID_REFRESH_TOKEN');
    }

    // Fetch user details for current role/status
    const user = await getUserProfile(payload.userId);

    const tokenPair = await rotateRefreshToken(
      refreshToken,
      user.email,
      user.role,
      user.status,
      req.id,
      req.ip
    );

    res.cookie('refreshToken', tokenPair.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json(tokenPair);
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw AppError.badRequest('Authentication required.', 'AUTHENTICATION_REQUIRED', 401);
    }
    const userDTO = await getUserProfile(req.user.id);
    res.status(200).json({ user: userDTO });
  } catch (err) {
    next(err);
  }
};
