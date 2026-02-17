/**
 * A class representing a successful operation that encapsulates a value.
 *
 * @template T - The type of the value encapsulated by the instance.
 */
export class Success<T> {
  constructor(public readonly value: T) { }
}

/**
 * Represents a failure condition with a specific type and associated value.
 *
 * This class is primarily used to encapsulate error or failure information
 * along with a descriptive type and a related value.
 *
 * @template T - The type of the value encapsulated by the instance.
 */
export class Failure<T> {
  constructor(public readonly type: FailureCodes, public readonly value: T) { }
}

export enum FailureCodes {
  /**
   * Represents a constant value that indicates a validation failure.
   * This value is typically used as an error code to signify that a validation process
   * has failed due to not meeting predefined criteria or rules.
   */
  ValidationFailure = 67001,

  /**
   * Constant representing the error code for a user not being found.
   * This value is used to indicate scenarios where a requested user cannot be located
   * within the available data or system.
   */
  UserNotFound = 67002,

  /**
   * A constant representing a fatal error code.
   * Typically used to signify a critical error state that requires immediate attention
   * or termination of the current process.
   */
  Fatal = 69420,
}
