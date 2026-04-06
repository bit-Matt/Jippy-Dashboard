"use client";

import { Ban, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

import { AppSidebar } from "@/components/app-sidebar";
import Typography from "@/components/typography";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { $fetch, type BetterFetchResponse } from "@/lib/http/client";

export default function AccountsPage() {
  const [activeTab, setActiveTab] = useState<"active" | "banned">("active");
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<AccountListResponse, ApiResponseException>>(
    "/api/restricted/accounts/users",
    $fetch,
  );

  const users = useMemo(() => data?.data?.data ?? [], [data]);
  const activeUsers = useMemo(() => users.filter(user => !user.banned), [users]);
  const bannedUsers = useMemo(() => users.filter(user => user.banned), [users]);

  const patchUserInList = (patched: Account) => {
    if (!data?.data?.data) {
      return;
    }

    mutate({
      data: {
        ok: true,
        data: data.data.data.map(user => user.id === patched.id ? patched : user),
      },
      error: undefined,
    }).catch(console.error);
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="p-4 pt-4 w-full">
          <Typography variant="h3" className="mb-2">Accounts</Typography>
          <p className="mb-4 text-sm text-muted-foreground">
            Manage account access by banning or unbanning collaborator accounts.
          </p>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "active" | "banned")}
          >
            <TabsList>
              <TabsTrigger value="active">Active ({activeUsers.length})</TabsTrigger>
              <TabsTrigger value="banned">Banned ({bannedUsers.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              <AccountTable
                users={activeUsers}
                isLoading={isLoading}
                hasError={Boolean(error || data?.error)}
                emptyText="No active accounts found."
                onUserPatched={patchUserInList}
              />
            </TabsContent>

            <TabsContent value="banned">
              <AccountTable
                users={bannedUsers}
                isLoading={isLoading}
                hasError={Boolean(error || data?.error)}
                emptyText="No banned accounts found."
                onUserPatched={patchUserInList}
              />
            </TabsContent>
          </Tabs>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AccountTable({
  users,
  isLoading,
  hasError,
  emptyText,
  onUserPatched,
}: {
  users: Account[];
  isLoading: boolean;
  hasError: boolean;
  emptyText: string;
  onUserPatched: (user: Account) => void;
}) {
  return (
    <Table>
      <TableCaption>
        {isLoading ? "Loading..." : hasError ? "Hmm. That didn't work. Try again later." : "That's all!"}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Registered</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.length === 0 && !isLoading && !hasError ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              {emptyText}
            </TableCell>
          </TableRow>
        ) : users.map((user) => (
          <AccountRow
            key={user.id}
            user={user}
            onUserPatched={onUserPatched}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function AccountRow({
  user,
  onUserPatched,
}: {
  user: Account;
  onUserPatched: (user: Account) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleBan = async () => {
    setIsSubmitting(true);

    const { data, error } = await $fetch<PatchAccountResponse, ApiResponseException>(
      `/api/restricted/accounts/users/${user.id}`,
      { method: "PATCH" },
    );

    if (error || !data?.ok) {
      alert(`Failed to ${user.banned ? "unban" : "ban"} account. Try again later.`);
      setIsSubmitting(false);
      return;
    }

    onUserPatched(data.data);
    setIsSubmitting(false);
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{user.fullName}</TableCell>
      <TableCell>{user.email}</TableCell>
      <TableCell>{user.role === "administrator_user" ? "Root User" : "Collaborator"}</TableCell>
      <TableCell>{user.registrationDate}</TableCell>
      <TableCell>
        {user.banned ? (
          <Badge
            variant="outline"
            className="bg-red-500/15 text-red-700 hover:bg-red-500/25 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 border-0"
          >
            Banned
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="bg-green-500/15 text-green-700 hover:bg-green-500/25 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20 border-0"
          >
            Active
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={isSubmitting}
              variant={user.banned ? "outline" : "destructive"}
              className="w-28"
            >
              {isSubmitting ? <Spinner /> : user.banned ? <ShieldCheck /> : <Ban />}
              {user.banned ? "Unban" : "Ban"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{user.banned ? "Unban account?" : "Ban account?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {user.banned
                  ? `This will restore access for ${user.fullName} (${user.email}).`
                  : `This will block ${user.fullName} (${user.email}) from restricted APIs and dashboard access.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant={user.banned ? "default" : "destructive"}
                onClick={toggleBan}
              >
                {user.banned ? "Confirm Unban" : "Confirm Ban"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

type Account = {
  id: string;
  fullName: string;
  email: string;
  activated: boolean;
  banned: boolean;
  registrationDate: string;
  role: string;
}

type AccountListResponse = {
  ok: boolean;
  data: Account[];
}

type PatchAccountResponse = {
  ok: boolean;
  data: Account;
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
