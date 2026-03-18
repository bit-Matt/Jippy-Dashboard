import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";

class OneOf<T> {
  constructor(private readonly result: Result<T>) {}

  match<R>(
    onSuccess: (val: T) => R,
    onFailure: (err: Failure) => R,
  ): R {
    if (this.result instanceof Success) {
      return onSuccess(this.result.value);
    }
    return onFailure(this.result as Failure);
  }
}

class UnwrappedException extends Error {
  constructor(
    public readonly type: ErrorCodes,
    public readonly message: string,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public readonly additionalContext?: Record<string, any>,
  ) {
    super(`Type: ${type}: ${message}`);
  }
}

/**
 * Wraps a {@link Result} in a {@link OneOf} helper to enable ergonomic pattern matching
 * via {@link OneOf.match}.
 *
 * @template T The success value type contained in the {@link Result}.
 * @param {Result<T>} result A result that is either {@link Success} (value) or {@link Failure} (error).
 * @returns {OneOf<T>} A {@link OneOf} wrapper around the provided result.
 *
 * @example
 * const res: Result<number> = new Success(42);
 * const message = oneOf(res).match((n) => `ok: ${n}`, (err) => `fail: ${err.message}`);
 */
export function oneOf<T>(result: Result<T>): OneOf<T> {
  return new OneOf(result);
}

/**
 * Awaits a {@link Result} promise and returns the success value, or throws on failure.
 *
 * - If the resolved result is a {@link Failure} and it contains a `trace`, that trace is rethrown.
 * - Otherwise, an {@link UnwrappedException} is thrown with the failure details.
 *
 * @template T The success value type.
 * @param {Promise<Result<T>>} fn A promise resolving to a {@link Result}.
 * @returns {Promise<T>} The unwrapped success value.
 * @throws {unknown} Rethrows `Failure.trace` when present.
 * @throws {UnwrappedException} When the result is a {@link Failure} without a trace.
 *
 * @example
 * const value = await unwrap(fetchSomething()); // -> T, or throws
 */
export async function unwrap<T>(fn: Promise<Result<T>>): Promise<T> {
  const result = await fn;

  // On exceptions, rethrow the exception
  if (result instanceof Failure) {
    // Rethrow if the stack trace is provided.
    if (result.trace) throw result.trace;

    // Otherwise, throw a new exception.
    throw new UnwrappedException(result.type, result.message, result.additionalContext);
  }

  // Unwrap the function to return the value you want.
  return (result as Success<T>).value;
}

export type { Result };

export { ErrorCodes, Failure, Success, UnwrappedException };
