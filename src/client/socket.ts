import { io } from 'socket.io-client';
import type { FriendsData, GameAction, Me } from '../shared/types';

// Bağlantı sadece giriş yaptıktan sonra açılır; oturum httpOnly çerezle taşınır.
export const socket = io({ autoConnect: false, withCredentials: true });

export function sendAction(action: GameAction) {
  socket.emit('game:action', action);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'Bir hata oluştu, tekrar dene.', res.status);
  return data as T;
}

export const api = {
  me: () => request<Me>('GET', '/api/me'),
  login: (username: string, password: string) => request<Me>('POST', '/api/login', { username, password }),
  register: (username: string, password: string, email: string) => request<Me>('POST', '/api/register', { username, password, email }),
  setEmail: (email: string) => request<Me>('PUT', '/api/email', { email }),
  resendVerification: () => request<{ ok: true; alreadyVerified?: boolean }>('POST', '/api/email/resend'),
  verifyEmail: (token: string) => request<{ ok: true; displayName: string }>('POST', '/api/email/verify', { token }),
  forgotPassword: (email: string) => request<{ ok: true }>('POST', '/api/password/forgot', { email }),
  resetPassword: (token: string, password: string) => request<Me>('POST', '/api/password/reset', { token, password }),
  logout: () => request<{ ok: true }>('POST', '/api/logout'),
  updateProfile: (patch: { displayName?: string; avatar?: string | null }) => request<Me>('PUT', '/api/profile', patch),
  peek: <T,>(id: string) => request<T>('GET', `/api/tables/${encodeURIComponent(id)}`),
  friends: () => request<FriendsData>('GET', '/api/friends'),
  friendRequest: (username: string) => request<{ result: 'sent' | 'accepted' }>('POST', '/api/friends/request', { username }),
  friendRespond: (userId: string, accept: boolean) => request<{ ok: true }>('POST', '/api/friends/respond', { userId, accept }),
  friendRemove: (userId: string) => request<{ ok: true }>('DELETE', `/api/friends/${encodeURIComponent(userId)}`),
};
