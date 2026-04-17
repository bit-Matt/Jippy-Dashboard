"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import { getErrorMessage } from "@/contracts/parsers";
import { AppSidebar } from "@/components/app-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { $fetch } from "@/lib/http/client";

type FeedbackState = "Active" | "Resolved" | "Closed";

type FeedbackItem = {
  id: string;
  email: string;
  type: string;
  details: string;
  state: FeedbackState;
  createdAt: string;
  updatedAt: string;
};

type FeedbackListPayload = {
  rows: FeedbackItem[];
  total: number;
  page: number;
  limit: number;
};

type ApiResponse<T> = {
  data: {
    ok: boolean;
    data: T;
  };
  error?: unknown;
};

type ApiResponseException = {
  message?: string;
  title?: string;
  details?: { message?: string } | string;
};

const FEEDBACK_STATES: FeedbackState[] = ["Active", "Resolved", "Closed"];

export default function FeedbackPage() {
  const [activeTab, setActiveTab] = useState<FeedbackState>("Active");
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [nextState, setNextState] = useState<FeedbackState>("Active");
  const [isUpdating, setIsUpdating] = useState(false);

  const requestUrl = `/api/restricted/management/feedback?page=1&limit=50&state=${activeTab}`;
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<FeedbackListPayload>>(
    requestUrl,
    $fetch,
  );

  const rows = useMemo(() => {
    const values = data?.data?.data?.rows ?? [];

    return [...values].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [data]);

  const onSelectRow = (row: FeedbackItem) => {
    setSelectedFeedback(row);
    setNextState(row.state);
  };

  const onDialogChange = (open: boolean) => {
    if (!open) {
      setSelectedFeedback(null);
      setIsUpdating(false);
    }
  };

  const handleUpdateState = async () => {
    if (!selectedFeedback) {
      return;
    }

    setIsUpdating(true);

    const { data: updated, error: updateError } = await $fetch<
      { ok: boolean; data: FeedbackItem },
      ApiResponseException
    >(`/api/restricted/management/feedback/${selectedFeedback.id}`, {
      method: "PATCH",
      body: { state: nextState },
    });

    if (updateError || !updated?.ok) {
      alert(getErrorMessage(updateError, "Failed to update feedback state."));
      setIsUpdating(false);
      return;
    }

    await mutate();
    setIsUpdating(false);
    setSelectedFeedback(null);
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="rounded-xl border bg-card p-4 md:p-6">
          <div className="mb-4 space-y-1">
            <h1 className="text-xl font-semibold">Feedback Reports</h1>
            <p className="text-sm text-muted-foreground">
              Review mobile feedback submissions and update their lifecycle state.
            </p>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as FeedbackState)}
            className="mb-4"
          >
            <TabsList>
              <TabsTrigger value="Active">Active</TabsTrigger>
              <TabsTrigger value="Resolved">Resolved</TabsTrigger>
              <TabsTrigger value="Closed">Closed</TabsTrigger>
            </TabsList>
          </Tabs>

          {isLoading ? <p className="text-sm text-muted-foreground">Loading feedback entries...</p> : null}
          {error ? <p className="text-sm text-destructive">Failed to load feedback entries.</p> : null}

          {!isLoading && !error ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted At</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No feedback found in this state.
                    </TableCell>
                  </TableRow>
                ) : rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => onSelectRow(row)}
                  >
                    <TableCell>{formatDate(row.createdAt)}</TableCell>
                    <TableCell className="font-medium">{row.email}</TableCell>
                    <TableCell>{row.type}</TableCell>
                    <TableCell>{renderStateBadge(row.state)}</TableCell>
                    <TableCell className="max-w-120 truncate">{row.details}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </div>
      </SidebarInset>

      <Dialog open={Boolean(selectedFeedback)} onOpenChange={onDialogChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Feedback Details</DialogTitle>
            <DialogDescription>Review the full report and update its state.</DialogDescription>
          </DialogHeader>

          {selectedFeedback ? (
            <div className="grid gap-4">
              <div className="grid gap-2 text-sm">
                <p><span className="font-medium">Submitted At:</span> {formatDate(selectedFeedback.createdAt)}</p>
                <p><span className="font-medium">Email:</span> {selectedFeedback.email}</p>
                <p><span className="font-medium">Type:</span> {selectedFeedback.type}</p>
                <p><span className="font-medium">Current State:</span> {selectedFeedback.state}</p>
              </div>

              <div className="grid gap-2">
                <h3 className="font-medium">Details</h3>
                <p className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap wrap-break-word">
                  {selectedFeedback.details}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Update State</p>
                  <Select
                    value={nextState}
                    onValueChange={(value) => setNextState(value as FeedbackState)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {FEEDBACK_STATES.map((state) => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleUpdateState}
                  disabled={isUpdating || !selectedFeedback || selectedFeedback.state === nextState}
                >
                  {isUpdating ? "Updating..." : "Update State"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function renderStateBadge(state: FeedbackState) {
  switch (state) {
  case "Active":
    return (
      <Badge
        variant="outline"
        className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20 border-0"
      >
        Active
      </Badge>
    );
  case "Resolved":
    return (
      <Badge
        variant="outline"
        className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 border-0"
      >
        Resolved
      </Badge>
    );
  case "Closed":
    return (
      <Badge
        variant="outline"
        className="bg-slate-500/15 text-slate-700 hover:bg-slate-500/25 dark:bg-slate-500/10 dark:text-slate-300 dark:hover:bg-slate-500/20 border-0"
      >
        Closed
      </Badge>
    );
  default:
    return <Badge variant="outline">{state}</Badge>;
  }
}
