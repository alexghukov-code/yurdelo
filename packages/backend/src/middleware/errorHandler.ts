import type { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/errors.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: { code: err.code, message: err.message, details: err.details },
    };
    if ((err as any).retryAfter) {
      res.set('Retry-After', String((err as any).retryAfter));
    }
    res.status(err.statusCode).json(body);
    return;
  }

  console.error(err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера.' },
  });
};
