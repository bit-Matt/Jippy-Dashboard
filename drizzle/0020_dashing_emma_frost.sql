ALTER TYPE "public"."route_snapshot_state" RENAME TO "snapshot_state";--> statement-breakpoint
ALTER TABLE "road_closure_regions" RENAME TO "road_closure_points";--> statement-breakpoint
ALTER TABLE "road_closure_points" DROP CONSTRAINT "road_closure_regions_road_closure_snapshot_id_road_closure_snapshot_id_fk";
--> statement-breakpoint
ALTER TABLE "region_snapshots" ADD COLUMN "version_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "road_closure_snapshot" ADD COLUMN "version_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "road_closure_snapshot" ADD COLUMN "shape" text NOT NULL;--> statement-breakpoint
ALTER TABLE "road_closure_points" ADD CONSTRAINT "road_closure_points_road_closure_snapshot_id_road_closure_snapshot_id_fk" FOREIGN KEY ("road_closure_snapshot_id") REFERENCES "public"."road_closure_snapshot"("id") ON DELETE cascade ON UPDATE no action;