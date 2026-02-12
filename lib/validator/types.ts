import type { DateTime } from "luxon";

export type ValidationErrors<T> = Record<
  keyof T,
  {
    /**
     * A string variable that represents the error message from the Validator function
     */
    message: string;

    /**
     * Specifies the origin of the error where the check fails.
     */
    from: "type-check" | "formatter" | "is-required" | "unvalidated";
  }
>;

export interface ValidationResult<T> {
  /**
   * Validation Result if Passing or Not.
   */
  ok: boolean;

  /**
   * Validation Errors
   */
  errors: ValidationErrors<T>;
}

/**
 * Represents a function used for validating a value of a specific type.
 *
 * This function type accepts a value of type `T` and performs validation on it.
 * The validation process is asynchronous and returns a Promise resolving to
 * an object containing the validation result.
 *
 * @template T The type of the value to be validated.
 * @param {T} value The value to validate.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export type ValidationFunction<T> = (value: T) => Promise<{ ok: boolean; error?: string }>;

/**
 * Represents the possible validation types that can be used for input or data validation.
 *
 * ValidationTypes define the type of data expected and allow for type-specific validation.
 *
 * Possible values include:
 * - "string": Represents a text-based value.
 * - "number": Represents a numeric value, either integer or floating-point.
 * - "boolean": Represents a true or false value.
 * - "date": Represents a date object or value.
 * - "array": Represents a collection of elements organised in a sequential format.
 * - "object": Represents a structured collection of key-value pairs.
 */
export type ValidationTypes = "string" | "number" | "boolean" | "date" | "array" | "object";

export interface Schema<T> {
  /**
   * List of all properties to be validated
   */
  properties: {
    [K in keyof T]: {
      /**
       * The Instance Type of the Property
       */
      type: ValidationTypes;

      /**
       * The Formatter to use for validation if the current property represents a format
       * like an email or phone number.
       *
       * The value of the formatter is specific for each instance type.
       * @remarks If formatterFn is defined, this will be ignored.
       */
      formatter?: string;

      /**
       * Custom formatter function.
       */
      formatterFn?: ValidationFunction<T[K]>;

      /**
       * Represents the minimum allowable value.
       * This is an optional property that defines the lower bound for a numeric range or value.
       * If undefined, no minimum constraint is applied.
       *
       * @remarks This will only work if type is string, number and date.
       * @remarks If type is string, this will check the minimum length of the string.
       * @remarks If type is number, this will check the minimum value
       * @remarks If type is date, this will check the minimum DateTime allowed.
       */
      min?: number | DateTime;

      /**
       * Represents the maximum value or upper limit that can be assigned or processed.
       * The value is optional and may remain undefined if not explicitly specified.
       * Commonly used for setting constraints or boundaries in calculations or validations.
       *
       * @remarks This will only work if type is string, number and date.
       * @remarks If type is string, this will check the maximum length of the string.
       * @remarks If type is number, this will check the maximum value
       * @remarks If type is date, this will check the maximum DateTime allowed.
       */
      max?: number | DateTime;
    };
  };

  /**
   * List of all property names that should be required.
   */
  requiredProperties: Array<keyof T>;

  /**
   * Allow this object to have properties that aren't validated.
   */
  allowUnvalidatedProperties?: boolean;
}

export interface ValidatorFormatterMetaData<T extends ValidationTypes> {
  /**
   * The target type of the formatter.
   */
  forType: T;

  /**
   * Main Formatter function
   */
  formatterFn: ValidationFunction<T>;
}
