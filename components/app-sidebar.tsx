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
  SidebarRail,
  SidebarTrigger,
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

    feedbackAndReporting: [
      {
        title: "Feedback & Reporting",
        url: "#",
        icon: Command,
        isActive: true,
        items: [
          {
            title: "Reports",
            url: "/dashboard/feedback",
          },
        ],
      },
    ],

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
          {
            title: "Data Management",
            url: "/dashboard/data",
          },
          {
            title: "Algorithm Weights",
            url: "/dashboard/algorithm",
          },
        ],
      },
    ],
  };

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex w-full items-center gap-1 group-data-[collapsible=icon]:flex-col">
              <SidebarMenuButton size="lg" asChild className="min-w-0 flex-1" tooltip="Jippy Dashboard">
                <a href="#">
                  <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                    <Command className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">Jippy Dashboard</span>
                    <span className="truncate text-xs">
                      v1 — <a href="https://www.youtube.com/watch?v=GoMn41bFqVA" target="_blank">Just When I Needed You Most</a>
                    </span>
                  </div>
                </a>
              </SidebarMenuButton>
              <SidebarTrigger className="shrink-0" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain label="Editors" items={navData.navMain} />
        <div className="grow" />
        <NavMain label="Tools" items={[
          ...navData.feedbackAndReporting,
          ...(currentUser?.role === "administrator_user" ? navData.administration : []),
        ]} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={currentUser}
          isLoading={isLoading}
          hasError={Boolean(error || meResponse?.error)}
        />
      </SidebarFooter>
      <SidebarRail />
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
