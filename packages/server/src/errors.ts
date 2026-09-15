/** An error with an HTTP status, turned into a JSON response by the API. */
export class HttpError extends Error {
	readonly status: number;
	readonly details?: Record<string, unknown>;

	constructor(status: number, message: string, details?: Record<string, unknown>) {
		super(message);
		this.name = 'HttpError';
		this.status = status;
		this.details = details;
	}
}

export const notFound = (message: string) => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
export const badRequest = (message: string, details?: Record<string, unknown>) => new HttpError(400, message, details);
