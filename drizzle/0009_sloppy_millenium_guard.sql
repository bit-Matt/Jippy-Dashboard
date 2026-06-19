ALTER TABLE "stop_points" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stop_vehicle_types" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "stop_points" CASCADE;--> statement-breakpoint
DROP TABLE "stop_vehicle_types" CASCADE;--> statement-breakpoint
ALTER TABLE "stops" RENAME TO "restricted_boarding_zone";--> statement-breakpoint
ALTER TABLE "stop_routes" RENAME TO "routes_restricted_in_boarding_zone";--> statement-breakpoint
ALTER TABLE "routes_restricted_in_boarding_zone" DROP CONSTRAINT "stop_routes_stop_id_stops_id_fk";
--> statement-breakpoint
ALTER TABLE "routes_restricted_in_boarding_zone" DROP CONSTRAINT "stop_routes_route_id_routes_id_fk";
--> statement-breakpoint
ALTER TABLE "restricted_boarding_zone" DROP CONSTRAINT "stops_owner_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "restricted_boarding_zone" ADD COLUMN "points" geometry(LineString,4326);--> statement-breakpoint
ALTER TABLE "routes_restricted_in_boarding_zone" ADD CONSTRAINT "routes_restricted_in_boarding_zone_stop_id_restricted_boarding_zone_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."restricted_boarding_zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes_restricted_in_boarding_zone" ADD CONSTRAINT "routes_restricted_in_boarding_zone_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restricted_boarding_zone" ADD CONSTRAINT "restricted_boarding_zone_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;