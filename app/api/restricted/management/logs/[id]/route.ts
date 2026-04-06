import { session, SessionCode } from "@/lib/auth";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { getActivityById } from "@/lib/management/activity-logger";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  const { id } = await params;
  const row = await getActivityById(id);

  if (!row) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, [{
      message: "No activity log found.",
    }]).orchestrate();
  }

  return ResponseComposer.compose(StatusCodes.Status200Ok)
    .setBody(row)
    .orchestrate();
}
