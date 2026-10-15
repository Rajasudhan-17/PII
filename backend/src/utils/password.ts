import bcrypt from 'bcryptjs';

export interface PasswordPolicyResult {
  isValid: boolean;
  message?: string;
}

export const validatePasswordPolicy = (password: string): PasswordPolicyResult => {
  if (!password || typeof password !== 'string') {
    return { isValid: false, message: 'Password is required and must be a string.' };
  }

  if (password.length < 8) {
    return { isValid: false, message: 'Password must be at least 8 characters long.' };
  }

  if (password.length > 128) {
    return { isValid: false, message: 'Password must not exceed 128 characters.' };
  }

  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (!hasUppercase || !hasLowercase || !hasDigit || !hasSpecial) {
    return {
      isValid: false,
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
    };
  }

  return { isValid: true };
};

export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

export const comparePassword = async (candidatePassword: string, passwordHash: string): Promise<boolean> => {
  return bcrypt.compare(candidatePassword, passwordHash);
};
