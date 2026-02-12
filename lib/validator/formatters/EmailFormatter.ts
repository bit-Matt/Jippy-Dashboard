import type { IFormatter } from "./IFormatter";

export const EmailFormatter: IFormatter<string> = {
  type: "string",
  fn: async (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return {
        ok: false,
        error: "Invalid email address",
      };
    }

    return { ok: true };
  },
};
