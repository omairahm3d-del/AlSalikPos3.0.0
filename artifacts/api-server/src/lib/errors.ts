export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new HttpError(400, code, message, details);
export const unauthorized = (code: string, message: string) =>
  new HttpError(401, code, message);
export const forbidden = (code: string, message: string) =>
  new HttpError(403, code, message);
export const notFound = (code: string, message: string) =>
  new HttpError(404, code, message);
export const conflict = (code: string, message: string) =>
  new HttpError(409, code, message);
