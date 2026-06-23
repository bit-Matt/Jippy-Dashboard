import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";

export async function validate(token: string): Promise<Result<boolean>> {
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        response: token,
        secret: process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY!,
      }),
    });

    const resp: { success: boolean; } = await response.json();
    if (!resp.success) {
      return new Success(false);
    }

    return new Success(true);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to validate turnstile.", {}, e);
  }
}
