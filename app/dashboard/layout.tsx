import { headers } from "next/headers";
import type { ReactNode } from "react";
import { redirect, RedirectType } from "next/navigation";

import { auth } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Invalid session.
  if (!session) redirect("/");
  if (session.user.role !== "administrator_user") {
    redirect("/error/unauthorized", RedirectType.replace);
  }

  return (<>{children}</>);
}
