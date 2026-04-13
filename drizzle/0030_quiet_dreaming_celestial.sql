ALTER TABLE "region_snapshots" DROP CONSTRAINT "region_snapshots_region_id_region_markers_id_fk";
--> statement-breakpoint
ALTER TABLE "region_markers" ADD COLUMN "region_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "region_markers" ADD COLUMN "color" text DEFAULT '#000000' NOT NULL;--> statement-breakpoint
ALTER TABLE "region_markers" ADD COLUMN "shape" text NOT NULL;--> statement-breakpoint
ALTER TABLE "region_markers" ADD COLUMN "is_public_viewable" boolean DEFAULT false NOT NULL;