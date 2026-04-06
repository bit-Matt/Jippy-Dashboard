import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Unauthorized",
};

export default function UnauthorizedLayout({ children }: { children: ReactNode }) {
  return children;
}
