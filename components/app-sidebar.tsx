import { type ComponentProps } from "react";
import { Command, Map, Pin } from "lucide-react";

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

export function AppSidebar({ onAddRouteClick, onSimulationClick, ...props }: SidebarProps) {
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
  onSimulationClick?: () => void
}
