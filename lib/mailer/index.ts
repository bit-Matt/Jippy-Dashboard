import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is missing in environment variables");
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function send(args: SendArgs) {
  const resend = getResendClient();

  return await resend.emails.send({
    ...args,
    from: process.env.RESEND_FROM_ADDRESS!,
  });
}

type SendArgs = {
  to: Array<string>;
  subject: string;
  html: string;
}
