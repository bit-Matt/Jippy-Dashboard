import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function Dashboard() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  // Invalid session.
  if (!session) redirect("/");

  return (<p>Hello world</p>);
}
