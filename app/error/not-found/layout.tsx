import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Not Found",
};

export default function ErrorNotFoundLayout({ children }: { children: ReactNode }) {
  return children;
}
