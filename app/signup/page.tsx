import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "@/components/signup-form";

export const metadata: Metadata = {
  title: "Sign Up",
};

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense fallback={null}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
