"use client";

import { X } from "lucide-react";
import { format } from "date-fns";

import type { ClosureResponse } from "@/contracts/responses";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

interface ClosureItemSidebarProps {
  closure: ClosureResponse;
  userRole: string | null;
  isPublishing: boolean;
  isDeletingClosure: boolean;
  onClose: () => void;
  onEditClosure: () => void;
  onDeleteClosure: () => void;
  onTogglePublic: (isPublic: boolean) => void;
}

export default function ClosureItemSidebar({
  closure,
  userRole,
  isPublishing,
  isDeletingClosure,
  onClose,
  onEditClosure,
  onDeleteClosure,
  onTogglePublic,
}: ClosureItemSidebarProps) {
  const isAdministrator = userRole === "administrator_user";

  return (
    <Card>
      <CardHeader className="gap-1 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Closure Details</CardTitle>
            <p className="text-sm font-medium">{closure.closureName?.trim() || "(untitled)"}</p>
            <Badge
              className={`mt-1 w-fit ${
                closure.isPublic
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-amber-300 bg-amber-50 text-amber-700"
              }`}
              variant="outline"
            >
              {closure.isPublic ? "Published" : "Draft"}
            </Badge>
            {closure.closureType === "indefinite" ? (
              <Badge className="mt-1 w-fit border-slate-300 bg-slate-50 text-slate-700" variant="outline">
                Indefinite
              </Badge>
            ) : (
              <Badge className="mt-1 w-fit border-sky-300 bg-sky-50 text-sky-700" variant="outline">
                {closure.endDate ? `Until ${format(new Date(closure.endDate), "MMM d, yyyy")}` : "Scheduled"}
              </Badge>
            )}
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="Close closure details" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="max-h-[75vh] space-y-3 overflow-y-auto">
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Public Visibility</p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium ${
                  closure.isPublic ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {closure.isPublic ? "Published" : "Unpublished"}
              </p>
              <p className="text-muted-foreground text-xs">
                {closure.isPublic
                  ? "Visible in public-facing map data."
                  : "Only visible in management tools."}
              </p>
            </div>
            {isAdministrator ? (
              <Switch
                checked={closure.isPublic}
                disabled={isPublishing}
                onCheckedChange={onTogglePublic}
                aria-label="Toggle closure visibility"
              />
            ) : null}
          </div>
          {!isAdministrator ? (
            <p className="text-muted-foreground text-xs">Only administrators can change visibility.</p>
          ) : null}
        </div>

        {closure.closureType === "scheduled" && closure.endDate && (
          <div className="space-y-1 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Scheduled End Date</p>
            <p className="text-sm font-medium">{format(new Date(closure.endDate), "PPP")}</p>
          </div>
        )}

        <Separator />

        <Button
          type="button"
          className="w-full"
          variant="outline"
          onClick={onEditClosure}
          disabled={isPublishing || isDeletingClosure}
        >
          Edit Closure
        </Button>

        <Button
          type="button"
          className="w-full"
          variant="destructive"
          onClick={onDeleteClosure}
          disabled={isDeletingClosure || isPublishing}
        >
          {isDeletingClosure ? "Deleting Closure..." : "Delete Closure"}
        </Button>
      </CardContent>
    </Card>
  );
}
