"use client";

import { redirect, RedirectType } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  const handleSignOut = () => {
    redirect("/signout", RedirectType.replace);
  };

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>Oops!</CardTitle>
            <CardDescription>
              You do not have enough permission to access this specific resource.
            </CardDescription>
            <CardContent>
              <Button
                type="button"
                variant="link"
                className="w-full text-red-500 font-bold"
                onClick={handleSignOut}
              >
                Logout
              </Button>
            </CardContent>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
