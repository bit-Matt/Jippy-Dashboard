import type { ReactNode } from "react";
import { redirect, RedirectType } from "next/navigation";

import { session as auth, SessionCode } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth.verify();

  if (!session || session.code !== SessionCode.Ok) {
    if (session?.redirectTo) {
      redirect(session.redirectTo, RedirectType.replace);
    }

    redirect("/");
  }

  return (<>{children}</>);
}
