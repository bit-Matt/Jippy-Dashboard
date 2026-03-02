CREATE TABLE "regionMarkers" (
	"id" text PRIMARY KEY NOT NULL,
	"region_name" text NOT NULL,
	"shape" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regionMarkerSequences" (
	"id" text PRIMARY KEY NOT NULL,
	"region_id" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"point" geometry(point) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regionMarkerSequences" ADD CONSTRAINT "regionMarkerSequences_region_id_regionMarkers_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regionMarkers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spatial_index_region" ON "regionMarkerSequences" USING gist ("point");--> statement-breakpoint
CREATE INDEX "region_seq_idx" ON "regionMarkerSequences" USING btree ("region_id","sequence_number");