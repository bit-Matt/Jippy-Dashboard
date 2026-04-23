import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";

const FEEDBACK_STATES = ["Active", "Resolved", "Closed"] as const;

export type FeedbackState = (typeof FEEDBACK_STATES)[number];

export interface FeedbackObject {
  id: string;
  email: string;
  type: string;
  details: string;
  state: FeedbackState;
  createdAt: Date;
  updatedAt: Date;
}

export interface GetAllFeedbackParams {
  page: number;
  limit: number;
  state?: FeedbackState;
}

export interface FeedbackListObject {
  rows: FeedbackObject[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateFeedbackParams {
  email: string;
  type: string;
  details: string;
}

/**
 * Determines whether the provided value is a valid feedback state.
 *
 * @param {string} value Candidate state value.
 * @returns {value is FeedbackState} True when the value is one of Active, Resolved, or Closed.
 */
function isFeedbackState(value: string): value is FeedbackState {
  return FEEDBACK_STATES.includes(value as FeedbackState);
}

/**
 * Fetches feedback records using page-based pagination and optional state filtering.
 *
 * Results are ordered by creation date descending so the newest reports appear first.
 *
 * @param {GetAllFeedbackParams} params Pagination and optional state filter.
 * @returns {Promise<Result<FeedbackListObject>>} Paginated feedback list and total count.
 */
export async function getAllFeedbacks(params: GetAllFeedbackParams): Promise<Result<FeedbackListObject>> {
  try {
    const safePage = Number.isInteger(params.page) && params.page > 0 ? params.page : 1;
    const safeLimit = Number.isInteger(params.limit) && params.limit > 0
      ? Math.min(params.limit, 100)
      : 20;

    if (params.state && !isFeedbackState(params.state)) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Invalid feedback state.",
        { state: params.state },
      );
    }

    const whereClause = params.state ? eq(feedback.state, params.state) : undefined;

    const rows = await db
      .select({
        id: feedback.id,
        email: feedback.email,
        type: feedback.type,
        details: feedback.details,
        state: feedback.state,
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
      })
      .from(feedback)
      .where(whereClause)
      .orderBy(desc(feedback.createdAt))
      .limit(safeLimit)
      .offset((safePage - 1) * safeLimit);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(feedback)
      .where(whereClause);

    return new Success({
      rows: rows as FeedbackObject[],
      total: count ?? 0,
      page: safePage,
      limit: safeLimit,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch feedback entries.", { params }, e);
  }
}

/**
 * Creates a new feedback entry from a validated payload.
 *
 * @param {CreateFeedbackParams} params Validated feedback submission payload.
 * @returns {Promise<Result<FeedbackObject>>} Newly created feedback record.
 */
export async function createFeedback(params: CreateFeedbackParams): Promise<Result<FeedbackObject>> {
  try {
    const [created] = await db
      .insert(feedback)
      .values({
        email: params.email.trim(),
        type: params.type.trim(),
        details: params.details.trim(),
      })
      .returning({
        id: feedback.id,
        email: feedback.email,
        type: feedback.type,
        details: feedback.details,
        state: feedback.state,
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
      });

    if (!created) {
      return new Failure(ErrorCodes.Fatal, "Failed to create feedback entry.", { params });
    }

    return new Success(created as FeedbackObject);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to create feedback entry.", { params }, e);
  }
}

/**
 * Updates the state of an existing feedback entry.
 *
 * @param {string} feedbackId Feedback entry identifier.
 * @param {FeedbackState} state New state value.
 * @returns {Promise<Result<FeedbackObject>>} Updated feedback record.
 */
export async function updateFeedback(
  feedbackId: string,
  state: FeedbackState,
): Promise<Result<FeedbackObject>> {
  try {
    if (!isFeedbackState(state)) {
      return new Failure(ErrorCodes.ValidationFailure, "Invalid feedback state.", { state });
    }

    const [existing] = await db
      .select({ id: feedback.id })
      .from(feedback)
      .where(eq(feedback.id, feedbackId))
      .limit(1);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Feedback entry not found.", { feedbackId });
    }

    const [updated] = await db
      .update(feedback)
      .set({ state })
      .where(eq(feedback.id, feedbackId))
      .returning({
        id: feedback.id,
        email: feedback.email,
        type: feedback.type,
        details: feedback.details,
        state: feedback.state,
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
      });

    if (!updated) {
      return new Failure(ErrorCodes.Fatal, "Failed to update feedback entry.", { feedbackId, state });
    }

    return new Success(updated as FeedbackObject);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to update feedback entry.", { feedbackId, state }, e);
  }
}
