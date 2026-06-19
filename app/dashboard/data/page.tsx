"use client";

import { Download, Trash2, Upload } from "lucide-react";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { AppSidebar } from "@/components/app-sidebar";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { ImportPayload } from "@/lib/management/data-schema";
import { $fetch } from "@/lib/http/client";

type ApiResponse<T> = {
  data: {
    ok: boolean;
    data: T;
  };
  error?: unknown;
};

type MeResponse = {
  data: {
    ok: boolean;
    data: {
      role: string;
    };
  };
  error?: unknown;
};

type SnapshotCleanupStats = {
  orphanedRouteSnapshots: number;
  orphanedRegionSnapshots: number;
  unusedRouteSnapshots: number;
  unusedRegionSnapshots: number;
};

type ImportSummary = {
  vehicleTypes: number;
  routes: number;
  regions: number;
  closures: number;
  stops: number;
};

type ImportPreview = {
  vehicleTypes: number;
  routes: number;
  regions: number;
  closures: number;
  stops: number;
  orphanedRouteSnapshots: number;
  orphanedRegionSnapshots: number;
};

function getImportPreview(payload: ImportPayload): ImportPreview {
  return {
    vehicleTypes: payload.vehicleTypes.length,
    routes: payload.routes.length,
    regions: payload.regions.length,
    closures: payload.closures.length,
    stops: payload.stops.length,
    orphanedRouteSnapshots: payload.orphanedSnapshots?.routes.length ?? 0,
    orphanedRegionSnapshots: payload.orphanedSnapshots?.regions.length ?? 0,
  };
}

