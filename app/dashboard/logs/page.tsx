"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import useSWR from "swr";

import { AppSidebar } from "@/components/app-sidebar";
import { Badge } from "@/components/ui/badge";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { $fetch } from "@/lib/http/client";

type ActivityListItem = {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  category: string;
  entityType: string | null;
  entityId: string | null;
  routePath: string | null;
  httpMethod: string | null;
  statusCode: number | null;
  summary: string;
  actorName: string | null;
  actorEmail: string | null;
};

type ApiResponse<T> = {
  data: {
    ok: boolean;
    data: T;
  };
};

export default function LogsPage() {
  const router = useRouter();
  const { data, isLoading, error } = useSWR<ApiResponse<{ rows: ActivityListItem[]; total: number; page: number; pageSize: number }>>(
    "/api/restricted/management/logs?page=1&pageSize=50",
    $fetch,
  );

  const rows = useMemo(() => data?.data?.data?.rows ?? [], [data]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="rounded-xl border bg-card p-4 md:p-6">
          <div className="mb-4">
            <h1 className="text-xl font-semibold">Activity Logs</h1>
            <p className="text-sm text-muted-foreground">Administrator audit trail for dashboard activities.</p>
          </div>

          {isLoading ? <p className="text-sm text-muted-foreground">Loading logs...</p> : null}
          {error ? <p className="text-sm text-destructive">Failed to load activity logs.</p> : null}

          {!isLoading && !error ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No activity logs available.
                    </TableCell>
                  </TableRow>
                ) : rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() => router.push(`/dashboard/logs/${row.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{row.actorEmail ?? row.actorName ?? "System"}</TableCell>
                    <TableCell>{renderCategory(row.category)}</TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell>{row.entityType && row.entityId ? `${row.entityType}:${row.entityId}` : "-"}</TableCell>
                    <TableCell>{row.statusCode ?? "-"}</TableCell>
                    <TableCell className="max-w-[24rem] truncate">{row.summary}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function renderCategory(category: string) {
  switch (category) {
  case "dashboard_visit":
    return <Badge variant="secondary">Visit</Badge>;
  case "security_event":
    return <Badge variant="destructive">Security</Badge>;
  case "snapshot_state_changed":
    return <Badge variant="outline">Snapshot State</Badge>;
  case "active_snapshot_changed":
    return <Badge variant="default">Active Switch</Badge>;
  default:
    return <Badge variant="ghost">Write</Badge>;
  }
}
