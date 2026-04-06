import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect, RedirectType } from "next/navigation";

import { session as auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Accounts",
};

export default async function AccountsLayout({ children }: { children: ReactNode }) {
  const session = await auth.verify("administrator_user");

  if (!session) redirect("/");
  if (session.redirectTo) {
    redirect(session.redirectTo, RedirectType.replace);
  }

  return (<>{children}</>);
}
