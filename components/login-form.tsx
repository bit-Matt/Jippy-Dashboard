"use client";

import { type ComponentProps, type SyntheticEvent, useState } from "react";

import { $fetch } from "@/lib/http/client";
import { cn } from "@/lib/utils";
import { redirect, RedirectType } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({ className, ...props }: ComponentProps<"div">) {
  const [credentials, setCredentials] = useState<Credentials>({
    email: "",
    password: "",
    rememberMe: false,
  });

  const credentialChangeHandler = (key: keyof Credentials, e: SyntheticEvent) => {
    setCredentials(l => ({ ...l, [key]: (e.target as HTMLInputElement).value }));
  };

  const submitForm = async (e: SyntheticEvent) => {
    e.preventDefault();

    const { error } = await $fetch("/api/auth/sign-in", {
      method: "POST",
      body: {
        email: credentials.email,
        password: credentials.password,
        rememberMe: credentials.rememberMe,
      },
    });
    if (error) {
      alert("Unable to sign in. Please check your credentials and try again.");
      return;
    }

    redirect("/dashboard", RedirectType.push);
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            Login to your dashboard account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitForm}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  value={credentials.email}
                  onInput={e => credentialChangeHandler("email", e)}
                  required
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={credentials.password}
                  onInput={e => credentialChangeHandler("password", e)}
                  required
                />
              </Field>
              <Field>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember-me"
                    checked={credentials.rememberMe}
                    onCheckedChange={() => {
                      setCredentials(l => ({ ...l, rememberMe: !l.rememberMe }));
                    }}
                  />
                  <FieldLabel htmlFor="remember-me">Remember Me</FieldLabel>
                </div>
              </Field>
              <Field>
                <Button type="submit">Login</Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

type Credentials = { email: string; password: string, rememberMe: boolean };
