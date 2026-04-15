-- Custom SQL migration file, put your code below! --
-- Custom SQL migration file, put your code below! --
INSERT INTO "vehicle_types" ("id", "name", "requires_route")
    VALUES ('00000000-0000-7000-8000-000000000001', 'Taxi', false)
    ON CONFLICT ("name") DO NOTHING;
