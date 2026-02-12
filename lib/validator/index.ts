import { Validator } from "./validator";

// Formatters
import { EmailFormatter } from "@/lib/validator/formatters/EmailFormatter";
import { NonEmptyStringFormatter } from "@/lib/validator/formatters/NonEmptyStringFormatter";
import { StrongPasswordFormatter } from "@/lib/validator/formatters/StrongPasswordFormatter";
import { UUIDFormatter } from "@/lib/validator/formatters/UUIDFormatter";

const validator = new Validator();

// Inject formatters
validator.addFormat("non-empty-string", {
  forType: NonEmptyStringFormatter.type,
  formatterFn: NonEmptyStringFormatter.fn,
});

validator.addFormat("email", {
  forType: EmailFormatter.type,
  formatterFn: EmailFormatter.fn,
});

validator.addFormat("strong-password", {
  forType: StrongPasswordFormatter.type,
  formatterFn: StrongPasswordFormatter.fn,
});

validator.addFormat("uuid", {
  forType: UUIDFormatter.type,
  formatterFn: UUIDFormatter.fn,
});

export { validator };
