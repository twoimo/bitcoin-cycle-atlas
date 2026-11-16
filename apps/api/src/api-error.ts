export class ApiError extends Error {
  constructor(readonly status: 404 | 409 | 422 | 503, readonly code: string, readonly detail?: string) { super(detail ?? code); }
  get body() { return this.detail === undefined ? { code: this.code } : { code: this.code, message: this.detail }; }
}
