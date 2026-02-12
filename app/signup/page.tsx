"use client";

import { useState, useEffect } from "react";
import { isAlreadyConfigured } from "@/lib/accounts"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SignupForm } from "@/components/signup-form"

export default function Page() {
  const [ready, setReady] = useState({ ready: false, configured: false });

  useEffect(() => {
    isAlreadyConfigured().then(r => {
      setReady({ ready: true, configured: r });
    });
  }, []);

  if (!ready.ready) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <p>Waiting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        {
          ready.configured ? (
            <Card>
              <CardHeader>
                <CardTitle>Not available!</CardTitle>
                <CardDescription>
                  This server is already been configured.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <SignupForm />
          )
        }
      </div>
    </div>
  )
}
