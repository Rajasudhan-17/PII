import mongoose, { Schema, Document, Model } from 'mongoose';

export type UserRole = 'USER' | 'REVIEWER' | 'ANALYST' | 'ORG_ADMIN' | 'SUPER_ADMIN';
export type UserStatus = 'ACTIVE' | 'PENDING_VERIFICATION' | 'LOCKED' | 'DISABLED';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  normalizedEmail: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  failedLoginAttempts: number;
  lockUntil?: Date | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedEmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['USER', 'REVIEWER', 'ANALYST', 'ORG_ADMIN', 'SUPER_ADMIN'],
      default: 'USER',
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'PENDING_VERIFICATION', 'LOCKED', 'DISABLED'],
      default: 'ACTIVE',
      index: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
