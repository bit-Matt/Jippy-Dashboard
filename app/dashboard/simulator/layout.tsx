import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Simulator",
};

export default function SimulatorLayout({ children }: { children: ReactNode }) {
  return children;
}
