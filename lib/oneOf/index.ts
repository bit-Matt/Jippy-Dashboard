import { Success, Failure } from "@/lib/oneOf/response-types";

export function oneOf<T, F>(result: Result<T, F>) {
  return new OneOf(result);
}

class OneOf<T, F> {
  constructor(private readonly result: Result<T, F>) {}

  match<R>(
    onSuccess: (val: T) => R,
    onFailure: (err: Failure<F>) => R,
  ): R {
    if (this.result instanceof Success) {
      return onSuccess(this.result.value);
    }
    return onFailure(this.result as Failure<F>);
  }
}

type Result<T, F> = Success<T> | Failure<F>;
