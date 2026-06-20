import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect, RedirectType } from "next/navigation";

import { session as auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Algorithm Weights",
};

export default async function AlgorithmLayout({ children }: { children: ReactNode }) {
  const session = await auth.verify("administrator_user");

  if (!session) redirect("/");
  if (session.redirectTo) {
    redirect(session.redirectTo, RedirectType.replace);
  }

  return (<>{children}</>);
}
