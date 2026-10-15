import { api } from './client';
import { LoginResponse, UserProfile, TokenPair } from '../types/auth';

export const authApi = {
  login: (credentials: { email: string; password: string }) =>
    api.post<LoginResponse>('/auth/login', credentials),

  register: (payload: { email: string; password: string; role?: string }) =>
    api.post<{ user: UserProfile }>('/auth/register', payload),

  getMe: () =>
    api.get<{ user: UserProfile }>('/auth/me'),

  refresh: (refreshToken?: string) =>
    api.post<TokenPair>('/auth/refresh', refreshToken ? { refreshToken } : {}),

  logout: (refreshToken?: string) =>
    api.post<{ message: string }>('/auth/logout', refreshToken ? { refreshToken } : {}),
};
