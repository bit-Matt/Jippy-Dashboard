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

const singles = {
  isNonEmptyString: validator.getFormatterFunction("string", "non-empty-string")!,
  isEmail: validator.getFormatterFunction("string", "email")!,
  isUuid: validator.getFormatterFunction("string", "uuid")!,
  isValidNumber: validator.getFormatterFunction("number", "valid-number")!,
};

export {
  validator,
  singles,
};
