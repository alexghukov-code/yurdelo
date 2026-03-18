import type { RlsPool } from './middleware/rls.js';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      rlsPool?: RlsPool;
    }
  }
}
