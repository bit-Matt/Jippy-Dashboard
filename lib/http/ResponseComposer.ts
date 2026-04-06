import { NextResponse } from "next/server";

import { ErrorCodes, Failure } from "@/lib/one-of";
import { SessionCode, type SessionVerifiedResult } from "@/lib/auth";
import { StatusCodes } from "@/lib/http/StatusCodes";

export class ResponseComposer<TResponse> implements IResponseComposer<TResponse> {
  private _code: StatusCodes | number = StatusCodes.Status200Ok;
  private readonly _additionalHeaders: Record<string, string> = {};

  private readonly _body: IApiResponse<TResponse> = {
    ok: true,
    data: null as TResponse,
  };

  private constructor() { }

  addHeader(key: string, value: string): IResponseComposer<TResponse> {
    if (!this._additionalHeaders[key]) {
      this._additionalHeaders[key] = value;
    }

    return this;
  }

  setStatusCode(code: StatusCodes | number): IResponseComposer<TResponse> {
    if (code >= 100 && code <= 599) {
      this._code = code;
    }

    return this;
  }

  setBody(body: TResponse): IResponseComposer<TResponse> {
    this._body.data = body;
    return this;
  }

  orchestrate(): NextResponse {
    // For empty responses, Next.js returns a 204 No Content response.
    if (this._code === StatusCodes.Status204NoContent) {
      return new NextResponse(null, { status: this._code });
    }

    return NextResponse.json(this._body, {
      headers: this._additionalHeaders,
      status: this._code,
    });
  }

  /**
   * Creates a new instance of ResponseComposer.
   * @param {StatusCodes | number} code HTTP Status Code
   * @remarks For Exceptions, see ExceptionResponseComposer.
   * @returns {Types}
   */
  static compose<T>(code: StatusCodes | number): IResponseComposer<T> {
    return new ResponseComposer<T>()
      .setStatusCode(code);
  }

