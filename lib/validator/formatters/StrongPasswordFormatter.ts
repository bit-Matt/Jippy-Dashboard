import type { IFormatter } from "./IFormatter";

export const StrongPasswordFormatter: IFormatter<string> = {
  type: "string",
  fn: async (value) => {
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
};
