import { ApiResponseBuilder } from "@/lib/http/ApiResponseBuilder";
import { StatusCodes } from "@/lib/http/StatusCodes";

export async function POST() {
  return ApiResponseBuilder.createError(
    StatusCodes.Status503ServiceUnavailable,
    "This navigate version is already been deprecated in favour of v2 and v3. Please use those instead.",
  ).build();
}