  /**
   * Creates a new instance of ResponseComposer for exceptions.
   *
   * @template T
   * @param {StatusCodes | number} code HTTP status code.
   * @param {T} errorBody Error body.
   * @remarks For regular responses, use `ResponseComposer.compose` method instead.
   * @returns {ResponseComposer<IApiResponseError<T>>}
   * @throws {Error} Throws exception when you provide non 4XX or 5XX status code.
   */
  static composeError<T>(code: StatusCodes | number, errorBody: T): IResponseComposer<IApiResponseError<T>> {
    // Accept only 4XX or 5XX codes
    if (code < 400 || code >= 600) {
      throw new Error("Invalid status code. This method only supports 4XX or 5XX codes.");
    }

    const response = new ResponseComposer<IApiResponseError<T>>();

    // Compose the exception here.
    const body: IApiResponseError<T> = {
      type: "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.1",
      title: "Bad Request",
      status: StatusCodes.Status400BadRequest,
      details: errorBody,
    };

    // Set the status code
    response.setStatusCode(code);
    body.status = code;

    // Provide proper IETF link for the response for reference
    switch (code) {
    case StatusCodes.Status400BadRequest:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.1";
      body.title = "Bad Request";
      break;
    case StatusCodes.Status401Unauthorized:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7235#section-3.1";
      body.title = "Unauthorized";
      break;
    case StatusCodes.Status402PaymentRequired:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.2";
      body.title = "Payment Required";
      break;
    case StatusCodes.Status403Forbidden:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.3";
      body.title = "Forbidden";
      break;
    case StatusCodes.Status404NotFound:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.4";
      body.title = "Not Found";
      break;
    case StatusCodes.Status405MethodNotAllowed:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.5";
      body.title = "Method Not Allowed";
      break;
    case StatusCodes.Status406NotAcceptable:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.6";
      body.title = "Not Acceptable";
      break;
    case StatusCodes.Status407ProxyAuthenticationRequired:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7235#section-3.2";
      body.title = "Proxy Authentication Required";
      break;
    case StatusCodes.Status408RequestTimeout:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.7";
      body.title = "Request Timeout";
      break;
    case StatusCodes.Status409Conflict:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.8";
      body.title = "Conflict";
      break;
    case StatusCodes.Status410Gone:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.9";
      body.title = "Gone";
      break;
    case StatusCodes.Status411LengthRequired:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.10";
      body.title = "Length Required";
      break;
    case StatusCodes.Status412PreconditionFailed:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7232#section-4.2";
      body.title = "Precondition Failed";
      break;
    case StatusCodes.Status413PayloadTooLarge:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.11";
      body.title = "Payload Too Large";
      break;
    case StatusCodes.Status414RequestUriTooLong:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.12";
      body.title = "Request URI Too Long";
      break;
    case StatusCodes.Status415UnsupportedMediaType:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.13";
      body.title = "Unsupported Media Type";
      break;
    case StatusCodes.Status416RangeNotSatisfiable:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7233#section-4.4";
      body.title = "Range Not Satisfiable";
      break;
    case StatusCodes.Status417ExpectationFailed:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.14";
      body.title = "Expectation Failed";
      break;
    case StatusCodes.Status418ImATeapot:
      body.type = "https://datatracker.ietf.org/doc/html/rfc2324#section-2.3.2";
      body.title = "I'm a teapot";
      break;
    case StatusCodes.Status419AuthenticationTimeout:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7235#section-3.2";
      body.title = "Authentication Timeout";
      break;
    case StatusCodes.Status421MisdirectedRequest:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7540#section-9.1.2";
      body.title = "Misdirected Request";
      break;
    case StatusCodes.Status422UnprocessableEntity:
      body.type = "https://datatracker.ietf.org/doc/html/rfc4918#section-11.2";
      body.title = "Unprocessable Entity";
      break;
    case StatusCodes.Status423Locked:
      body.type = "https://datatracker.ietf.org/doc/html/rfc4918#section-11.3";
      body.title = "Locked";
      break;
    case StatusCodes.Status424FailedDependency:
      body.type = "https://datatracker.ietf.org/doc/html/rfc4918#section-11.4";
      body.title = "Failed Dependency";
      break;
    case StatusCodes.Status426UpgradeRequired:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.15";
      body.title = "Upgrade Required";
      break;
    case StatusCodes.Status428PreconditionRequired:
      body.type = "https://datatracker.ietf.org/doc/html/rfc6585#section-3";
      body.title = "Precondition Required";
      break;
    case StatusCodes.Status429TooManyRequests:
      body.type = "https://datatracker.ietf.org/doc/html/rfc6585#section-4";
      body.title = "Too Many Requests";
      break;
    case StatusCodes.Status431RequestHeaderFieldsTooLarge:
      body.type = "https://datatracker.ietf.org/doc/html/rfc6585#section-5";
      body.title = "Request Header Fields Too Large";
      break;
    case StatusCodes.Status451UnavailableForLegalReasons:
      body.type = "";
      body.title = "Unavailable For Legal Reasons";
      break;
    case StatusCodes.Status499ClientClosedRequest:
      body.type = "";
      body.title = "Client Closed Request";
      break;
    case StatusCodes.Status500InternalServerError:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.1";
      body.title = "Internal Server Error";
      break;
    case StatusCodes.Status501NotImplemented:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.2";
      body.title = "Not Implemented";
      break;
    case StatusCodes.Status502BadGateway:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.3";
      body.title = "Bad Gateway";
      break;
    case StatusCodes.Status503ServiceUnavailable:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.4";
      body.title = "Service Unavailable";
      break;
    case StatusCodes.Status504GatewayTimeout:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.5";
      body.title = "Gateway Timeout";
      break;
    case StatusCodes.Status505HttpVersionNotSupported:
      body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.6";
      body.title = "HTTP Version Not Supported";
      break;
    case StatusCodes.Status506VariantAlsoNegotiates:
      body.type = "https://datatracker.ietf.org/doc/html/rfc2295#section-8.1";
      body.title = "Variant Also Negotiates";
      break;
    case StatusCodes.Status507InsufficientStorage:
      body.type = "https://datatracker.ietf.org/doc/html/rfc4918#section-11.5";
      body.title = "Insufficient Storage";
      break;
    case StatusCodes.Status508LoopDetected:
      body.type = "https://datatracker.ietf.org/doc/html/rfc5842#section-7.2";
      body.title = "Loop Detected";
      break;
    case StatusCodes.Status510NotExtended:
      body.type = "https://datatracker.ietf.org/doc/html/rfc2774#section-7";
      body.title = "Not Extended";
      break;
    case StatusCodes.Status511NetworkAuthenticationRequired:
      body.type = "https://datatracker.ietf.org/doc/html/rfc6585#section-6";
      body.title = "Network Authentication Required";
      break;
    }

    // Add the body to the response
    response.setBody(body);

    return response;
  }

