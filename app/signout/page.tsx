"use client";

import { useEffect } from "react";
import { redirect, RedirectType } from "next/navigation";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/lib/accounts";

export default function Page() {
  useEffect(() => {
    signOut().finally(() => redirect("/", RedirectType.push));
  }, []);

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>Signing out...</CardTitle>
            <CardDescription>
              Please wait...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
