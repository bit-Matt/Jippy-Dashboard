CREATE TABLE "route_snapshot_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"stored_filename" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"uploaded_by" text
);
--> statement-breakpoint
ALTER TABLE "route_snapshot_images" ADD CONSTRAINT "route_snapshot_images_snapshot_id_route_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."route_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_snapshot_images" ADD CONSTRAINT "route_snapshot_images_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "route_snapshot_images_snapshot_idx" ON "route_snapshot_images" USING btree ("snapshot_id");