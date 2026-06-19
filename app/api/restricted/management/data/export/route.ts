import { session, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import * as dataManager from "@/lib/management/data-manager";
import { oneOf } from "@/lib/one-of";

export async function GET() {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const result = await dataManager.exportAllData();
  return oneOf(result).match(
    (payload) => {
      const filename = `jippy-export-${new Date().toISOString().slice(0, 10)}.json`;
      return new Response(JSON.stringify(payload, null, 2), {
        status: StatusCodes.Status200Ok,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    },
    (error) => ApiResponseBuilder.createFromFailure(error).build(),
  );
}