  /**
   * Composes an error response based on the given failure object.
   *
   * @param {Failure} failure - An object representing the failure details, including its type and message.
   * @return {object} The composed error response object, including the appropriate HTTP status code and error message.
   */
  static composeFromFailure(failure: Failure): IResponseComposer<IApiResponseError<{ message: string; }>> {
    switch (failure.type) {
    case ErrorCodes.ValidationFailure:
    case ErrorCodes.ResourceExpired:
      return ResponseComposer
        .composeError(StatusCodes.Status400BadRequest, { message: failure.message });
    case ErrorCodes.ResourceNotFound:
      return ResponseComposer
        .composeError(StatusCodes.Status404NotFound, { message: failure.message });
    default:
      return ResponseComposer
        .composeError(StatusCodes.Status500InternalServerError, { message: failure.message });
    }
  }

  static composeFromSessionValidation(result: Optional<SessionVerifiedResult>): IResponseComposer<IApiResponseError<{ message: string; }>> {
    if (!result) {
      return ResponseComposer
        .composeError(StatusCodes.Status401Unauthorized, { message: "Invalid session." });
    }

    switch (result.code) {
    case SessionCode.Banned:
      return ResponseComposer
        .composeError(StatusCodes.Status403Forbidden, { message: "Your account has been banned." });
    case SessionCode.ShadowBanned:
    case SessionCode.Pending:
      return ResponseComposer
        .composeError(StatusCodes.Status403Forbidden, { message: "Your account is pending verification." });
    case SessionCode.InsufficientPermissions:
      return ResponseComposer
        .composeError(StatusCodes.Status403Forbidden, { message: "You don't have permission to perform this action." });
    default:
      return ResponseComposer
        .composeError(StatusCodes.Status401Unauthorized, { message: "Invalid session." });
    }
  }
}

export interface IApiResponse<TResponse> {
  ok: boolean;
  data: TResponse;
}

export interface IResponseComposer<TResponse> {
  /**
   * Add a header to the response
   * @param key {string} Key of the header
   * @param value {string} Value of the header
   * @remarks If the key already exists, it will be ignored during .orchestrate() call.
   */
  addHeader(key: string, value: string): IResponseComposer<TResponse>;

  /**
   * Set the status code of the response.
   *
   * @param {StatusCodes | number} code Set the status code of the response.
   */
  setStatusCode(code: StatusCodes | number): IResponseComposer<TResponse>;

  /**
   * Set the body of the response.
   * @param body
   */
  setBody(body: TResponse): IResponseComposer<TResponse>;

  /**
   * Finalize the response and return it.
   * @returns {Response}
   */
  orchestrate(): NextResponse;
}

export interface IApiResponseError<T> {
  /**
   * IETF RFC 7237 Error Type
   * @see https://datatracker.ietf.org/doc/html/rfc7237
   */
  type: string;

  /**
   * Title of the error
   */
  title: string;

  /**
   * Error code
   */
  status: StatusCodes | number;

  /**
   * Trace ID of the error
   * @remarks ID of the error which the developers can track. However, this is not yet implemented.
   */
  traceId?: string;

  details: T;
}
