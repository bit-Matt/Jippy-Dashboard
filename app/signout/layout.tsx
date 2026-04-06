import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign Out",
};

export default function SignOutLayout({ children }: { children: ReactNode }) {
  return children;
}
