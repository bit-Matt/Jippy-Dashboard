ALTER TABLE "region_marker_sequences" DROP CONSTRAINT "region_marker_sequences_region_snapshot_id_region_markers_id_fk";
--> statement-breakpoint
ALTER TABLE "region_stations" DROP CONSTRAINT "region_stations_region_snapshot_id_region_markers_id_fk";
--> statement-breakpoint

UPDATE "region_marker_sequences" AS seq
SET "region_snapshot_id" = marker."active_snapshot_id"
FROM "region_markers" AS marker
WHERE seq."region_snapshot_id" = marker."id";
--> statement-breakpoint

UPDATE "region_stations" AS station
SET "region_snapshot_id" = marker."active_snapshot_id"
FROM "region_markers" AS marker
WHERE station."region_snapshot_id" = marker."id";
--> statement-breakpoint

ALTER TABLE "region_marker_sequences" ADD CONSTRAINT "region_marker_sequences_region_snapshot_id_region_snapshots_id_fk" FOREIGN KEY ("region_snapshot_id") REFERENCES "public"."region_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_stations" ADD CONSTRAINT "region_stations_region_snapshot_id_region_snapshots_id_fk" FOREIGN KEY ("region_snapshot_id") REFERENCES "public"."region_snapshots"("id") ON DELETE cascade ON UPDATE no action;