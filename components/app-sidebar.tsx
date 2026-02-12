"use client";

import { type ComponentProps, useState } from "react"
import { Command, Map, Pin } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const data = {
  navMain: [
    {
      title: "Route Management",
      url: "#",
      icon: Map,
      isActive: true,
      items: [
        {
          title: "Editor",
          url: "#",
        },
        {
          title: "Simulator",
          url: "#",
        },
      ],
    },
    {
      title: "Routes",
      url: "#",
      icon: Pin,
      items: [
        {
          title: "Add a new Route",
          url: "#",
        },
      ],
    },
  ],
}

export function AppSidebar({ user, ...props }: SidebarProps) {
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
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}

interface SidebarProps extends ComponentProps<typeof Sidebar> {
  user: {
    initials: string;
    fullName: string;
    email: string;
  }
}
