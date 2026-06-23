"use client";

import { type ComponentProps, type SyntheticEvent, useState, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useRouter } from "next/navigation";

import { getErrorMessage } from "@/contracts/parsers";
import { $fetch } from "@/lib/http/client";
import { cn } from "@/lib/utils";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function LoginForm({ className, ...props }: ComponentProps<"div">) {
  const turnstileComponent = useRef<TurnstileInstance | null>(null);

  const router = useRouter();
  const [credentials, setCredentials] = useState<Credentials>({
    email: "",
    password: "",
    rememberMe: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const credentialChangeHandler = (key: keyof Credentials, e: SyntheticEvent) => {
    setError(null);
    setCredentials(l => ({ ...l, [key]: (e.target as HTMLInputElement).value }));
  };

  const submitForm = async (e: SyntheticEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    setError(null);

    const widget = turnstileComponent.current;
    if (!widget) {
      setError("Security check is not ready. Please try again.");
      setIsSubmitting(false);
      return;
    }

    if (widget.isExpired()) {
      setError("Security check expired. Please complete it again.");
      widget.reset();
      setIsSubmitting(false);
      return;
    }

    try {
      const { error: fetchError } = await $fetch("/api/auth/sign-in", {
        method: "POST",
        body: {
          email: credentials.email,
          password: credentials.password,
          rememberMe: credentials.rememberMe,
          token: widget.getResponse(),
        },
      });

      if (fetchError) {
        setError(getErrorMessage(fetchError, "Unable to sign in. Please check your credentials and try again."));
        widget.reset();
        setIsSubmitting(false);
        return;
      }

      router.push("/dashboard/route");
    } catch {
      setError("Unable to sign in. Please check your credentials and try again.");
      widget.reset();
      setIsSubmitting(false);
    }
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
                  required
                />
              </Field>
              <Field>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember-me"
                    checked={credentials.rememberMe}
                    disabled={isSubmitting}
                    onCheckedChange={() => {
                      setCredentials(l => ({ ...l, rememberMe: !l.rememberMe }));
                    }}
                  />
                  <FieldLabel htmlFor="remember-me">Remember Me</FieldLabel>
                </div>
              </Field>
              <div className="gap-2 w-full">
                <Turnstile
                  ref={turnstileComponent}
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Field>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Spinner />}
                  {isSubmitting ? "Signing in..." : "Login"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

type Credentials = { email: string; password: string, rememberMe: boolean };
