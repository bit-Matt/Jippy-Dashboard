import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Region Management",
};

export default function RegionLayout({ children }: { children: ReactNode }) {
  return children;
}
