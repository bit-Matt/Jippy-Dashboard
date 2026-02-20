import {type ComponentProps, type SyntheticEvent, useState} from "react";
import {configureUser, type UserCredentials} from "@/lib/accounts";
import {redirect, RedirectType} from "next/navigation";

import {Button} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Field, FieldDescription, FieldGroup, FieldLabel} from "@/components/ui/field";
import {Input} from "@/components/ui/input";

export function SignupForm({ ...props }: ComponentProps<typeof Card>) {
  const [form, setForm] = useState<StateType>({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const updateField = (field: keyof StateType, e: SyntheticEvent) => {
    setForm(l => ({
      ...l,
      [field]: (e.target as HTMLInputElement).value,
    }));
  };

  const submitForm = async (e: SyntheticEvent) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    const result = await configureUser({
      fullName: form.fullName,
      email: form.email,
      password: form.password,
    });
    if (!result.ok) {
      alert(result.message!);
    }

    // Redirect after configure.
    redirect("/", RedirectType.push);
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
                value={form.email}
                onInput={e => updateField("email", e)}
                required
              />
              <FieldDescription>
                We&apos;ll use this to contact you. We will not share your email
                with anyone else.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                value={form.password}
                onInput={e => updateField("password", e)}
                required
              />
              <FieldDescription>
                Your password must be at least 8 characters long. It is required that it must have
                a mix of letters, numbers, and symbols.
              </FieldDescription>
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

type StateType = UserCredentials & { confirmPassword: string };
