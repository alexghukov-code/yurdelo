export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: Array<{ field: string; message: string }>) {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Необходима авторизация.') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Нет прав на операцию.') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Запись не найдена.') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string) {
    return new AppError(409, 'CONFLICT', message);
  }

  static tooLarge(message = 'Файл превышает допустимый размер 50 МБ.') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', message);
  }

  static rateLimited(retryAfter: number) {
    const err = new AppError(429, 'RATE_LIMIT_EXCEEDED', 'Превышен лимит запросов.');
    (err as any).retryAfter = retryAfter;
    return err;
  }
}
