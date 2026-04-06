import type { ReactNode } from "react";
import { redirect, RedirectType } from "next/navigation";

import { session as auth } from "@/lib/auth";

export default async function LogsLayout({ children }: { children: ReactNode }) {
  const currentSession = await auth.verify("administrator_user");

  if (!currentSession) redirect("/");
  if (currentSession.redirectTo) {
    redirect(currentSession.redirectTo, RedirectType.replace);
  }

  return (<>{children}</>);
}
