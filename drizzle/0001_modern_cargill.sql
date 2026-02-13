CREATE TABLE "routeSequences" (
	"id" text PRIMARY KEY NOT NULL,
	"route_id" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"point" geometry(point) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" text PRIMARY KEY NOT NULL,
	"route_number" text NOT NULL,
	"route_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routeSequences" ADD CONSTRAINT "routeSequences_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spatial_index" ON "routeSequences" USING gist ("point");--> statement-breakpoint
CREATE INDEX "route_seq_idx" ON "routeSequences" USING btree ("route_id","sequence_number");