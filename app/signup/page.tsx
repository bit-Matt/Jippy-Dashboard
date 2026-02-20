"use client";

import { useState, useEffect } from "react";
import { redirect, RedirectType } from "next/navigation";

import { isAlreadyConfigured } from "@/lib/accounts";
import { SignupForm } from "@/components/signup-form";

export default function Page() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    isAlreadyConfigured().then(r => {
      if (r) redirect("/error/not-found", RedirectType.replace);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <p>Waiting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SignupForm />
      </div>
    </div>
  );
}
