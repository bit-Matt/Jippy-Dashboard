import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import MapComponent from "@/components/map-component";
import { Separator } from "@/components/ui/separator";
import RouteEditor from "@/components/route-editor";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export default async function Page() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  // Invalid session.
  if (!session) redirect("/");

  return (
    <SidebarProvider>
      <AppSidebar
        user={{
          initials: session.user.name.split(" ").map(n => n[0]).join(""),
          fullName: session.user.name,
          email: session.user.email,
        }}
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
                  <BreadcrumbLink href="#">
                    Jippy Dashboard
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Route Editor</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 z-0 overflow-hidden relative">
          <MapComponent
            routing={[
              {
                color: '#000',
                waypoints: [
                  [
                    10.746199004367853,
                    122.53897981730051
                  ],
                  [
                    10.744848024184208,
                    122.5393931135651
                  ],
                  [
                    10.727428434741867,
                    122.55557833623556
                  ],
                  [
                    10.723979,
                    122.55688199999997
                  ],
                  [
                    10.717757330343986,
                    122.56130990310805
                  ],
                  [
                    10.712442873934307,
                    122.56463631994984
                  ],
                  [
                    10.703899000000007,
                    122.56793700000003
                  ],
                  [
                    10.696489999999997,
                    122.569119
                  ],
                  [
                    10.693804180997091,
                    122.57108398427357
                  ],
                  [
                    10.68974160553688,
                    122.57659641078584
                  ],
                  [
                    10.690619051999832,
                    122.58235014867734
                  ],
                  [
                    10.692258069890329,
                    122.58298879518975
                  ],
                  [
                    10.689369409836914,
                    122.57767560249624
                  ],
                  [
                    10.692174746944929,
                    122.57450201127614
                  ],
                  [
                    10.693873205874368,
                    122.57117038409353
                  ],
                  [
                    10.700772087269002,
                    122.56915398996654
                  ],
                  [
                    10.702807280852596,
                    122.56814357486371
                  ],
                  [
                    10.70753707889213,
                    122.56717168352475
                  ],
                  [
                    10.709818453950987,
                    122.56647019517874
                  ],
                  [
                    10.713889801509794,
                    122.56388145688464
                  ],
                  [
                    10.721695436388302,
                    122.55875394729469
                  ],
                  [
                    10.724372021859622,
                    122.55804289069891
                  ],
                  [
                    10.726611121624046,
                    122.55797340323164
                  ],
                  [
                    10.728302302213308,
                    122.55635658888156
                  ],
                  [
                    10.732419171571905,
                    122.55026175699055
                  ],
                  [
                    10.73863611748898,
                    122.54316957677383
                  ],
                  [
                    10.742062503174594,
                    122.53964330619294
                  ],
                  [
                    10.746017407120704,
                    122.5394726312984
                  ]
                ]
              }
            ]}
          />
          <RouteEditor />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
