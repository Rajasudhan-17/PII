import { User, UserRole } from '../models/user.model';
import { toUserResponseDTO, UserResponseDTO } from '../dto/user.dto';
import { validatePasswordPolicy, hashPassword, comparePassword } from '../utils/password';
import { generateAccessToken, generateRefreshToken, revokeRefreshToken, revokeAllUserTokens } from './token.service';
import { logAuthAuditEvent } from './audit.service';
import { AppError } from '../utils/AppError';
import { getConfig } from '../config/env';

export interface RegisterInput {
  email: string;
  password: string;
  role?: UserRole;
  ip?: string;
  requestId?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  ip?: string;
  requestId?: string;
}

export interface LoginResult {
  user: UserResponseDTO;
  accessToken: string;
  refreshToken: string;
}

export const registerUser = async (input: RegisterInput): Promise<UserResponseDTO> => {
  const { email, password, role = 'USER', ip, requestId } = input;

  if (!email || typeof email !== 'string') {
    throw AppError.badRequest('Valid email is required.', 'INVALID_EMAIL');
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Validate password policy
  const policyCheck = validatePasswordPolicy(password);
  if (!policyCheck.isValid) {
    throw AppError.badRequest(policyCheck.message || 'Password policy violation', 'WEAK_PASSWORD');
  }

  // Check uniqueness
  const existingUser = await User.findOne({ normalizedEmail });
  if (existingUser) {
    logAuthAuditEvent({
      event: 'AUTH_REGISTER_SUCCESS',
      requestId,
      ip,
      outcome: 'FAILURE',
      reason: 'DUPLICATE_EMAIL',
    });
    throw AppError.badRequest('An account with this email already exists.', 'USER_ALREADY_EXISTS');
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const newUser = new User({
    email: email.trim(),
    normalizedEmail,
    passwordHash,
    role,
    status: 'ACTIVE',
    emailVerified: false,
    failedLoginAttempts: 0,
    lockUntil: null,
  });

  await newUser.save();

  logAuthAuditEvent({
    event: 'AUTH_REGISTER_SUCCESS',
    userId: newUser._id.toString(),
    requestId,
    ip,
    outcome: 'SUCCESS',
  });

  return toUserResponseDTO(newUser);
};

export const loginUser = async (input: LoginInput): Promise<LoginResult> => {
  const { email, password, ip, requestId } = input;
  const config = getConfig();

  if (!email || !password) {
    throw AppError.badRequest('Email and password are required.', 'MISSING_CREDENTIALS');
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Fetch user including hidden passwordHash field
  const user = await User.findOne({ normalizedEmail }).select('+passwordHash');

  if (!user) {
    logAuthAuditEvent({
      event: 'AUTH_LOGIN_FAILURE',
      requestId,
      ip,
      outcome: 'FAILURE',
      reason: 'USER_NOT_FOUND',
    });
    throw AppError.badRequest('Invalid email or password.', 'INVALID_CREDENTIALS');
  }

  // Check account status: DISABLED
  if (user.status === 'DISABLED') {
    logAuthAuditEvent({
      event: 'AUTH_LOGIN_FAILURE',
      userId: user._id.toString(),
      requestId,
      ip,
      outcome: 'FAILURE',
      reason: 'ACCOUNT_DISABLED',
    });
    throw AppError.badRequest('Account is disabled. Please contact support.', 'ACCOUNT_DISABLED');
  }

  // Check account status: LOCKED
  if (user.status === 'LOCKED' || (user.lockUntil && user.lockUntil > new Date())) {
    if (user.lockUntil && user.lockUntil > new Date()) {
      logAuthAuditEvent({
        event: 'AUTH_LOGIN_FAILURE',
        userId: user._id.toString(),
        requestId,
        ip,
        outcome: 'LOCKED',
        reason: 'ACCOUNT_LOCKED_ACTIVE',
      });
      throw AppError.badRequest(
        'Account is temporarily locked due to repeated failed login attempts. Please try again later.',
        'ACCOUNT_LOCKED'
      );
    } else {
      // Lockout duration expired, reset status
      user.status = 'ACTIVE';
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
    }
  }

  // Verify password
  const isMatch = await comparePassword(password, user.passwordHash);

  if (!isMatch) {
    user.failedLoginAttempts += 1;

    if (user.failedLoginAttempts >= config.MAX_FAILED_LOGIN_ATTEMPTS) {
      user.status = 'LOCKED';
      user.lockUntil = new Date(Date.now() + config.LOCKOUT_DURATION_MINUTES * 60 * 1000);
      await user.save();

      logAuthAuditEvent({
        event: 'AUTH_ACCOUNT_LOCKED',
        userId: user._id.toString(),
        requestId,
        ip,
        outcome: 'LOCKED',
        reason: `Exceeded max failed attempts (${user.failedLoginAttempts})`,
      });

      throw AppError.badRequest(
        'Account is temporarily locked due to repeated failed login attempts. Please try again later.',
        'ACCOUNT_LOCKED'
      );
    }

    await user.save();

    logAuthAuditEvent({
      event: 'AUTH_LOGIN_FAILURE',
      userId: user._id.toString(),
      requestId,
      ip,
      outcome: 'FAILURE',
      reason: 'INVALID_PASSWORD',
    });

    throw AppError.badRequest('Invalid email or password.', 'INVALID_CREDENTIALS');
  }

  // Password matches - reset security counters and update lastLoginAt
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  user.lastLoginAt = new Date();
  await user.save();

  // Generate tokens
  const accessToken = generateAccessToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    status: user.status,
  });

  const { refreshToken } = await generateRefreshToken(user._id.toString());

  logAuthAuditEvent({
    event: 'AUTH_LOGIN_SUCCESS',
    userId: user._id.toString(),
    requestId,
    ip,
    outcome: 'SUCCESS',
  });

  return {
    user: toUserResponseDTO(user),
    accessToken,
    refreshToken,
  };
};

export const logoutUser = async (userId: string, tokenId?: string, ip?: string, requestId?: string): Promise<void> => {
  if (tokenId) {
    await revokeRefreshToken(tokenId);
  } else {
    await revokeAllUserTokens(userId);
  }

  logAuthAuditEvent({
    event: 'AUTH_LOGOUT',
    userId,
    requestId,
    ip,
    outcome: 'SUCCESS',
  });
};

export const getUserProfile = async (userId: string): Promise<UserResponseDTO> => {
  const user = await User.findById(userId);
  if (!user) {
    throw AppError.notFound('User not found.', 'USER_NOT_FOUND');
  }
  return toUserResponseDTO(user);
};
