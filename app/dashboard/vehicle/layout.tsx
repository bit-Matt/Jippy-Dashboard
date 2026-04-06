import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Vehicle Management",
};

export default function VehicleLayout({ children }: { children: ReactNode }) {
  return children;
}
