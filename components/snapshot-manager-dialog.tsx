"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface SnapshotListItem {
  id: string;
  name: string;
  state: string;
  createdOn?: string | Date;
  updatedAt?: string | Date;
}

interface SnapshotManagerDialogProps {
  open: boolean;
  title: string;
  description: string;
  snapshots: SnapshotListItem[];
  selectedSnapshotId: string | null;
  isLoading?: boolean;
  isActing?: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSnapshot: (snapshotId: string) => void;
  onViewSnapshot: (snapshotId: string) => void;
  onEditSnapshot: (snapshotId: string) => void;
  onCloneSnapshot: (snapshotId: string) => void;
  onSwitchActiveSnapshot: (snapshotId: string) => void;
  onDeleteSnapshot?: (snapshotId: string) => void;
  onCreateBlankSnapshot?: () => void;
}

const normalizeStateLabel = (state: string) => {
  if (state === "wip") return "WIP";
  if (state === "for_approval") return "For Approval";
  if (state === "ready") return "Ready";
  return state;
};

export default function SnapshotManagerDialog({
  open,
  title,
  description,
  snapshots,
  selectedSnapshotId,
  isLoading = false,
  isActing = false,
  onOpenChange,
  onSelectSnapshot,
  onViewSnapshot,
  onEditSnapshot,
  onCloneSnapshot,
  onSwitchActiveSnapshot,
  onDeleteSnapshot,
  onCreateBlankSnapshot,
}: SnapshotManagerDialogProps) {
  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null,
    [snapshots, selectedSnapshotId],
  );

  const canSwitch = selectedSnapshot?.state === "ready";
  const canEdit = !!selectedSnapshot && selectedSnapshot.state !== "ready";
  const canClone = selectedSnapshot?.state === "ready";
  const canDelete = !!selectedSnapshot && selectedSnapshot.state !== "ready";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading snapshots...</p>
            ) : snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No snapshots available.</p>
            ) : (
              snapshots.map((snapshot) => {
                const isSelected = snapshot.id === selectedSnapshotId;

                return (
                  <button
                    key={snapshot.id}
                    type="button"
                    onClick={() => onSelectSnapshot(snapshot.id)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      isSelected ? "border-primary bg-accent" : "border-border hover:bg-accent"
                    }`}
                    disabled={isActing}
                  >
                    <span className="truncate">{snapshot.name}</span>
                    <Badge variant={snapshot.state === "ready" ? "default" : "secondary"}>
                      {normalizeStateLabel(snapshot.state)}
                    </Badge>
                  </button>
                );
              })
            )}
          </div>

          {selectedSnapshot ? (
            <p className="text-xs text-muted-foreground">
              Selected: {selectedSnapshot.name} ({normalizeStateLabel(selectedSnapshot.state)})
            </p>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!selectedSnapshot || isActing}
              onClick={() => selectedSnapshot && onViewSnapshot(selectedSnapshot.id)}
            >
              View
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canEdit || isActing}
              onClick={() => selectedSnapshot && onEditSnapshot(selectedSnapshot.id)}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canClone || isActing}
              onClick={() => selectedSnapshot && onCloneSnapshot(selectedSnapshot.id)}
            >
              Clone
            </Button>
            {onCreateBlankSnapshot ? (
              <Button
                type="button"
                variant="outline"
                disabled={isActing || isLoading}
                onClick={onCreateBlankSnapshot}
              >
                New Blank Snapshot
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={!canSwitch || isActing}
              onClick={() => selectedSnapshot && onSwitchActiveSnapshot(selectedSnapshot.id)}
            >
              Switch Active
            </Button>
            {onDeleteSnapshot ? (
              <Button
                type="button"
                variant="destructive"
                disabled={!canDelete || isActing}
                onClick={() => selectedSnapshot && onDeleteSnapshot(selectedSnapshot.id)}
              >
                Delete Snapshot
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
