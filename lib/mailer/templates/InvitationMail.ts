const { BETTER_AUTH_URL } = process.env;

export const InvitationEmailHtml = ({ inviteUrl, expiresAt, role }: InvitationMailProps) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Jippy Invitation</title>
  </head>
  <body>
    <p>Hello,</p>

    <p>
      You have been invited to join <strong>Jippy</strong> as one of the ${role}.
    </p>

    <p>
      To accept the invitation, open the link below:
    </p>

    <p>
      <a href="${new URL(inviteUrl, BETTER_AUTH_URL).toString()}">Accept invitation</a>
    </p>

    <p>
      If you can’t click the link, copy and paste this full URL into your browser:
    </p>

    <p>
      <strong>${new URL(inviteUrl, BETTER_AUTH_URL).toString()}</strong>
    </p>

    <p>
      This invitation expires at <strong>${expiresAt}</strong>.
    </p>

    <p>
      If you weren’t expecting this invitation, you can safely ignore this email.
    </p>

    <p>
      Thanks,<br />
      <strong>Jippy Team</strong>
    </p>
  </body>
</html>
`;

type InvitationMailProps = {
  inviteUrl: string;
  expiresAt: string;
  role: string;
}
