"use client";

import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export default function Typography({ variant, children, className, ...props }: TypographyProps) {
  if (variant === "h1") {
    return (
      <h1
        className={cn(
          "scroll-m-20 text-4xl font-extrabold tracking-tight text-balance",
          className,
        )}
        {...props}>
        {children}
      </h1>
    );
  }

  if (variant === "h2") {
    return (
      <h2
        className={cn(
          "scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0",
          className,
        )}
        {...props}>
        {children}
      </h2>
    );
  }

  if (variant === "h3") {
    return (
      <h3
        className={cn(
          "scroll-m-20 text-2xl font-semibold tracking-tight",
          className,
        )}
        {...props}>
        {children}
      </h3>
    );
  }

  if (variant === "h4") {
    return (
      <h4
        className={cn(
          "scroll-m-20 text-xl font-semibold tracking-tight",
          className,
        )}
        {...props}>
        {children}
      </h4>
    );
  }

  if (variant === "inline-code") {
    return (
      <code
        className={cn(
          "bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",
          className,
        )}
        {...props}>
        {children}
      </code>
    );
  }

  if (variant === "lead") {
    return (
      <p
        className={cn(
          "text-xl text-muted-foreground",
          className,
        )}
        {...props}>
        {children}
      </p>
    );
  }

  if (variant === "large") {
    return (
      <div
        className={cn(
          "text-lg font-semibold",
          className,
        )}
        {...props}>
        {children}
      </div>
    );
  }

  if (variant === "small") {
    return (
      <small
        className={cn(
          "text-sm font-medium leading-none",
          className,
        )}
        {...props}>
        {children}
      </small>
    );
  }

  if (variant === "muted") {
    return (
      <p
        className={cn(
          "text-sm text-muted-foreground",
          className,
        )}
        {...props}>
        {children}
      </p>
    );
  }

  return (
    <p
      className={cn(
        "leading-7 not-first:mt-6",
        className,
      )}
      {...props}>
      {children}
    </p>
  );
}

type TypographyProps = {
  variant:
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "p"
    | "inline-code"
    | "lead"
    | "large"
    | "small"
    | "muted";
  children: ReactNode;
} & ComponentProps<"p">;
