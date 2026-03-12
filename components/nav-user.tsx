"use client";

import { ChevronsUpDown, Ellipsis, LogOut } from "lucide-react";
import { redirect, RedirectType } from "next/navigation";
import { useMemo } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export function NavUser() {
  const { isMobile } = useSidebar();

  const { data, error, isLoading } = useSWR<BetterFetchMeResult>("/api/me", $fetch);

  const userAbbreviation = useMemo(() => {
    if (!data || data.error) return "";

    const split = data.data.data.fullName.split(/\s/);

    // Impossible, but it's there.
    if (split.length === 0) return "?";

    // For people who only provided their name
    if (split.length === 1) return split[0][0].toUpperCase();

    const first = split[0];
    const last = split[split.length - 1];

    return `${first[0]}${last[0]}`.toUpperCase();
  }, [data]);

  // Loading state
  if (isLoading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarFallback className="rounded-lg">
                <Ellipsis />
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <Skeleton className="w-full" />
              <Skeleton className="w-full" />
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  // Don't render if it failed.
  if (error || data?.error) {
    console.error(error);

    return (<></>);
  }

  const logoutButton = () => {
    redirect("/signout", RedirectType.replace);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{userAbbreviation}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{data!.data.data.fullName}</span>
                <span className="truncate text-xs">{data!.data.data.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{userAbbreviation}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{data!.data.data.fullName}</span>
                  <span className="truncate text-xs">{data!.data.data.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logoutButton}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

type BetterFetchMeResult = {
  data: {
    ok: boolean;
    data: {
      fullName: string;
      email: string;
    }
  },
  error: unknown;
};
