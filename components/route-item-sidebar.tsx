"use client";

import { X } from "lucide-react";

import type { RouteResponse } from "@/contracts/responses";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { normalizeSnapshotStateLabel, type SnapshotListItem } from "@/components/snapshot-types";

interface RouteItemSidebarProps {
  route: RouteResponse;
  snapshots: SnapshotListItem[];
  selectedSnapshotId: string | null;
  activeSnapshotId: string | null;
  isSnapshotLoading: boolean;
  isSnapshotActing: boolean;
  isDeletingRoute: boolean;
  userRole: string | null;
  onClose: () => void;
  onDeleteRoute: () => void;
  onSelectSnapshot: (snapshotId: string) => void;
  onSetActiveSnapshot: (snapshotId: string) => void;
  onTogglePublic: (isPublic: boolean) => void;
  onDeleteSnapshot: (snapshotId: string) => void;
  onEditSnapshot: (snapshotId: string) => void;
  onCloneSnapshot: (snapshotId: string) => void;
  onCreateBlankSnapshot: () => void;
}

export default function RouteItemSidebar({
  route,
  snapshots,
  selectedSnapshotId,
  activeSnapshotId,
  isSnapshotLoading,
  isSnapshotActing,
  isDeletingRoute,
  userRole,
  onClose,
  onDeleteRoute,
  onSelectSnapshot,
  onSetActiveSnapshot,
  onTogglePublic,
  onDeleteSnapshot,
  onEditSnapshot,
  onCloneSnapshot,
  onCreateBlankSnapshot,
}: RouteItemSidebarProps) {
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null;
  const displayedSnapshot = selectedSnapshot ?? snapshots.find((snapshot) => snapshot.id === activeSnapshotId) ?? null;
  const canSetActive = !!selectedSnapshot && selectedSnapshot.state === "ready" && selectedSnapshot.id !== activeSnapshotId;
  const canEditOrDelete = !!selectedSnapshot && selectedSnapshot.state !== "ready";

  return (
    <Card>
      <CardHeader className="gap-1 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Route Details</CardTitle>
            <p className="text-sm font-medium">{route.routeNumber} - {route.routeName}</p>
            <p className="text-muted-foreground text-xs">Version: {displayedSnapshot?.name ?? "Unknown"}</p>
            {displayedSnapshot ? (
              <Badge className="mt-1 w-fit" variant={displayedSnapshot.state === "ready" ? "default" : "secondary"}>
                {normalizeSnapshotStateLabel(displayedSnapshot.state)}
              </Badge>
            ) : null}
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="Close route details" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="max-h-[75vh] space-y-3 overflow-y-auto">
        {userRole === "administrator_user" ? (
          <Button
            type="button"
            className={`w-full ${
              route.isPublic
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                : "border-amber-300 bg-amber-50 text-amber-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
            }`}
            variant="outline"
            disabled={isSnapshotActing}
            onClick={() => onTogglePublic(!route.isPublic)}
          >
            {route.isPublic ? "Unpublish" : "Publish"}
          </Button>
        ) : null}
        <Button
          type="button"
          className="w-full"
          variant="destructive"
          onClick={onDeleteRoute}
          disabled={isDeletingRoute}
        >
          {isDeletingRoute ? "Deleting Route..." : "Delete Route"}
        </Button>

        <Separator />

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Snapshots</p>
          <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
            {isSnapshotLoading ? (
              <p className="text-sm text-muted-foreground">Loading snapshots...</p>
            ) : snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No snapshots available.</p>
            ) : (
              snapshots.map((snapshot) => {
                const isSelected = snapshot.id === selectedSnapshotId;
                const isReadyActive = snapshot.id === activeSnapshotId && snapshot.state === "ready";

                return (
                  <button
                    key={snapshot.id}
                    type="button"
                    onClick={() => onSelectSnapshot(snapshot.id)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      isReadyActive
                        ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                        : isSelected
                          ? "border-primary bg-accent"
                          : "border-border hover:bg-accent"
                    }`}
                    disabled={isSnapshotActing}
                  >
                    <span className="truncate">{snapshot.name}</span>
                    <div className="flex items-center gap-1">
                      {isReadyActive ? (
                        <Badge className="border-emerald-600 text-emerald-700" variant="outline">
                          Active
                        </Badge>
                      ) : null}
                      <Badge variant={snapshot.state === "ready" ? "default" : "secondary"}>
                        {normalizeSnapshotStateLabel(snapshot.state)}
                      </Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Snapshot Actions</p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!canSetActive || isSnapshotActing}
            onClick={() => selectedSnapshot && onSetActiveSnapshot(selectedSnapshot.id)}
          >
            Set As Active
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!selectedSnapshot || isSnapshotActing}
            onClick={() => selectedSnapshot && onCloneSnapshot(selectedSnapshot.id)}
          >
            Clone Snapshot
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!canEditOrDelete || isSnapshotActing}
            onClick={() => selectedSnapshot && onEditSnapshot(selectedSnapshot.id)}
          >
            Edit Snapshot
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!canEditOrDelete || isSnapshotActing}
            onClick={() => selectedSnapshot && onDeleteSnapshot(selectedSnapshot.id)}
          >
            Delete Snapshot
          </Button>

          <Separator />

          <Button
            type="button"
            className="w-full"
            disabled={isSnapshotLoading || isSnapshotActing}
            onClick={onCreateBlankSnapshot}
          >
            Create New Snapshot
          </Button>
          {selectedSnapshot?.state === "ready" && selectedSnapshot.id !== activeSnapshotId ? (
            <p className="text-muted-foreground text-xs">
              Ready snapshots can be set as active.
            </p>
          ) : null}
          {selectedSnapshot?.state === "ready" && selectedSnapshot.id === activeSnapshotId ? (
            <p className="text-muted-foreground text-xs">
              This ready snapshot is currently active.
            </p>
          ) : null}
          {selectedSnapshot?.state !== "ready" ? (
            <p className="text-muted-foreground text-xs">
              Set as active is only available for ready snapshots.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
