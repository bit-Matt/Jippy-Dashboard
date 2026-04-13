import * as Sentry from "@sentry/nextjs";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { activityLogs, user } from "@/lib/db/schema";

const REDACTED_KEYS = [
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "authorization",
  "cookie",
  "email",
  "secret",
];

export type ActivityCategory =
  | "dashboard_visit"
  | "write_operation"
  | "snapshot_state_changed"
  | "active_snapshot_changed"
  | "publish_state_changed"
  | "security_event";

export type ActivityWriteInput = {
  actorUserId?: string;
  actorRole?: string;
  category: ActivityCategory;
  action: string;
  summary: string;
  statusCode?: number;
  routePath?: string;
  httpMethod?: string;
  entityType?: string;
  entityId?: string;
  payload?: unknown;
  metadata?: unknown;
};

export type ActivityLogListItem = {
  id: string;
  createdAt: Date;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  category: string;
  entityType: string | null;
  entityId: string | null;
  routePath: string | null;
  httpMethod: string | null;
  statusCode: number | null;
  summary: string;
  actorName: string | null;
  actorEmail: string | null;
};

export async function logActivity(input: ActivityWriteInput): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      category: input.category,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      routePath: input.routePath,
      httpMethod: input.httpMethod,
      statusCode: input.statusCode,
      summary: input.summary,
      payload: JSON.stringify(redact(input.payload ?? {})),
      metadata: JSON.stringify(redact(input.metadata ?? {})),
    });
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        activityAction: input.action,
        activityCategory: input.category,
      },
    });
  }
}

export async function logDashboardVisit(params: {
  actorUserId: string;
  actorRole?: string;
  routePath: string;
  summary?: string;
}): Promise<void> {
  try {
    const dedupeThreshold = new Date(Date.now() - 15 * 60 * 1000);

    const [existing] = await db
      .select({ id: activityLogs.id })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.category, "dashboard_visit"),
          eq(activityLogs.action, "dashboard_visit"),
          eq(activityLogs.actorUserId, params.actorUserId),
          eq(activityLogs.routePath, params.routePath),
          gte(activityLogs.createdAt, dedupeThreshold),
        ),
      )
      .orderBy(desc(activityLogs.createdAt))
      .limit(1);

    if (existing) {
      return;
    }

    await logActivity({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      category: "dashboard_visit",
      action: "dashboard_visit",
      summary: params.summary ?? `Visited ${params.routePath}`,
      routePath: params.routePath,
      httpMethod: "GET",
      statusCode: 200,
      payload: {},
      metadata: {},
    });
  } catch (error) {
    Sentry.captureException(error);
  }
}

export async function logBannedAccessAttempt(params: {
  actorUserId: string;
  actorRole?: string;
  routePath: string;
  httpMethod?: string;
  statusCode?: number;
  source?: string;
}): Promise<void> {
  try {
    const dedupeThreshold = new Date(Date.now() - 2 * 60 * 1000);

    const [existing] = await db
      .select({ id: activityLogs.id })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.category, "security_event"),
          eq(activityLogs.action, "banned_access_attempt"),
          eq(activityLogs.actorUserId, params.actorUserId),
          eq(activityLogs.routePath, params.routePath),
          eq(activityLogs.httpMethod, params.httpMethod ?? "GET"),
          gte(activityLogs.createdAt, dedupeThreshold),
        ),
      )
      .orderBy(desc(activityLogs.createdAt))
      .limit(1);

    if (existing) {
      return;
    }

    await logActivity({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      category: "security_event",
      action: "banned_access_attempt",
      summary: `Banned account attempted to access ${params.routePath}`,
      routePath: params.routePath,
      httpMethod: params.httpMethod ?? "GET",
      statusCode: params.statusCode ?? 403,
      entityType: "account",
      entityId: params.actorUserId,
      payload: {
        reason: "account_banned",
        source: params.source ?? "session.verify",
      },
      metadata: {},
    });
  } catch (error) {
    Sentry.captureException(error);
  }
}

export async function logBannedSignIn(params: {
  actorUserId: string;
  actorRole?: string;
  routePath?: string;
}): Promise<void> {
  try {
    const dedupeThreshold = new Date(Date.now() - 15 * 60 * 1000);

    const [existing] = await db
      .select({ id: activityLogs.id })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.category, "security_event"),
          eq(activityLogs.action, "banned_sign_in"),
          eq(activityLogs.actorUserId, params.actorUserId),
          gte(activityLogs.createdAt, dedupeThreshold),
        ),
      )
      .orderBy(desc(activityLogs.createdAt))
      .limit(1);

    if (existing) {
      return;
    }

    await logActivity({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      category: "security_event",
      action: "banned_sign_in",
      summary: "Banned account successfully authenticated.",
      routePath: params.routePath ?? "/api/auth/sign-in",
      httpMethod: "POST",
      statusCode: 204,
      entityType: "account",
      entityId: params.actorUserId,
      payload: {
        reason: "account_banned",
      },
      metadata: {},
    });
  } catch (error) {
    Sentry.captureException(error);
  }
}

export async function getActivityLogs(params: {
  limit: number;
  offset: number;
  action?: string;
  category?: string;
}): Promise<{ rows: ActivityLogListItem[]; total: number }> {
  const filters = [
    params.action ? eq(activityLogs.action, params.action) : undefined,
    params.category ? eq(activityLogs.category, params.category) : undefined,
  ].filter(Boolean);

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select({
      id: activityLogs.id,
      createdAt: activityLogs.createdAt,
      actorUserId: activityLogs.actorUserId,
      actorRole: activityLogs.actorRole,
      action: activityLogs.action,
      category: activityLogs.category,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      routePath: activityLogs.routePath,
      httpMethod: activityLogs.httpMethod,
      statusCode: activityLogs.statusCode,
      summary: activityLogs.summary,
      actorName: user.name,
      actorEmail: user.email,
    })
    .from(activityLogs)
    .leftJoin(user, eq(activityLogs.actorUserId, user.id))
    .where(whereClause)
    .orderBy(desc(activityLogs.createdAt))
    .limit(params.limit)
    .offset(params.offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activityLogs)
    .where(whereClause);

  return {
    rows: rows as ActivityLogListItem[],
    total: count ?? 0,
  };
}

export async function getActivityById(id: string) {
  const [row] = await db
    .select({
      id: activityLogs.id,
      createdAt: activityLogs.createdAt,
      actorUserId: activityLogs.actorUserId,
      actorRole: activityLogs.actorRole,
      action: activityLogs.action,
      category: activityLogs.category,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      routePath: activityLogs.routePath,
      httpMethod: activityLogs.httpMethod,
      statusCode: activityLogs.statusCode,
      summary: activityLogs.summary,
      payload: activityLogs.payload,
      metadata: activityLogs.metadata,
      actorName: user.name,
      actorEmail: user.email,
    })
    .from(activityLogs)
    .leftJoin(user, eq(activityLogs.actorUserId, user.id))
    .where(eq(activityLogs.id, id))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    ...row,
    payload: safeParseObject(row.payload),
    metadata: safeParseObject(row.metadata),
  };
}

function safeParseObject(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (isObject(value)) {
    const result: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      const shouldRedact = REDACTED_KEYS.some((redactedKey) =>
        key.toLowerCase().includes(redactedKey.toLowerCase()),
      );

      result[key] = shouldRedact ? "[REDACTED]" : redact(nestedValue);
    }

    return result;
  }

  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
