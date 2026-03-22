import { type ComponentProps } from "react";
import { Command, Map, SquareDashed, TriangleAlert } from "lucide-react";

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

export function AppSidebar({
  onAddRouteClick,
  onAddRegionClick,
  onAddClosureRegionClick,
  ...props
}: SidebarProps) {
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
        ],
      },
      {
        title: "Region Management",
        url: "#",
        isActive: true,
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
        title: "Road Closure",
        url: "#",
        isActive: true,
        icon: TriangleAlert,
        items: [
          {
            title: "Add closure",
            url: "#",
            onClick: onAddClosureRegionClick,
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
  onAddClosureRegionClick?: () => void
}

export interface AllResponse {
  routes: Array<{
    id: string
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
    closureName: string;
    closureDescription: string;
    points: Array<{
      id: string;
      sequence: number;
      point: [number, number];
    }>;
  }>;
}
