export class HttpError extends Error {
  constructor(status, message, code = 'request_failed', retryAfter = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
export function checked(result) {
  if (result.error)
    throw new HttpError(
      503,
      'Não foi possível persistir ou recuperar os dados. Tente novamente.',
      'storage_unavailable',
    );
  return result.data;
}
