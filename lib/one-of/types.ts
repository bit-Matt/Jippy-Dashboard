import * as Sentry from "@sentry/nextjs";

export enum ErrorCodes {
  /**
   * Validation Failed code.
   */
  ValidationFailure = 6701,

  /**
   * Identifiers or Resources cannot be resolved or found.
   */
  ResourceNotFound = 6702,

  /**
   * Identifiers or Resources have expired.
   */
  ResourceExpired = 6703,

  /**
   * Fatal Exceptions
   */
  Fatal = 6704,
}

export type Result<T> = Success<T> | Failure;

export class Success<T> {
  constructor(public readonly value: T) { }
}

export class Failure {
  constructor(
    public readonly type: ErrorCodes,
    public readonly message: string,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public readonly additionalContext?: Record<string, any>,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public readonly trace?: any,
  ) {
    Sentry.logger.error("Failure: ", {
      type,
      message,
      ...additionalContext,
    });

    // Capture trace exception if any.
    if (trace) {
      Sentry.captureException(trace);
    }
  }
}
