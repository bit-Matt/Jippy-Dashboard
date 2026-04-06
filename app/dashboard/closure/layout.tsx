import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Closure Management",
};

export default function ClosureLayout({ children }: { children: ReactNode }) {
  return children;
}
