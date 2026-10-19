export interface ApiErrorBody {
  error: { code: string; message: string };
}

export function jsonError(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export class AdapterError extends Error {
  code: 'UPSTREAM_RATE_LIMIT' | 'UPSTREAM_UNAVAILABLE' | 'PROVIDER_NOT_CONFIGURED';

  constructor(code: AdapterError['code'], message: string) {
    super(message);
    this.code = code;
  }
}
