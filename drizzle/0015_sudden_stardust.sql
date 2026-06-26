ALTER TABLE "region_markers" RENAME TO "region";--> statement-breakpoint
ALTER TABLE "region" DROP CONSTRAINT "region_markers_owner_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "region" ADD CONSTRAINT "region_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;