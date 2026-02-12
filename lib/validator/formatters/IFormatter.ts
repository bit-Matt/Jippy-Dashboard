import type { ValidationFunction, ValidationTypes } from "../types";

export interface IFormatter<T> {
  /**
   * Target type of the formatter.
   */
  type: ValidationTypes;

  /**
   * Main Formatter function.
   */
  fn: ValidationFunction<T>;
}
