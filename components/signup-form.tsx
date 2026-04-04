"use client";

import {Check, X} from "lucide-react";
import {type ComponentProps, type SyntheticEvent, useMemo, useState} from "react";
import {redirect, RedirectType, useSearchParams} from "next/navigation";
import useSWR from "swr";

import {Button} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import ErrorTextRenderer from "@/components/error-text-renderer";
import {Field, FieldDescription, FieldGroup, FieldLabel} from "@/components/ui/field";
import {Input} from "@/components/ui/input";

import {$fetch, BetterFetchResponse} from "@/lib/http/client";
import {type UserCredentials} from "@/lib/accounts";

export function SignupForm({ ...props }: ComponentProps<typeof Card>) {
  const searchParams = useSearchParams();
  const eligibilityToken = searchParams.get("token");

  const [onFocus, setOnFocus] = useState(false);
  const [form, setForm] = useState<StateType>({
    fullName: "",
    password: "",
    confirmPassword: "",
  });

  const { data, error, isLoading } = useSWR<BetterFetchResponse<EnrollmentEligibilityResponse, ApiResponseException>>(
    eligibilityToken ? `/api/auth/sign-up/check?token=${eligibilityToken}` : null,
    $fetch,
  );

  const requirements = useMemo(() => [
    { label: "At least 2 lowercase", regex: /(.*[a-z]){2,}/ },
    { label: "At least 2 uppercase", regex: /(.*[A-Z]){2,}/ },
    { label: "At least 2 numbers", regex: /(.*\d){2,}/ },
    { label: "At least 2 symbols", regex: /(.*[!@#$%^&*(),.?":{}|<>]){2,}/ },
  ], []);

  // No token
  if (!eligibilityToken) {
    return (
      <Card {...props}>
        <CardHeader>
          <CardTitle>Invalid Invitation</CardTitle>
          <CardDescription>
            Your invitation is invalid. It may have been expired or already been used.<br />
            Contact the administrator for assistance.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error || data?.error) {
    return (
      <Card {...props}>
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>
            An error occurred while validating your invitation. Please try again later or contact support if the issue persists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ErrorTextRenderer
            className="text-muted-foreground text-sm text-balance"
            message={data?.error?.details || "Unknown Error Occurred"}
          />
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card {...props}>
        <CardHeader>
          <CardTitle>Validating...</CardTitle>
          <CardDescription>
            Please wait while we check your invitation...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const updateField = (field: keyof StateType, e: SyntheticEvent) => {
    setForm(l => ({
      ...l,
      [field]: (e.target as HTMLInputElement).value,
    }));
  };

  const submitForm = async (e: SyntheticEvent) => {
    e.preventDefault();

    const result = await $fetch("/api/auth/sign-up", {
      method: "POST",
      body: {
        fullName: form.fullName,
        password: form.password,
        token: data?.data?.data.token || "",
      },
    });
    if (result.error) {
      alert("Failed to enroll. Please try again.");
      return;
    }

    // Redirect after a successful enrollment
    redirect("/", RedirectType.replace);
  };

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Setup your administrator account</CardTitle>
        <CardDescription>
          Enter your information below to create your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submitForm}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Full Name</FieldLabel>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={form.fullName}
                onInput={e => updateField("fullName", e)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                value={data?.data?.data?.email}
                readOnly
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Role</FieldLabel>
              <Input
                id="role"
                type="text"
                value={data?.data?.data?.role ? "Root Account" : "Administrator"}
                readOnly
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                value={form.password}
                onFocus={() => setOnFocus(true)}
                onBlur={() => setOnFocus(false)}
                onInput={e => updateField("password", e)}
                required
              />
              {
                onFocus && (
                  <ul className="grid grid-cols-1 gap-2">
                    {requirements.map((req, index) => {
                      const isMet = req.regex.test(form.password);
                      return (
                        <li key={index} className="flex items-center gap-2 text-sm transition-colors">
                          {isMet ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <X className="w-4 h-4 text-muted-foreground/50" />
                          )}
                          <span className={isMet ? "text-foreground" : "text-muted-foreground"}>
                            {req.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )
              }
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">
                Confirm Password
              </FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                value={form.confirmPassword}
                onInput={e => updateField("confirmPassword", e)}
                required
              />
              <FieldDescription>Please confirm your password.</FieldDescription>
            </Field>
            <FieldGroup>
              <Field>
                <Button type="submit">Create Account</Button>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

type EnrollmentEligibilityResponse = {
    ok: true;
    data: {
      id: string;
      token: string;
      role: string;
      email: string;
    };
}

type ApiResponseException = {
    type: string;
    title: string;
    status: number;
    statusText: string;
    traceId?: string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details: string | Record<string, any>;
    message: string;
}

type StateType = UserCredentials & { confirmPassword: string };
