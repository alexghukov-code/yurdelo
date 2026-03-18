import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config/index.js';

export interface AccessPayload {
  sub: string;
  role: string;
  email: string;
}

export interface RefreshPayload {
  sub: string;
  jti: string;
}

export function signAccessToken(payload: AccessPayload): string {
  const options: SignOptions = { expiresIn: config.jwt.accessExpires as any };
  return jwt.sign(payload, config.jwt.secret, options);
}

export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const options: SignOptions = { expiresIn: config.jwt.refreshExpires as any };
  const token = jwt.sign({ sub: userId, jti }, config.jwt.secret, options);
  return { token, jti };
}

export function verifyToken<T extends object>(token: string): T {
  return jwt.verify(token, config.jwt.secret) as T;
}
