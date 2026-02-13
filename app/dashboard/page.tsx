import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import DashboardClient from "@/app/dashboard/dashboard-client"

export default async function Page() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  // Invalid session.
  if (!session) redirect("/");

  return (
    <DashboardClient
      user={{
        initials: session.user.name.split(" ").map(n => n[0]).join(""),
        fullName: session.user.name,
        email: session.user.email,
      }}
    />
  )
}
