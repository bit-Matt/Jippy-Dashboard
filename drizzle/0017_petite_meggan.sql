CREATE TYPE "public"."route_snapshot_state" AS ENUM('ready', 'wip', 'for_approval');--> statement-breakpoint
CREATE TABLE "region_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshotState" "route_snapshot_state" DEFAULT 'wip' NOT NULL,
	"region_id" text NOT NULL,
	"region_name" text NOT NULL,
	"color" text DEFAULT '#000000' NOT NULL,
	"shape" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "road_closure_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshotState" "route_snapshot_state" DEFAULT 'wip' NOT NULL,
	"road_closure_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshotState" "route_snapshot_state" DEFAULT 'wip' NOT NULL,
	"route_id" text NOT NULL,
	"version_name" text NOT NULL,
	"route_number" text NOT NULL,
	"route_name" text NOT NULL,
	"route_color" text DEFAULT '#FFF000' NOT NULL,
	"route_details" text DEFAULT '' NOT NULL,
	"polyline_going_to" text NOT NULL,
	"polyline_going_back" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "region_marker_sequences" DROP CONSTRAINT "region_marker_sequences_region_id_region_markers_id_fk";
--> statement-breakpoint
ALTER TABLE "region_stations" DROP CONSTRAINT "region_stations_region_id_region_markers_id_fk";
--> statement-breakpoint
ALTER TABLE "road_closure_regions" DROP CONSTRAINT "road_closure_regions_road_closure_id_road_closure_id_fk";
--> statement-breakpoint
ALTER TABLE "route_sequences" DROP CONSTRAINT "route_sequences_route_id_routes_id_fk";
--> statement-breakpoint
DROP INDEX "region_seq_idx";--> statement-breakpoint
DROP INDEX "region_station_ref_idx";--> statement-breakpoint
DROP INDEX "road_closure_region_ref_idx";--> statement-breakpoint
DROP INDEX "route_seq_idx";--> statement-breakpoint
ALTER TABLE "region_markers" ADD COLUMN "active_snapshot_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "region_marker_sequences" ADD COLUMN "region_snapshot_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "region_stations" ADD COLUMN "region_snapshot_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "road_closure_regions" ADD COLUMN "road_closure_snapshot_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "road_closure" ADD COLUMN "active_snapshot_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "route_sequences" ADD COLUMN "route_snapshot_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "active_snapshot_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "region_snapshots" ADD CONSTRAINT "region_snapshots_region_id_region_markers_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region_markers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_closure_snapshot" ADD CONSTRAINT "road_closure_snapshot_road_closure_id_road_closure_id_fk" FOREIGN KEY ("road_closure_id") REFERENCES "public"."road_closure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_snapshots" ADD CONSTRAINT "route_snapshots_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_marker_sequences" ADD CONSTRAINT "region_marker_sequences_region_snapshot_id_region_markers_id_fk" FOREIGN KEY ("region_snapshot_id") REFERENCES "public"."region_markers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_stations" ADD CONSTRAINT "region_stations_region_snapshot_id_region_markers_id_fk" FOREIGN KEY ("region_snapshot_id") REFERENCES "public"."region_markers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_closure_regions" ADD CONSTRAINT "road_closure_regions_road_closure_snapshot_id_road_closure_snapshot_id_fk" FOREIGN KEY ("road_closure_snapshot_id") REFERENCES "public"."road_closure_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_sequences" ADD CONSTRAINT "route_sequences_route_snapshot_id_route_snapshots_id_fk" FOREIGN KEY ("route_snapshot_id") REFERENCES "public"."route_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "region_seq_idx" ON "region_marker_sequences" USING btree ("region_snapshot_id","sequence_number");--> statement-breakpoint
CREATE INDEX "region_station_ref_idx" ON "region_stations" USING btree ("region_snapshot_id");--> statement-breakpoint
CREATE INDEX "road_closure_region_ref_idx" ON "road_closure_regions" USING btree ("road_closure_snapshot_id");--> statement-breakpoint
CREATE INDEX "route_seq_idx" ON "route_sequences" USING btree ("route_snapshot_id","sequence_number");--> statement-breakpoint
ALTER TABLE "region_markers" DROP COLUMN "region_name";--> statement-breakpoint
ALTER TABLE "region_markers" DROP COLUMN "color";--> statement-breakpoint
ALTER TABLE "region_markers" DROP COLUMN "shape";--> statement-breakpoint
ALTER TABLE "region_marker_sequences" DROP COLUMN "region_id";--> statement-breakpoint
ALTER TABLE "region_stations" DROP COLUMN "region_id";--> statement-breakpoint
ALTER TABLE "road_closure_regions" DROP COLUMN "road_closure_id";--> statement-breakpoint
ALTER TABLE "road_closure" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "road_closure" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "route_sequences" DROP COLUMN "route_id";--> statement-breakpoint
ALTER TABLE "routes" DROP COLUMN "route_number";--> statement-breakpoint
ALTER TABLE "routes" DROP COLUMN "route_name";--> statement-breakpoint
ALTER TABLE "routes" DROP COLUMN "route_color";--> statement-breakpoint
ALTER TABLE "routes" DROP COLUMN "route_details";--> statement-breakpoint
ALTER TABLE "routes" DROP COLUMN "polyline_going_to";--> statement-breakpoint
ALTER TABLE "routes" DROP COLUMN "polyline_going_back";