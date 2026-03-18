import type { RequestHandler } from 'express';
import { verifyToken, type AccessPayload } from '../utils/jwt.js';
import { AppError } from '../utils/errors.js';
import '../types.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(AppError.unauthorized());
    return;
  }

  try {
    const payload = verifyToken<AccessPayload>(header.slice(7));
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch {
    next(AppError.unauthorized('Токен недействителен или истёк.'));
  }
};

export function requireRole(...roles: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}
