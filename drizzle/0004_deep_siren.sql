ALTER TABLE "routeSequences" DROP CONSTRAINT "routeSequences_route_id_routes_id_fk";
--> statement-breakpoint
ALTER TABLE "routeSequences" ADD CONSTRAINT "routeSequences_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;