"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import useSWR from "swr";
import { z } from "zod";

import { AppSidebar } from "@/components/app-sidebar";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { $fetch } from "@/lib/http/client";

const vehicleSchema = z.object({
  name: z.string().trim().min(1, "Vehicle type name is required."),
  requiresRoute: z.boolean(),
});

type VehicleTypeItem = {
  id: string;
  name: string;
  requiresRoute: boolean;
};

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

export default function VehicleTypesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createRequiresRoute, setCreateRequiresRoute] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRequiresRoute, setEditRequiresRoute] = useState(true);

  const { data: meResponse } = useSWR<MeResponse>("/api/me", $fetch);
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<VehicleTypeItem[]>>(
    "/api/restricted/management/vehicle",
    $fetch,
  );

  const vehicles = useMemo(() => data?.data?.data ?? [], [data]);
  const isAdmin = meResponse?.data?.data?.role === "administrator_user";

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = vehicleSchema.safeParse({
      name: createName,
      requiresRoute: createRequiresRoute,
    });

    if (!parsed.success) {
      alert(parsed.error.issues.map((i) => i.message).join("\n"));
      return;
    }

    setIsSaving(true);
    const { error: createError } = await $fetch("/api/restricted/management/vehicle", {
      method: "POST",
      body: {
        name: parsed.data.name,
        requiresRoute: parsed.data.requiresRoute,
      },
    });

    if (createError) {
      alert("Failed to create vehicle type.");
      setIsSaving(false);
      return;
    }

    setCreateName("");
    setCreateRequiresRoute(true);
    setIsCreateOpen(false);
    setIsSaving(false);
    await mutate();
  };

  const openEditDialog = (vehicle: VehicleTypeItem) => {
    setEditId(vehicle.id);
    setEditName(vehicle.name);
    setEditRequiresRoute(vehicle.requiresRoute);
    setIsEditOpen(true);
  };

  const handleEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editId) {
      return;
    }

    const parsed = vehicleSchema.safeParse({
      name: editName,
      requiresRoute: editRequiresRoute,
    });

    if (!parsed.success) {
      alert(parsed.error.issues.map((i) => i.message).join("\n"));
      return;
    }

    setIsSaving(true);
    const { error: editError } = await $fetch(`/api/restricted/management/vehicle/${editId}`, {
      method: "PATCH",
      body: {
        name: parsed.data.name,
        requiresRoute: parsed.data.requiresRoute,
      },
    });

    if (editError) {
      alert("Failed to update vehicle type.");
      setIsSaving(false);
      return;
    }

    setIsEditOpen(false);
    setIsSaving(false);
    await mutate();
  };

  const handleDelete = async (vehicleId: string) => {
    const shouldDelete = window.confirm("Delete this vehicle type?");
    if (!shouldDelete) {
      return;
    }

    const { error: deleteError } = await $fetch(`/api/restricted/management/vehicle/${vehicleId}`, {
      method: "DELETE",
    });

    if (deleteError) {
      alert("Failed to delete vehicle type. It may still be in use.");
      return;
    }

    await mutate();
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="rounded-xl border bg-card p-4 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Vehicle Types</h1>
              <p className="text-sm text-muted-foreground">Manage route vehicle classifications and freeform/route-required behavior.</p>
            </div>

            {isAdmin ? (
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Vehicle Type
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Vehicle Type</DialogTitle>
                    <DialogDescription>Create a new vehicle classification for route snapshots.</DialogDescription>
                  </DialogHeader>

                  <form onSubmit={handleCreate} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="vehicle-name">Name</Label>
                      <Input
                        id="vehicle-name"
                        value={createName}
                        onChange={(event) => setCreateName(event.target.value)}
                        placeholder="e.g., Modernized"
                        required
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">Requires Route</p>
                        <p className="text-xs text-muted-foreground">Turn off for freeform vehicle classifications.</p>
                      </div>
                      <Switch checked={createRequiresRoute} onCheckedChange={setCreateRequiresRoute} />
                    </div>

                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button type="submit" disabled={isSaving}>Save</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>

          {!isAdmin ? <p className="text-sm text-destructive">Administrator access is required for this page.</p> : null}
          {isLoading ? <p className="text-sm text-muted-foreground">Loading vehicle types...</p> : null}
          {error ? <p className="text-sm text-destructive">Failed to load vehicle types.</p> : null}

          {isAdmin && !isLoading && !error ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No vehicle types found.
                    </TableCell>
                  </TableRow>
                ) : vehicles.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell>{vehicle.name}</TableCell>
                    <TableCell>{vehicle.requiresRoute ? "Requires Route" : "Freeform"}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(vehicle)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(vehicle.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </div>
      </SidebarInset>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Vehicle Type</DialogTitle>
            <DialogDescription>Update name and classification behavior.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-vehicle-name">Name</Label>
              <Input
                id="edit-vehicle-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                required
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Requires Route</p>
                <p className="text-xs text-muted-foreground">Turn off for freeform vehicle classifications.</p>
              </div>
              <Switch checked={editRequiresRoute} onCheckedChange={setEditRequiresRoute} />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isSaving}>Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