export default function DataManagementPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<"orphaned" | "unused" | null>(null);
  const [importPayload, setImportPayload] = useState<ImportPayload | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const { data: meResponse } = useSWR<MeResponse>("/api/me", $fetch);
  const { data: statsResponse, error: statsError, isLoading: statsLoading, mutate: mutateStats } = useSWR<ApiResponse<SnapshotCleanupStats>>(
    "/api/restricted/management/data/snapshots",
    $fetch,
  );

  const isAdmin = meResponse?.data?.data?.role === "administrator_user";
  const stats = useMemo(() => statsResponse?.data?.data, [statsResponse]);
  const importPreview = useMemo(
    () => (importPayload ? getImportPreview(importPayload) : null),
    [importPayload],
  );

  const handleExport = async () => {
    setIsExporting(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/restricted/management/data/export");
      if (!response.ok) {
        throw new Error("Export request failed.");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] ?? `jippy-export-${new Date().toISOString().slice(0, 10)}.json`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);

      setStatusMessage("Export downloaded successfully.");
    } catch {
      setStatusMessage("Failed to export data.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setImportError(null);
    setImportPayload(null);
    setStatusMessage(null);

    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ImportPayload;
      setImportPayload(parsed);
    } catch {
      setImportError("Selected file is not valid JSON.");
    } finally {
      event.target.value = "";
    }
  };

  const handleImport = async () => {
    if (!importPayload) return;

    setIsImporting(true);
    setStatusMessage(null);

    const { data, error } = await $fetch<{ ok: boolean; data: ImportSummary }>("/api/restricted/management/data/import", {
      method: "POST",
      body: importPayload,
    });

    if (error || !data?.ok) {
      setStatusMessage("Import failed. Check that the JSON matches the export schema.");
      setIsImporting(false);
      return;
    }

    const summary = data.data;
    setImportPayload(null);
    setStatusMessage(
      `Import complete: ${summary.routes} routes, ${summary.regions} regions, ${summary.closures} closures, ${summary.stops} stops.`,
    );
    setIsImporting(false);
    await mutateStats();
  };

  const handleDeleteSnapshots = async (type: "orphaned" | "unused") => {
    setIsDeleting(type);
    setStatusMessage(null);

    const { data, error } = await $fetch<{ ok: boolean; data: { routeSnapshotsDeleted: number; regionSnapshotsDeleted: number } }>(
      `/api/restricted/management/data/snapshots?type=${type}`,
      { method: "DELETE" },
    );

    if (error || !data?.ok) {
      setStatusMessage(`Failed to delete ${type} snapshots.`);
      setIsDeleting(null);
      return;
    }

    const summary = data.data;
    setStatusMessage(
      type === "orphaned"
        ? `Deleted ${summary.routeSnapshotsDeleted} orphaned route snapshots and ${summary.regionSnapshotsDeleted} orphaned region snapshots.`
        : `Deleted ${summary.routeSnapshotsDeleted} unused route snapshots and ${summary.regionSnapshotsDeleted} unused region snapshots.`,
    );
    setIsDeleting(null);
    await mutateStats();
  };

  const orphanedTotal = (stats?.orphanedRouteSnapshots ?? 0) + (stats?.orphanedRegionSnapshots ?? 0);
  const unusedTotal = (stats?.unusedRouteSnapshots ?? 0) + (stats?.unusedRegionSnapshots ?? 0);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-col gap-6 rounded-xl border bg-card p-4 md:p-6">
          <div>
            <h1 className="text-xl font-semibold">Data Management</h1>
            <p className="text-sm text-muted-foreground">
              Export and import transit data, and clean up orphaned or unused snapshots.
            </p>
          </div>

          {!isAdmin ? (
            <p className="text-sm text-destructive">Administrator access is required for this page.</p>
          ) : null}

          {statusMessage ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{statusMessage}</p>
          ) : null}

          {isAdmin ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Export Data</CardTitle>
                  <CardDescription>
                    Download all routes, regions, closures, stops, vehicle types, and snapshots as JSON.
                    Orphaned snapshots are included in the export.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={handleExport} disabled={isExporting}>
                    <Download className="mr-2 h-4 w-4" />
                    {isExporting ? "Exporting..." : "Export All Data"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Import Data</CardTitle>
                  <CardDescription>
                    Upload a JSON export file to restore data. Orphaned snapshots in the file are ignored during import.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileChange}
                  />

                  {importError ? <p className="text-sm text-destructive">{importError}</p> : null}

                  {importPreview ? (
                    <div className="space-y-3 rounded-md border p-4">
                      <p className="text-sm font-medium">Import preview</p>
                      <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                        <p>Vehicle types: {importPreview.vehicleTypes}</p>
                        <p>Routes: {importPreview.routes}</p>
                        <p>Regions: {importPreview.regions}</p>
                        <p>Closures: {importPreview.closures}</p>
                        <p>Stops: {importPreview.stops}</p>
                        <p>Orphaned route snapshots (ignored): {importPreview.orphanedRouteSnapshots}</p>
                        <p>Orphaned region snapshots (ignored): {importPreview.orphanedRegionSnapshots}</p>
                      </div>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button disabled={isImporting}>
                            <Upload className="mr-2 h-4 w-4" />
                            {isImporting ? "Importing..." : "Confirm Import"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Import data?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will insert new records with fresh IDs. Existing data is not replaced automatically.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleImport}>Import</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Snapshot Cleanup</CardTitle>
                  <CardDescription>
                    Remove orphaned snapshots with no parent entity, or unused draft snapshots that are not active.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  {statsLoading ? <p className="text-sm text-muted-foreground md:col-span-2">Loading snapshot stats...</p> : null}
                  {statsError ? <p className="text-sm text-destructive md:col-span-2">Failed to load snapshot stats.</p> : null}

                  <div className="space-y-3 rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">Orphaned Snapshots</p>
                      <Badge variant="secondary">{orphanedTotal}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Route snapshots: {stats?.orphanedRouteSnapshots ?? 0}
                      {" · "}
                      Region snapshots: {stats?.orphanedRegionSnapshots ?? 0}
                    </p>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={orphanedTotal === 0 || isDeleting !== null}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete All Orphaned
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete orphaned snapshots?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently deletes {orphanedTotal} orphaned snapshot records.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteSnapshots("orphaned")}>
                            {isDeleting === "orphaned" ? "Deleting..." : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  <div className="space-y-3 rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">Unused Draft Snapshots</p>
                      <Badge variant="secondary">{unusedTotal}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Non-active WIP or for-approval snapshots. Route: {stats?.unusedRouteSnapshots ?? 0}
                      {" · "}
                      Region: {stats?.unusedRegionSnapshots ?? 0}
                    </p>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={unusedTotal === 0 || isDeleting !== null}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete All Unused
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete unused draft snapshots?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently deletes {unusedTotal} unused draft snapshot records.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteSnapshots("unused")}>
                            {isDeleting === "unused" ? "Deleting..." : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
