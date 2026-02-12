import type { IFormatter } from "./IFormatter";

export const NonEmptyStringFormatter: IFormatter<string> = {
  type: "string",
  fn: async (value) => {
    if (value.trim().length === 0) {
      return {
        ok: false,
        error: "Value cannot be empty",
      };
    }

    return { ok: true };
  },
};
