import { session, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { getActivityById } from "@/lib/management/activity-logger";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id } = await params;
  const row = await getActivityById(id);

  if (!row) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{
      message: "No activity log found.",
    }]).build();
  }

  return ApiResponseBuilder.create(StatusCodes.Status200Ok)
    .withBody(row)
    .build();
}
