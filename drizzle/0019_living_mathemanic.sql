ALTER TABLE "region_markers" ALTER COLUMN "active_snapshot_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "road_closure" ALTER COLUMN "active_snapshot_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "active_snapshot_id" SET NOT NULL;