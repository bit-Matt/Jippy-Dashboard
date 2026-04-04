"use client";

import { type ComponentProps } from "react";
import { Command, Map, ShieldCheck, SquareDashed } from "lucide-react";
import useSWR from "swr";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { $fetch } from "@/lib/http/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AppSidebar({
  ...props
}: SidebarProps) {
  const { data: meResponse, error, isLoading } = useSWR<BetterFetchMeResult>("/api/me", $fetch);
  const currentUser = meResponse?.data?.data;

  const navData = {
    navMain: [
      {
        title: "Route Management",
        url: "/dashboard/route",
        icon: Map,
        isActive: true,
      },
      {
        title: "Region Management",
        url: "/dashboard/region",
        isActive: true,
        icon: SquareDashed,
      },
    ],

    administration: [
      {
        title: "User Management",
        url: "#",
        icon: ShieldCheck,
        isActive: true,
        items: [
          {
            title: "User Invitations",
            url: "/dashboard/invitations",
          },
        ],
      },
    ],
  };

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Command className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Jippy Dashboard</span>
                  <span className="truncate text-xs">v0.0.1-alpha</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navData.navMain} />
        {currentUser?.role === "administrator_user" ? (
          <>
            <div className="grow" />
            <NavMain items={navData.administration} />
          </>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={currentUser}
          isLoading={isLoading}
          hasError={Boolean(error || meResponse?.error)}
        />
      </SidebarFooter>
    </Sidebar>
  );
}

type SidebarProps = ComponentProps<typeof Sidebar>;

type BetterFetchMeResult = {
  data: {
    ok: boolean;
    data: {
      fullName: string;
      email: string;
      role: string;
    }
  },
  error: unknown;
};

export interface AllResponse {
  routes: Array<{
    id: string
    activeSnapshotId: string
    snapshotName: string
    snapshotState: string
    routeNumber: string
    routeName: string
    routeColor: string
    routeDetails: string
    points: {
      polylineGoingTo: string;
      goingTo: Array<{
        id: string | number
        sequence: number
        address: string
        point: [number, number]
      }>;
      polylineGoingBack: string;
      goingBack: Array<{
        id: string | number
        sequence: number
        address: string
        point: [number, number]
      }>;
    }
  }>;
  regions: Array<{
    id: string;
    activeSnapshotId: string;
    snapshotName: string;
    snapshotState: string;
    regionName: string;
    regionColor: string;
    regionShape: string;
    points: Array<{
      id: string;
      sequence: number;
      point: [number, number]
    }>;
    stations: Array<{
      id: string;
      address: string;
      point: [number, number];
    }>;
  }>;
  closures: Array<{
    id: string;
    activeSnapshotId: string;
    versionName: string;
    snapshotState: string;
    closureName: string;
    closureDescription: string;
    shape: string;
    points: Array<{
      id: string;
      sequence: number;
      point: [number, number];
    }>;
  }>;
}
