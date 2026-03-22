ALTER TABLE "regionMarkers" RENAME TO "region_markers";--> statement-breakpoint
ALTER TABLE "regionMarkerSequences" RENAME TO "region_marker_sequences";--> statement-breakpoint
ALTER TABLE "regionStations" RENAME TO "region_stations";--> statement-breakpoint
ALTER TABLE "routeSequences" RENAME TO "route_sequences";--> statement-breakpoint
ALTER TABLE "region_marker_sequences" DROP CONSTRAINT "regionMarkerSequences_region_id_regionMarkers_id_fk";
--> statement-breakpoint
ALTER TABLE "region_stations" DROP CONSTRAINT "regionStations_region_id_regionMarkers_id_fk";
--> statement-breakpoint
ALTER TABLE "route_sequences" DROP CONSTRAINT "routeSequences_route_id_routes_id_fk";
--> statement-breakpoint
ALTER TABLE "region_marker_sequences" ADD CONSTRAINT "region_marker_sequences_region_id_region_markers_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region_markers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_stations" ADD CONSTRAINT "region_stations_region_id_region_markers_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region_markers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_sequences" ADD CONSTRAINT "route_sequences_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;