DROP TABLE "region_marker_sequences" CASCADE;--> statement-breakpoint
ALTER TABLE "region_markers" ADD COLUMN "polygon" geometry(Polygon) NOT NULL;--> statement-breakpoint
ALTER TABLE "region_snapshots" ADD COLUMN "polygon" geometry(Polygon) NOT NULL;