import * as L from "leaflet";

declare module "leaflet" {
  namespace Routing {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function mapzen(apiKey: string, options?: any): L.Routing.IRouter;

    class mapzenFormatter extends L.Routing.Formatter {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(options?: any);
    }
  }
}
