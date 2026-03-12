import { DateTime } from "luxon";
import type {
  Schema,
  ValidationErrors,
  ValidationFunction,
  ValidationResult,
  ValidationTypes,
  ValidatorFormatterMetaData,
} from "@/lib/validator/types";

export class Validator {
  private readonly _formatters: Record<string, ValidatorFormatterMetaData<ValidationTypes>> = {};

  /**
   * Adds a new format to the internal list of formatters.
   *
   * @param {string} name - The name of the format to be added. Must be unique.
   * @param {ValidatorFormatterMetaData<ValidationTypes>} metadata - The metadata associated with the specified format.
   * @return {void} This method does not return a value.
   */
  addFormat(name: string, metadata: ValidatorFormatterMetaData<ValidationTypes>): void {
    // Do not accept if the same name of formatter already exists
    if (this._formatters[name]) {
      return;
    }

    this._formatters[name] = { ...metadata };
  }

  /**
   * Retrieves the formatter function associated with the provided name and validation type.
   *
   * @template T
   * @param {ValidationTypes} typeOf - The type of validation the formatter is associated with.
   * @param {string} name - The name of the formatter to retrieve.
   * @return {ValidationFunction<T> | null} The formatter function if found and matched with the validation type; otherwise, null.
   */
  getFormatterFunction<T>(typeOf: ValidationTypes, name: string): ValidationFunction<T> | null {
    // Get the name of the registered formatter.
    const formatter = this._formatters[name];
    if (!formatter) {
      return null;
    }

    // Don't allow mismatched types to be used for formatter
    if (formatter.forType !== typeOf) {
      return null;
    }

    return formatter.formatterFn as ValidationFunction<T>;
  }

  /**
   * Checks if the provided value matches the specified validation type.
   *
   * @param type The validation type to check against.
   * @param value The value to validate.
   * @return Returns true if the value matches the specified type, otherwise false.
   */
  private isTypeMatches<T>(type: ValidationTypes, value: T): boolean {
    // Check if the property is a type of Array
    if (type === "array") {
      return Array.isArray(value);
    }

    // Check if the type is Date
    if (type === "date") {
      return value instanceof Date && value.toString() !== "Invalid Date";
    }

    // Check if the type is Number
    if (type === "number") {
      return typeof value === "number" && !isNaN(value);
    }

    // Other types
    return typeof value === type;
  }

  /**
   * Checks whether the provided value is neither `undefined` nor `null`.
   *
   * @template T
   * @param {T} value - The value to check for existence.
   * @return {boolean} Returns `true` if the value is not `undefined` and not `null`, otherwise `false`.
   */
  private isExist<T>(value: T): boolean {
    return value !== undefined && value !== null;
  }

  /**
   * Checks if the given value satisfies the specified minimum and/or maximum constraints
   * based on its type (string or number).
   *
   * @param type The type of the value to validate. Allowed values are "string" or "number".
   * @param value The value to validate against the min and max constraints.
   * @param min The optional minimum threshold for the value. For strings, it represents the minimum length.
   * @param max The optional maximum threshold for the value. For strings, it represents the maximum length.
   * @return Returns true if the value complies with the specified min and max constraints, or if the type is unsupported. Returns false otherwise.
   */
  private checkMinMax<T>(type: ValidationTypes, value: T, min?: number, max?: number): MinMaxValidator {
    // Unsupported types get a free pass.
    if (type !== "string" && type !== "number") {
      return { ok: true };
    }

    // Check for minimum values
    if (this.isExist(min)) {
      const minValue = min as number;

      // Check for the minimum length if the type is string.
      if (type === "string") {
        if ((value as string).length < minValue) {
          return {
            ok: false,
            error: `Value must be at least ${minValue} characters long.`,
          };
        }
      }

      // Check for the minimum value if the type is number.
      if (type === "number") {
        if ((value as number) < minValue) {
          return {
            ok: false,
            error: `Value must be at least ${minValue}.`,
          };
        }
      }
    }

    // Check for maximum values
    if (this.isExist(max)) {
      const maxValue = max as number;

      if (type === "string") {
        if ((value as string).length > maxValue) {
          return {
            ok: false,
            error: `Value cannot be longer than ${maxValue} characters.`,
          };
        }
      }

      // Check for the minimum value if the type is number.
      if (type === "number") {
        if ((value as number) > maxValue) {
          return {
            ok: false,
            error: `Value cannot be longer than ${maxValue}.`,
          };
        }
      }
    }

    return { ok: true };
  }

  /**
   * Validates whether a given date value falls within specified minimum and maximum date boundaries.
   *
   * @param {ValidationTypes} type The type of validation. This method checks only when the type is "date".
   * @param {Date} value The date value to validate.
   * @param {DateTime} [min] The minimum allowed date. Optional.
   * @param {DateTime} [max] The maximum allowed date. Optional.
   * @return {MinMaxValidator} An object indicating whether the validation was successful (OK: true) or failed (OK: false with an error message).
   */
  private checkMinMaxDate(type: ValidationTypes, value: Date, min?: DateTime, max?: DateTime): MinMaxValidator {
    // Pass if not date. Nothing to check.
    if (type !== "date") {
      return { ok: true };
    }

    if (this.isExist(min)) {
      const minValue = min as DateTime;
      const date = DateTime.fromJSDate(value);

      if (date < minValue) {
        return {
          ok: false,
          error: `Value must be at least ${minValue.toISO()}.`,
        };
      }
    }

    if (this.isExist(max)) {
      const maxValue = max as DateTime;
      const date = DateTime.fromJSDate(value);

      if (date > maxValue) {
        return {
          ok: false,
          error: `Value cannot be greater than ${maxValue.toISO()}.`,
        };
      }
    }

    return { ok: true };
  }

