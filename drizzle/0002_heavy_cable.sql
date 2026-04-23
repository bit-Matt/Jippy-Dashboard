-- Custom SQL migration file, put your code below! --
INSERT INTO "vehicle_types" ("id", "name", "requires_route")
    VALUES ('00000000-0000-7000-8000-000000000001', 'Modernized', true)
    ON CONFLICT ("name") DO NOTHING;
UPDATE "routes"
    SET "vehicle_type_id" = '00000000-0000-7000-8000-000000000001'
    WHERE "vehicle_type_id" IS NULL;
UPDATE "route_snapshots"
    SET "vehicle_type_id" = '00000000-0000-7000-8000-000000000001'
    WHERE "vehicle_type_id" IS NULL;
