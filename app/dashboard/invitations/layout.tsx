import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect, RedirectType } from "next/navigation";

import { session as auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Invitations",
};

export default async function InvitationsLayout({ children }: { children: ReactNode }) {
  const session = await auth.verify("administrator_user");

  // Redirect back to the dashboard if not verified.
  if (!session) redirect("/");
  if (session.redirectTo) {
    redirect(session.redirectTo, RedirectType.replace);
  }

  return (<>{children}</>);
}
