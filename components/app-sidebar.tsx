import { type ComponentProps } from "react";
import { Command, Map, Pin, SquareDashed } from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AppSidebar({ onAddRouteClick, onAddRegionClick, onSimulationClick, routes, onRouteClick, ...props }: SidebarProps) {
  const data = {
    navMain: [
      {
        title: "Route Management",
        url: "#",
        icon: Map,
        isActive: true,
        items: [
          {
            title: "Add a new Route",
            url: "#",
            onClick: onAddRouteClick,
          },
          ...routes.map((route) => ({
            title: `${route.routeNumber} - ${route.routeName}`,
            url: "#",
            onClick: () => onRouteClick?.(route),
          })),
        ],
      },
      {
        title: "Region Management",
        url: "#",
        icon: SquareDashed,
        items: [
          {
            title: "Add a new Region",
            url: "#",
            onClick: onAddRegionClick,
          },
        ],
      },
      {
        title: "Simulation",
        url: "#",
        icon: Pin,
        onClick: onSimulationClick,
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
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

interface SidebarProps extends ComponentProps<typeof Sidebar> {
  onAddRouteClick?: () => void
  onAddRegionClick?: () => void
  onSimulationClick?: () => void
  routes: RouteSummary[]
  onRouteClick?: (route: RouteSummary) => void
}

export interface RouteSummary {
  id: string | number
  routeNumber: string
  routeName: string
  routeColor: string
  points: Array<{
    id: string | number
    sequence: number
    address: string
    point: [number, number]
  }>
}
