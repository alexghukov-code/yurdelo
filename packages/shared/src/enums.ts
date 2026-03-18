export enum Role {
  Admin = 'admin',
  Lawyer = 'lawyer',
  Viewer = 'viewer',
}

export enum UserStatus {
  Active = 'active',
  Inactive = 'inactive',
}

export enum CaseStatus {
  Active = 'active',
  Closed = 'closed',
  Suspended = 'suspended',
}

export enum CaseCategory {
  Civil = 'civil',
  Arbitration = 'arbitration',
  Admin = 'admin',
  Criminal = 'criminal',
  Labor = 'labor',
}

export enum FinalResult {
  Win = 'win',
  Lose = 'lose',
  Part = 'part',
  World = 'world',
}

export enum HearingType {
  Hearing = 'hearing',
  Adjournment = 'adj',
  Result = 'result',
  Note = 'note',
}

export enum AuditAction {
  Create = 'CREATE',
  Update = 'UPDATE',
  Delete = 'DELETE',
  Transfer = 'TRANSFER',
  Deactivate = 'DEACTIVATE',
  Restore = 'RESTORE',
  Login = 'LOGIN',
  Logout = 'LOGOUT',
}

export enum ErrorCode {
  ValidationError = 'VALIDATION_ERROR',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  NotFound = 'NOT_FOUND',
  Conflict = 'CONFLICT',
  PayloadTooLarge = 'PAYLOAD_TOO_LARGE',
  RateLimitExceeded = 'RATE_LIMIT_EXCEEDED',
  InternalError = 'INTERNAL_ERROR',
}
