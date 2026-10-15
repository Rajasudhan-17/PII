import mongoose from 'mongoose';
import { getConfig } from './env';
import { logger } from '../utils/logger';

let isConnected = false;

const sanitizeMongoUri = (uri: string): string => {
  return uri.replace(/\/\/(.*):(.*)@/, '//***:***@');
};

export const connectDatabase = async (customUri?: string): Promise<typeof mongoose> => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  let uri = customUri || getConfig().MONGODB_URI;
  const envUri = getConfig().MONGODB_URI;
  if (customUri && !customUri.includes('@') && envUri && envUri.includes('@')) {
    // Preserve authentication credentials from environment if customUri omitted them
    uri = envUri;
  }
  const sanitized = sanitizeMongoUri(uri);

  logger.info({ event: 'mongodb_connecting', uri: sanitized }, 'Connecting to MongoDB...');

  mongoose.connection.removeAllListeners('connected');
  mongoose.connection.removeAllListeners('error');
  mongoose.connection.removeAllListeners('disconnected');

  mongoose.connection.on('connected', () => {
    isConnected = true;
    logger.info({ event: 'mongodb_connected' }, 'MongoDB connection established.');
  });

  mongoose.connection.on('error', (err) => {
    isConnected = false;
    logger.error({ event: 'mongodb_error', error: err.message }, 'MongoDB connection error.');
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    logger.warn({ event: 'mongodb_disconnected' }, 'MongoDB connection lost.');
  });

  try {
    const db = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
    });
    isConnected = true;
    return db;
  } catch (err: unknown) {
    isConnected = false;
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ event: 'mongodb_connection_failed', error: errorMessage }, 'Failed to connect to MongoDB.');
    throw err;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    logger.info({ event: 'mongodb_disconnecting' }, 'Closing MongoDB connection...');
    await mongoose.disconnect();
    isConnected = false;
    logger.info({ event: 'mongodb_disconnected_clean' }, 'MongoDB connection closed.');
  }
};

export const isDatabaseConnected = (): boolean => {
  return isConnected && mongoose.connection.readyState === 1;
};

export const getDatabaseStatus = (): 'connected' | 'disconnected' | 'connecting' | 'error' => {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 0:
    case 3:
    default:
      return 'disconnected';
  }
};
