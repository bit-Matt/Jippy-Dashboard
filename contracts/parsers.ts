/**
 * Gets the error message from the API response
 * @param error {any}
 * @param fallbackMessage {string}
 */
export const getErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error && typeof error === "object") {
    const errorRecord = error as {
      message?: unknown;
      title?: unknown;
      details?: { message?: unknown } | unknown;
    };

    if (typeof errorRecord.message === "string" && errorRecord.message.trim().length > 0) {
      return errorRecord.message;
    }

    if (
      errorRecord.details
      && typeof errorRecord.details === "object"
      && "message" in errorRecord.details
      && typeof errorRecord.details.message === "string"
      && errorRecord.details.message.trim().length > 0
    ) {
      return errorRecord.details.message;
    }

    if (typeof errorRecord.title === "string" && errorRecord.title.trim().length > 0) {
      return errorRecord.title;
    }
  }

  return fallbackMessage;
};
