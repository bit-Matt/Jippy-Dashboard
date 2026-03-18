CREATE TABLE "road_closure_regions" (
	"id" text PRIMARY KEY NOT NULL,
	"road_closure_id" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"point" geometry(point) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "road_closure" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "road_closure_regions" ADD CONSTRAINT "road_closure_regions_road_closure_id_road_closure_id_fk" FOREIGN KEY ("road_closure_id") REFERENCES "public"."road_closure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spatial_index_road_closure_region" ON "road_closure_regions" USING gist ("point");--> statement-breakpoint
CREATE INDEX "road_closure_region_ref_idx" ON "road_closure_regions" USING btree ("road_closure_id");