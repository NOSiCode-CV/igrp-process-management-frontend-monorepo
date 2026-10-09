/**
 * Typed error for loading a process instance / step config.
 *
 * Server actions must NOT throw for expected failures: in production builds
 * Next.js replaces the message of any thrown server-action error with
 * "An error occurred in the Server Components render…", so the UI cannot
 * tell "not found" from a real crash. Actions return
 * {@link IGRPProcessErrorPayload} instead and the client rebuilds this class.
 */
export type IGRPProcessErrorCode =
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "UNKNOWN";

/** Serializable shape (crosses the server-action boundary). */
export interface IGRPProcessErrorPayload {
  code: IGRPProcessErrorCode;
  message: string;
  status?: number;
}

export class IGRPProcessError extends Error {
  code: IGRPProcessErrorCode;
  status?: number;
  /** Next.js error digest, when the failure came from a redacted throw. */
  digest?: string;

  constructor({ code, message, status }: IGRPProcessErrorPayload) {
    super(message);
    this.name = "IGRPProcessError";
    this.code = code;
    this.status = status;
  }

  toPayload(): IGRPProcessErrorPayload {
    return { code: this.code, message: this.message, status: this.status };
  }
}

function codeFromStatus(status: number | undefined): IGRPProcessErrorCode {
  if (status === 404) return "NOT_FOUND";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  return "UNKNOWN";
}

/** Normalise anything thrown while loading a process into a payload. */
export function toProcessErrorPayload(error: unknown): IGRPProcessErrorPayload {
  if (error instanceof IGRPProcessError) return error.toPayload();

  const status = (error as { status?: number } | null)?.status;
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Não foi possível carregar a configuração do processo.";
  return { code: codeFromStatus(status), message, status };
}

/** Client-side: rebuild an error from a payload or from a (redacted) throw. */
export function toProcessError(error: unknown): IGRPProcessError {
  if (error instanceof IGRPProcessError) return error;
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    !(error instanceof Error)
  ) {
    return new IGRPProcessError(error as IGRPProcessErrorPayload);
  }
  const processError = new IGRPProcessError(toProcessErrorPayload(error));
  const digest = (error as { digest?: string } | null)?.digest;
  if (digest) processError.digest = digest;
  return processError;
}
