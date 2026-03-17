import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, boolean, index, integer, geometry } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

export const roles = pgEnum("role", ["administrator_user", "regular_user"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: roles().default("regular_user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const routes = pgTable(
  "routes",
  {
    id: text("id")
      .primaryKey()
      .$default(() => uuidv7()),
    routeNumber: text("route_number").notNull(),
    routeName: text("route_name").notNull(),
    routeColor: text("route_color").notNull().default("#FFF000"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    polylineGoingTo: text("polyline_going_to")
      .default("")
      .notNull(),
    polylineGoingBack: text("polyline_going_back")
      .default("")
      .notNull(),
  },
);

export const sequenceType = pgEnum("route_sequence_type", ["going_to", "going_back"]);

export const routeSequences = pgTable(
  "routeSequences",
  {
    id: text("id")
      .primaryKey()
      .$default(() => uuidv7()),
    routeId: text("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    sequenceType: sequenceType("sequence_type")
      .default("going_to")
      .notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    address: text("address")
      .default("Unknown Address")
      .notNull(),
    point: geometry("point", { type: "point", mode: "tuple", srid: 4326 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("spatial_index").using("gist", t.point),
    index("route_seq_idx").on(t.routeId, t.sequenceNumber),
  ],
);

export const region = pgTable(
  "regionMarkers",
  {
    id: text("id")
      .primaryKey()
      .$default(() => uuidv7()),
    name: text("region_name")
      .notNull(),
    color: text("color")
      .default("#000000")
      .notNull(),
    shapeType: text("shape")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

export const regionSequences = pgTable(
  "regionMarkerSequences",
  {
    id: text("id")
      .primaryKey()
      .$default(() => uuidv7()),
    regionId: text("region_id")
      .notNull()
      .references(() => region.id, { onDelete: "cascade" }),
    sequenceNumber: integer("sequence_number").notNull(),
    point: geometry("point", { type: "point", mode: "tuple", srid: 4326 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("spatial_index_region").using("gist", t.point),
    index("region_seq_idx").on(t.regionId, t.sequenceNumber),
  ],
);

export const regionStations = pgTable(
  "regionStations",
  {
    id: text("id")
      .primaryKey()
      .$default(() => uuidv7()),
    regionId: text("region_id")
      .notNull()
      .references(() => region.id, { onDelete: "cascade" }),
    address: text("address")
      .notNull()
      .default("Unknown"),
    point: geometry("point", { type: "point", mode: "tuple", srid: 4326 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("spatial_index_region_station").using("gist", t.point),
    index("region_station_ref_idx").on(t.regionId),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const closureDirection = pgEnum("closure_direction", ["one_way", "both"]);

export const roadClosures = pgTable(
  "roadClosures",
  {
    id: text("id")
      .primaryKey()
      .$default(() => uuidv7()),
    label: text("label"),
    color: text("color").default("#ef4444").notNull(),
    type: text("type").notNull(), // "line" | "region"
    direction: closureDirection("direction"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

export const roadClosureSequences = pgTable(
  "roadClosureSequences",
  {
    id: text("id")
      .primaryKey()
      .$default(() => uuidv7()),
    closureId: text("closure_id")
      .notNull()
      .references(() => roadClosures.id, { onDelete: "cascade" }),
    sequenceNumber: integer("sequence_number").notNull(),
    address: text("address"),
    point: geometry("point", { type: "point", mode: "tuple", srid: 4326 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("spatial_index_road_closure").using("gist", t.point),
    index("road_closure_seq_idx").on(t.closureId, t.sequenceNumber),
  ],
);

export const roadClosureRelations = relations(roadClosureSequences, ({ one }) => ({
  closure: one(roadClosures, {
    fields: [roadClosureSequences.closureId],
    references: [roadClosures.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const routeRelations = relations(routeSequences, ({ one }) => ({
  route: one(routes, {
    fields: [routeSequences.routeId],
    references: [routes.id],
  }),
}));

export const regionRelations = relations(regionSequences, ({ one }) => ({
  region: one(region, {
    fields: [regionSequences.regionId],
    references: [region.id],
  }),
}));

export const regionStationRelations = relations(regionStations, ({ one }) => ({
  region: one(region, {
    fields: [regionStations.regionId],
    references: [region.id],
  }),
}));
