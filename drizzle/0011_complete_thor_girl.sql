ALTER TABLE "routes_restricted_in_boarding_zone" RENAME COLUMN "stop_id" TO "restriction_zone_id";--> statement-breakpoint
ALTER TABLE "routes_restricted_in_boarding_zone" DROP CONSTRAINT "routes_restricted_in_boarding_zone_stop_id_restricted_boarding_zone_id_fk";
--> statement-breakpoint
DROP INDEX "stop_routes_ref_idx";--> statement-breakpoint
ALTER TABLE "routes_restricted_in_boarding_zone" ADD CONSTRAINT "routes_restricted_in_boarding_zone_restriction_zone_id_restricted_boarding_zone_id_fk" FOREIGN KEY ("restriction_zone_id") REFERENCES "public"."restricted_boarding_zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stop_routes_ref_idx" ON "routes_restricted_in_boarding_zone" USING btree ("restriction_zone_id");