  /**
   * Validates an object against a specified validation schema and returns the validation result.
   *
   * @param object The object to validate against the schema.
   * @param schema The validation schema defining properties, requirements, and rules for the object.
   * @return A promise that resolves to a `ValidationResult` indicating whether the object passed validation and any validation errors.
   */
  async validate<T extends object>(object: T, schema: Schema<T>): Promise<ValidationResult<T>> {
    // Check if any of the properties are not part of the validation
    if (!schema.allowUnvalidatedProperties) {
      const validatedProperties = Object.keys(schema.properties);
      const objectProperties = Object.keys(object);

      // Find those properties that are NOT part of the validation.
      if (validatedProperties.length !== objectProperties.length) {
        const result: ValidationResult<T> = {
          ok: false,
          errors: {} as ValidationErrors<T>,
        };

        for (const extraProperty of objectProperties.filter((x) => !validatedProperties.includes(x))) {
          result.errors[extraProperty as keyof T] = {
            message: `Property ${String(extraProperty)} is not allowed without validation.`,
            from: "unvalidated",
          } as ValidationErrors<T>[keyof T];
        }

        // If there are no extra properties, we can just continue execution of the validator
        if (Object.keys(result.errors).length > 0) {
          return result;
        }
      }
    }

    // Check for types and formatters of each property
    for (const property in schema.properties) {
      const current = schema.properties[property];

      // Fail when one of the properties is not present especially if its part of the
      // required properties
      if (!this.isExist(object[property]) && schema.requiredProperties.includes(property as keyof T)) {
        return {
          ok: false,
          errors: {
            [property]: {
              message: `Property ${String(property)} is required`,
              from: "is-required",
            },
          } as ValidationErrors<T>,
        };
      }

      // Continue when the property is not present. It is already checked above that if the
      // schema.allowUnvalidatedProperties is false, it will check each property present in the
      // schema.
      if (!this.isExist(object[property])) {
        continue;
      }

      // Assert the type must be equal
      if (!this.isTypeMatches(current.type, object[property])) {
        return {
          ok: false,
          errors: {
            [property]: {
              message: `Property ${String(property)} must be of type ${current.type}`,
              from: "type-check",
            },
          } as ValidationErrors<T>,
        };
      }

      // Range checks
      if (current.type === "string" || current.type === "number") {
        const minMaxCheck = this.checkMinMax(
          current.type,
          object[property],
          current.min as number,
          current.max as number,
        );
        if (!minMaxCheck.ok) {
          return {
            ok: false,
            errors: {
              [property]: {
                message: minMaxCheck.error!,
                from: "range-check",
              },
            } as ValidationErrors<T>,
          };
        }
      }

      if (current.type === "date") {
        const dateMinMax = this.checkMinMaxDate(
          current.type,
          object[property] as Date,
          current.min as DateTime,
          current.max as DateTime,
        );
        if (!dateMinMax.ok) {
          return {
            ok: false,
            errors: {
              [property]: {
                message: dateMinMax.error!,
                from: "range-check",
              },
            } as ValidationErrors<T>,
          };
        }
      }

      // Custom formatter
      if (current.formatterFn) {
        // Run the custom formatter
        const runFormatter = await current.formatterFn(object[property]);
        if (!runFormatter.ok) {
          return {
            ok: false,
            errors: {
              [property]: {
                message: runFormatter.error,
                from: "formatter",
              },
            } as ValidationErrors<T>,
          };
        }

        return { ok: true, errors: {} as ValidationErrors<T> };
      }

      // Built-in formatter options
      if (current.formatter) {
        const formatter = this._formatters[current.formatter];

        // Bail when formatter doesn't exist.
        if (!formatter) {
          return {
            ok: false,
            errors: {
              [property]: {
                message: `Property ${String(property)} has an invalid formatter`,
                from: "formatter",
              },
            } as ValidationErrors<T>,
          };
        }

        const formatterResult = await formatter.formatterFn(object[property as keyof T] as ValidationTypes);
        if (!formatterResult.ok) {
          return {
            ok: false,
            errors: {
              [property]: {
                message: formatterResult.error,
                from: "formatter",
              },
            } as ValidationErrors<T>,
          };
        }
      }
    }

    return { ok: true, errors: {} as ValidationErrors<T> };
  }

  toPlainErrors<T>(errors: ValidationErrors<T>): string {
    const str = [];
    for (const key in errors) {
      str.push(`${key}: ${errors[key].message} (in: ${errors[key].from})`);
    }
    return str.join(", ");
  }
}

// Internal non-exportable types
interface MinMaxValidator {
  ok: boolean;
  error?: string;
}
