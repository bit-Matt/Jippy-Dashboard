import type { IFormatter } from "./IFormatter";

export const UUIDFormatter: IFormatter<string> = {
  type: "string",
  fn: async (value) => {
    const uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
    if (!uuidRegex.test(value)) {
      return {
        ok: false,
        error: "Invalid UUID",
      };
    }

    return { ok: true };
  },
};
