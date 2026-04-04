"use client";

import { Plus, RefreshCcw, Trash } from "lucide-react";
import { type InputEvent, type SubmitEvent, useState } from "react";
import useSWR from "swr";

import { $fetch, type BetterFetchResponse } from "@/lib/http/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import Typography from "@/components/typography";

export default function Invitations() {
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<InvitationListResponse, ApiResponseException>>(
    "/api/restricted/accounts/invitations", $fetch);

  const onRevokeHandler = (id: string) => {
    if (data?.data && data.data.data) {
      mutate({
        data: {
          ok: true,
          data: data.data.data.filter(x => x.id !== id),
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  const handleInvite = (invitation: InvitationResponse) => {
    if (data?.data && data.data.data) {
      mutate({
        data: {
          ok: true,
          data: [...data.data.data, invitation.data],
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  return (
    <div className="p-4 pt-0 w-full">
      <Typography variant="h3" className="mb-4">Invitations</Typography>

      <InvitationForm handleInvite={handleInvite} />

      <Table>
        <TableCaption>{
          isLoading ? "Loading..." : (error || data?.error) ? "Hmm. That didn't work. Try again later." : "That's all!"
        }</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-55">Email</TableHead>
            <TableHead>Office Position</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {
            (data?.data?.data || []).map((invitation) => (
              <Row key={invitation.id} data={invitation} onRevoke={onRevokeHandler} />
            ))
          }
        </TableBody>
      </Table>
    </div>
  );
}

function Row({ data, onRevoke }: { data: InvitationListResponse["data"][0], onRevoke: (id: string) => void }) {
  const [isRevoking, setIsRevoking] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const handleRevoke = async () => {
    setIsRevoking(true);

    const res = await $fetch<"", ApiResponseException>("/api/restricted/accounts/invitations/" + data.id, {
      method: "DELETE",
    });

    if (res.error) {
      alert("Failed to revoke invitation. Try again later.");
      return;
    }

    onRevoke(data.id);
  };

  const handleResend = async () => {
    setIsResending(true);

    const res = await $fetch<{ sent: boolean, errors?: object }, ApiResponseException>("/api/restricted/accounts/invitations/" + data.id, {
      method: "POST",
    });

    if (res.error) {
      alert("Failed to resend invitation. Try again later.");
    } else {
      if (res.data.errors) {
        alert("Invitation created, but failed to send the email. You can retry sending it later.");
        return;
      }

      alert("Invitation resent!");
    }

    setIsResending(false);
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{data.email}</TableCell>
      <TableCell>{data.role ? "Root User" : "Collaborator"}</TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className="bg-blue-500/15 text-blue-700 hover:bg-blue-500/25 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 border-0"
        >
          Pending
        </Badge>
      </TableCell>
      <TableCell className="text-right space-x-2">
        <Button
          onClick={handleResend}
          disabled={isResending}
          variant="outline"
          className="h-8 w-8"
        >
          {
            isResending ? (<Spinner />) : (<RefreshCcw />)
          }
        </Button>
        <Button
          onClick={handleRevoke}
          disabled={isRevoking}
          variant="outline"
          className="h-8 w-8 text-destructive hover:bg-destructive hover:text-white"
        >
          {
            isRevoking ? (<Spinner />) : (<Trash />)
          }
        </Button>
      </TableCell>
    </TableRow>
  );
}

function InvitationForm({ handleInvite }: { handleInvite: (invitation: InvitationResponse) => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");

  const handleSetEmail = (e: InputEvent<HTMLInputElement>) => {
    setEmail(e.currentTarget.value);
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const { data } = await $fetch<InvitationResponse, ApiResponseException>("/api/restricted/accounts/invitations", {
      method: "POST",
      body: { email },
    });

    if (data?.ok) {
      handleInvite(data);

      if (data?.data?.errors) {
        alert("Invitation created, but failed to send the email. You can retry sending it later.");
      } else {
        alert("Invitation sent!");
      }

      // Clear values
      setEmail("");

      // Remove values
      setOpen(false);
      return;
    }

    alert("Failed to send invitation. Try again later.");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="mb-4">
          <Plus />
          Invite a Collaborator
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite a Collaborator</DialogTitle>
          <DialogDescription>
            Enter the email address of the member you want to invite and the office you want to assign them to.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Example: example@gmail.com"
                onInput={handleSetEmail}
                value={email}
                required
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit">Invite</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type InvitationResponse = {
  ok: boolean;
  data: {
    id: string;
    email: string;
    role: string;
    errors?: object;
  }
}

type InvitationListResponse = {
  ok: boolean;
  data: {
    id: string;
    email: string;
    role: string;
  }[];
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
