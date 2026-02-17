"use client";

import { useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import MapComponent from "@/components/map-component";
import RouteEditor from "@/components/route-editor";
import Simulator from "@/components/simulator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default function DashboardClient() {
  const [showRouteEditor, setShowRouteEditor] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);

  const handleShowRoutes = () => {
    setShowRouteEditor(!showRouteEditor);
    setShowSimulator(false);
  };

  const handleShowSimulator = () => {
    setShowSimulator(!showSimulator);
    setShowRouteEditor(false);
  };

  return (
    <SidebarProvider>
      <AppSidebar
        onAddRouteClick={handleShowRoutes}
        onSimulationClick={handleShowSimulator}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">Jippy Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Route Editor</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="relative z-0 flex flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
          <MapComponent />
          {showSimulator && <Simulator />}
          {showRouteEditor && <RouteEditor />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
