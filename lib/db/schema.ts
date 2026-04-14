import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, boolean, index, integer, geometry, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

// TODO: Update enums as strings instead. We need to remove this stuff.
export const roles = pgEnum("role", ["administrator_user", "regular_user"]);
export const snapshotState = pgEnum("snapshot_state", ["ready", "wip", "for_approval"]);
export const sequenceType = pgEnum("route_sequence_type", ["going_to", "going_back"]);

// ============================================================================
// BETTER AUTH RELEATED STUFF
// DO NOT TOUCH UNLESS YOU KNOW WHAT YOU ARE DOING!
// ============================================================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: roles().default("regular_user").notNull(),
  banned: boolean("banned").default(false).notNull(),
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

// ============================================================================
// JIPPY MAIN SCHEMA
// ============================================================================

export const invitations = pgTable("invitations", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  email: text("email").notNull().unique(),
  validUntil: timestamp("valid_until").notNull(),
  consumed: boolean("consumed").default(false).notNull(),
  token: text("token").notNull().unique(),
  role: roles().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  ownerId: text("owner_id")
    .references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const vehicleTypes = pgTable("vehicle_types", {
  id: uuid("id")
    .primaryKey()
    .$default(() => uuidv7()),

  name: text("name")
    .notNull()
    .unique(),
  requiresRoute: boolean("requires_route")
    .default(true)
    .notNull(),

  ownerId: text("owner_id")
    .references(() => user.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const routes = pgTable(
  "routes",
  {
    id: uuid("id")
      .primaryKey()
      .$default(() => uuidv7()),

    // Projected
    vehicleTypeId: uuid("vehicle_type_id")
      .notNull()
      .references(() => vehicleTypes.id),
    routeNumber: text("route_number")
      .notNull(),
    routeName: text("route_name")
      .notNull(),
    routeColor: text("route_color")
      .notNull()
      .default("#FFF000"),
    routeDetails: text("route_details")
      .default("")
      .notNull(),
    availableFrom: text("available_from")
      .notNull()
      .default("00:00"),
    availableTo: text("available_to")
      .notNull()
      .default("23:59"),
    polylineGoingTo: text("polyline_going_to")
      .notNull(),
    polylineGoingBack: text("polyline_going_back")
      .notNull(),

    // Metadata
    isPublic: boolean("is_public_viewable").default(false).notNull(),
    activeSnapshotId: uuid("active_snapshot_id")
      .notNull(),
    ownerId: text("owner_id")
      .references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

export const routeSnapshots = pgTable(
  "route_snapshots",
  {
    id: uuid("id")
      .primaryKey()
      .$default(() => uuidv7()),

    // Route details
    vehicleTypeId: uuid("vehicle_type_id")
      .notNull()
      .references(() => vehicleTypes.id),
    routeNumber: text("route_number")
      .notNull(),
    routeName: text("route_name")
      .notNull(),
    routeColor: text("route_color")
      .notNull()
      .default("#FFF000"),
    routeDetails: text("route_details")
      .default("")
      .notNull(),
    availableFrom: text("available_from")
      .notNull()
      .default("00:00"),
    availableTo: text("available_to")
      .notNull()
      .default("23:59"),
    polylineGoingTo: text("polyline_going_to")
      .notNull(),
    polylineGoingBack: text("polyline_going_back")
      .notNull(),

    // Metadata
    snapshotState: snapshotState()
      .notNull()
      .default("wip"),
    routeId: text("route_id").notNull(),
    ownerId: text("owner_id")
      .references(() => user.id, { onDelete: "set null" }),
    versionName: text("version_name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

export const routeSequences = pgTable(
  "route_sequences",
  {
    id: uuid("id")
      .primaryKey()
      .$default(() => uuidv7()),

    // Sequence where this route belongs to
    routeSnapshotId: uuid("route_snapshot_id")
      .notNull()
      .references(() => routeSnapshots.id, { onDelete: "cascade" }),

    // Sequence info
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
    index("route_seq_idx").on(t.routeSnapshotId, t.sequenceNumber),
  ],
);

export const region = pgTable(
  "region_markers",
  {
    id: uuid("id")
      .primaryKey()
      .$default(() => uuidv7()),

    // Region info
    name: text("region_name")
      .notNull(),
    color: text("color")
      .default("#000000")
      .notNull(),
    shapeType: text("shape")
      .notNull(),

    // Metadata
    isPublic: boolean("is_public_viewable").default(false).notNull(),
    activeSnapshotId: uuid("active_snapshot_id").notNull(),
    ownerId: text("owner_id")
      .references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

export const regionSnapshots = pgTable(
  "region_snapshots",
  {
    id: uuid("id")
      .primaryKey()
      .$default(() => uuidv7()),

    // Region info
    name: text("region_name")
      .notNull(),
    color: text("color")
      .default("#000000")
      .notNull(),
    shapeType: text("shape")
      .notNull(),

    // Metadata
    snapshotState: snapshotState()
      .notNull()
      .default("wip"),
    regionId: uuid("region_id").notNull(),
    ownerId: text("owner_id")
      .references(() => user.id, { onDelete: "set null" }),
    versionName: text("version_name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

export const regionSequences = pgTable(
  "region_marker_sequences",
  {
    id: uuid("id")
      .primaryKey()
      .$default(() => uuidv7()),
    regionSnapshotId: uuid("region_snapshot_id")
      .notNull()
      .references(() => regionSnapshots.id, { onDelete: "cascade" }),

    // Region data
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
    index("region_seq_idx").on(t.regionSnapshotId, t.sequenceNumber),
  ],
);

export const regionStations = pgTable(
  "region_stations",
  {
    id: uuid("id")
      .primaryKey()
      .$default(() => uuidv7()),
    regionSnapshotId: uuid("region_snapshot_id")
      .notNull()
      .references(() => regionSnapshots.id, { onDelete: "cascade" }),

    // Station data
    address: text("address")
      .notNull()
      .default("Unknown"),
    availableFrom: text("available_from")
      .notNull()
      .default("00:00"),
    availableTo: text("available_to")
      .notNull()
      .default("23:59"),
    point: geometry("point", { type: "point", mode: "tuple", srid: 4326 }).notNull(),

    // Metadata
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("spatial_index_region_station").using("gist", t.point),
    index("region_station_ref_idx").on(t.regionSnapshotId),
  ],
);

export const roadClosures = pgTable("road_closure", {
  id: uuid("id")
    .primaryKey()
    .$default(() => uuidv7()),

  name: text("name").notNull(),
  description: text("description").notNull(),
  shape: text("shape").notNull(),

  // Metadata
  isPublic: boolean("is_public_viewable").default(false).notNull(),
  ownerId: text("owner_id")
    .references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const roadClosurePoints = pgTable("road_closure_points", {
  id: uuid("id")
    .primaryKey()
    .$default(() => uuidv7()),

  // Data
  sequenceNumber: integer("sequence_number").notNull(),
  point: geometry("point", { type: "point", mode: "tuple", srid: 4326 }).notNull(),

  // Metadata
  roadClosureId: uuid("road_closure_id")
    .notNull()
    .references(() => roadClosures.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (t) => [
  index("spatial_index_road_closure_region").using("gist", t.point),
  index("road_closure_region_ref_idx").on(t.roadClosureId),
]);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id")
      .primaryKey()
      .$default(() => uuidv7()),
    actorUserId: text("actor_user_id")
      .references(() => user.id, { onDelete: "set null" }),
    actorRole: text("actor_role"),
    category: text("category").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    httpMethod: text("http_method"),
    routePath: text("route_path"),
    statusCode: integer("status_code"),
    summary: text("summary").notNull(),
    payload: text("payload").notNull().default("{}"),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("activity_logs_actor_idx").on(table.actorUserId, table.createdAt),
    index("activity_logs_action_idx").on(table.action, table.createdAt),
    index("activity_logs_entity_idx").on(table.entityType, table.entityId, table.createdAt),
    index("activity_logs_created_at_idx").on(table.createdAt),
  ],
);

// ============================================================================
// BETTER AUTH RELATIONS
// ============================================================================

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  activityLogs: many(activityLogs),
  vehicleTypes: many(vehicleTypes),
}));

export const vehicleTypesRelations = relations(vehicleTypes, ({ one, many }) => ({
  owner: one(user, {
    fields: [vehicleTypes.ownerId],
    references: [user.id],
  }),
  routeSnapshots: many(routeSnapshots),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  actorUser: one(user, {
    fields: [activityLogs.actorUserId],
    references: [user.id],
  }),
}));
