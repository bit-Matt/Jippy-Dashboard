CREATE TABLE "vehicle_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"requires_route" boolean DEFAULT true NOT NULL,
	"owner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "route_snapshots" ADD COLUMN "vehicle_type_id" text;--> statement-breakpoint
ALTER TABLE "vehicle_types" ADD CONSTRAINT "vehicle_types_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "vehicle_types" ("id", "name", "requires_route")
VALUES ('00000000-0000-7000-8000-000000000001', 'Modernized', true)
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
UPDATE "route_snapshots"
SET "vehicle_type_id" = '00000000-0000-7000-8000-000000000001'
WHERE "vehicle_type_id" IS NULL;--> statement-breakpoint
ALTER TABLE "route_snapshots" ALTER COLUMN "vehicle_type_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "route_snapshots" ALTER COLUMN "vehicle_type_id" SET DEFAULT '00000000-0000-7000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "route_snapshots" ADD CONSTRAINT "route_snapshots_vehicle_type_id_vehicle_types_id_fk" FOREIGN KEY ("vehicle_type_id") REFERENCES "public"."vehicle_types"("id") ON DELETE no action ON UPDATE no action;