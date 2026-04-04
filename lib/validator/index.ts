import { validate as uuidValidate } from "uuid";

import { Validator } from "@/lib/validator/validator";

const validator = new Validator();

// Inject built-in formatters
validator.addFormat("non-empty-string", {
  forType: "string",
  formatterFn: async (value: string) => {
    // Falsy values
    if (!value) {
      return { ok: false, error: "Value must be a string." };
    }

    // If filled with whitespaces
    if (value.trim().length === 0) {
      return { ok: false, error: "Value cannot be empty." };
    }

    return { ok: true };
  },
});

validator.addFormat("email", {
  forType: "string",
  formatterFn: async (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return {
        ok: false,
        error: "Invalid email address",
      };
    }

    return { ok: true };
  },
});

validator.addFormat("uuid", {
  forType: "string",
  formatterFn: async (value) => {
    const uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
    if (!uuidRegex.test(value)) {
      return {
        ok: false,
        error: "Invalid UUID",
      };
    }

    return { ok: true };
  },
});

validator.addFormat("valid-number", {
  forType: "number",
  formatterFn: async (v) => {
    const value = Number(v);
    if (!Number.isNaN(value) && Number.isFinite(value)) {
      return { ok: true };
    }

    return { ok: false, error: "Invalid number" };
  },
});

validator.addFormat("strong-password", {
  forType: "string",
  formatterFn: async (value) => {
    // Zero-length or undefined inputs
    if (!value || value.trim().length === 0 || value.length < 8) {
      return {
        ok: false,
        error: "Invalid password",
      };
    }

    const verdict = (value.match(/[a-z]/g) ?? []).length >= 2 // At least there are 2 lowercase characters
      && (value.match(/[A-Z]/g) ?? []).length >= 2 // At least there are 2 uppercase characters
      && (value.match(/[0-9]/g) ?? []).length >= 2 // At least there should be 2 numbers
      && (value.match(/[!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]/g) ?? []).length >= 2; // 2 Symbols.
    if (!verdict) {
      return {
        ok: false,
        error: "Password must contain at least 2 lowercase, uppercase, numbers and symbols",
      };
    }

    return { ok: true };
  },
});

validator.addFormat("hex-color", {
  forType: "string",
  formatterFn: async (value) => {
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexRegex.test(value)) {
      return {
        ok: false,
        error: "Invalid hex color",
      };
    }

    return { ok: true };
  },
});

const utils = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isExisty: (value: any) => value !== null && value !== undefined,

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isFinite: (value: any) => {
    const n = Number(value);
    return !Number.isNaN(n) && Number.isFinite(n);
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isNonEmpty: (value: any) => {
    if (!utils.isExisty(value)) return false;
    if (typeof value !== "string") return false;

    return value.trim().length > 0;
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isTuple: (value: [any, any]) => {
    if (!Array.isArray(value) || value.length !== 2) return false;

    const e1 = utils.isExisty(value[0]) && utils.isFinite(value[0]);
    const e2 = utils.isExisty(value[1]) && utils.isFinite(value[1]);

    return e1 && e2;
  },

  isUuid: (value: string) => {
    if (!utils.isExisty(value) || typeof value !== "string") return false;
    return uuidValidate(value);
  },

  /**
   * Determines whether a given string is a syntactically valid email address.
   *
   * This is a lightweight format check intended for quick validation (e.g., form input).
   * It rejects empty values and then verifies the value matches a basic `local@domain.tld` pattern.
   * It does not guarantee the address exists, can receive mail, or complies with every edge case in
   * relevant RFCs.
   *
   * @param {string} email - The email address candidate to validate.
   * @returns {boolean} `true` if the input is non-empty and matches the expected email format; otherwise `false`.
   *
   * @example
   * isEmail("person@example.com"); // true
   * isEmail("not-an-email"); // false
   */
  isEmail: (email: string): boolean => {
    // Fail on empty strings
    if (!utils.isNonEmpty(email)) return false;

    // Check via regex
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },
};

export { utils, validator };
