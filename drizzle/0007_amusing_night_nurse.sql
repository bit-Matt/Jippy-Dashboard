CREATE TABLE "regionStations" (
	"id" text PRIMARY KEY NOT NULL,
	"region_id" text NOT NULL,
	"point" geometry(point) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regionStations" ADD CONSTRAINT "regionStations_region_id_regionMarkers_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regionMarkers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spatial_index_region_station" ON "regionStations" USING gist ("point");--> statement-breakpoint
CREATE INDEX "region_station_ref_idx" ON "regionStations" USING btree ("region_id");