"use client";

import { type ComponentProps } from "react";
import { Command, Map, Navigation, ShieldCheck, SquareDashed, TrafficCone } from "lucide-react";
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

  const navMain = [
    {
      title: "Route Management",
      url: "/dashboard/route",
      icon: Map,
      isActive: true,
    },
    {
      title: "Closure Management",
      url: "/dashboard/closure",
      icon: Map,
      isActive: true,
    },
    {
      title: "Region Management",
      url: "/dashboard/region",
      isActive: true,
      icon: SquareDashed,
    },
    {
      title: "Stop Management",
      url: "/dashboard/stops",
      isActive: true,
      icon: TrafficCone,
    },
    {
      title: "Simulator",
      url: "/dashboard/simulator",
      isActive: true,
      icon: Navigation,
    },
  ];

  const navData = {
    navMain,

    administration: [
      {
        title: "Administration",
        url: "#",
        icon: ShieldCheck,
        isActive: true,
        items: [
          {
            title: "Invitations",
            url: "/dashboard/invitations",
          },
          {
            title: "Accounts",
            url: "/dashboard/accounts",
          },
          {
            title: "Audits",
            url: "/dashboard/logs",
          },
          {
            title: "Vehicle Types",
            url: "/dashboard/vehicle",
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
        <NavMain label="Editors" items={navData.navMain} />
        {currentUser?.role === "administrator_user" ? (
          <>
            <div className="grow" />
            <NavMain label="Administrator" items={navData.administration} />
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
