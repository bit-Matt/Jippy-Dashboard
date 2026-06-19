import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Stop Management",
};

export default function StopsLayout({ children }: { children: ReactNode }) {
  return children;
}
