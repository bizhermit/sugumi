export const STATUS_TEXTS: Readonly<Record<number, string>> = {
  400: "Bad Request",
  403: "Forbidden",
  404: "Not Found",
  413: "Content Too Large",
  415: "Unsupported Media Type",
  500: "Internal Server Error",
};

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }
}
