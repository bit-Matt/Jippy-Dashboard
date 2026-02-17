import { NextResponse } from "next/server";
import { StatusCodes } from "@/lib/http/StatusCodes";

export class ResponseComposer<TResponse> implements IResponseComposer<TResponse> {
  private readonly _code: StatusCodes | number;
  private readonly _additionalHeaders: Record<string, string> = {};

  private readonly _body: IApiResponse<TResponse> = {
    ok: true,
    data: null as TResponse,
  };

  private constructor(code: StatusCodes | number) {
    this._code = code;
  }

  addHeader(key: string, value: string): IResponseComposer<TResponse> {
    if (!this._additionalHeaders[key]) {
      this._additionalHeaders[key] = value;
    }

    return this;
  }

  setBody(body: TResponse): IResponseComposer<TResponse> {
    this._body.data = body;
    return this;
  }

  orchestrate(): NextResponse {
    // 204s don't have a response body.
    if (this._code === StatusCodes.Status204NoContent) {
      return new NextResponse(null, {
        headers: this._additionalHeaders,
        status: this._code,
      });
    }

    return NextResponse.json(this._body, {
      headers: this._additionalHeaders,
      status: this._code,
    });
  }

  /**
   * Creates a new instance of ResponseComposer.
   * @param code {StatusCodes | number} HTTP Status Code
   * @remarks For Exceptions, see ExceptionResponseComposer.
   * @returns {ResponseComposer}
   */
  static compose<T>(code: StatusCodes | number): ResponseComposer<T> {
    return new ResponseComposer<T>(code);
  }
}

export class ExceptionResponseComposer implements IResponseComposer<ErrorCollection> {
  private readonly _code: StatusCodes | number;
  private readonly _additionalHeaders: Record<string, string> = {};

  private readonly _body: IApiResponseError = {
    type: "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.1",
    title: "Bad Request",
    status: StatusCodes.Status400BadRequest,
    errors: [] satisfies ErrorCollection,
  };

  private constructor(code: StatusCodes | number) {
    switch (code) {
    case StatusCodes.Status400BadRequest:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.1";
      this._body.title = "Bad Request";
      break;
    case StatusCodes.Status401Unauthorized:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7235#section-3.1";
      this._body.title = "Unauthorized";
      break;
    case StatusCodes.Status402PaymentRequired:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.2";
      this._body.title = "Payment Required";
      break;
    case StatusCodes.Status403Forbidden:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.3";
      this._body.title = "Forbidden";
      break;
    case StatusCodes.Status404NotFound:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.4";
      this._body.title = "Not Found";
      break;
    case StatusCodes.Status405MethodNotAllowed:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.5";
      this._body.title = "Method Not Allowed";
      break;
    case StatusCodes.Status406NotAcceptable:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.6";
      this._body.title = "Not Acceptable";
      break;
    case StatusCodes.Status407ProxyAuthenticationRequired:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7235#section-3.2";
      this._body.title = "Proxy Authentication Required";
      break;
    case StatusCodes.Status408RequestTimeout:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.7";
      this._body.title = "Request Timeout";
      break;
    case StatusCodes.Status409Conflict:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.8";
      this._body.title = "Conflict";
      break;
    case StatusCodes.Status410Gone:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.9";
      this._body.title = "Gone";
      break;
    case StatusCodes.Status411LengthRequired:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.10";
      this._body.title = "Length Required";
      break;
    case StatusCodes.Status412PreconditionFailed:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7232#section-4.2";
      this._body.title = "Precondition Failed";
      break;
    case StatusCodes.Status413PayloadTooLarge:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.11";
      this._body.title = "Payload Too Large";
      break;
    case StatusCodes.Status414RequestUriTooLong:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.12";
      this._body.title = "Request URI Too Long";
      break;
    case StatusCodes.Status415UnsupportedMediaType:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.13";
      this._body.title = "Unsupported Media Type";
      break;
    case StatusCodes.Status416RangeNotSatisfiable:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7233#section-4.4";
      this._body.title = "Range Not Satisfiable";
      break;
    case StatusCodes.Status417ExpectationFailed:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.14";
      this._body.title = "Expectation Failed";
      break;
    case StatusCodes.Status418ImATeapot:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc2324#section-2.3.2";
      this._body.title = "I'm a teapot";
      break;
    case StatusCodes.Status419AuthenticationTimeout:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7235#section-3.2";
      this._body.title = "Authentication Timeout";
      break;
    case StatusCodes.Status421MisdirectedRequest:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7540#section-9.1.2";
      this._body.title = "Misdirected Request";
      break;
    case StatusCodes.Status422UnprocessableEntity:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc4918#section-11.2";
      this._body.title = "Unprocessable Entity";
      break;
    case StatusCodes.Status423Locked:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc4918#section-11.3";
      this._body.title = "Locked";
      break;
    case StatusCodes.Status424FailedDependency:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc4918#section-11.4";
      this._body.title = "Failed Dependency";
      break;
    case StatusCodes.Status426UpgradeRequired:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.15";
      this._body.title = "Upgrade Required";
      break;
    case StatusCodes.Status428PreconditionRequired:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc6585#section-3";
      this._body.title = "Precondition Required";
      break;
    case StatusCodes.Status429TooManyRequests:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc6585#section-4";
      this._body.title = "Too Many Requests";
      break;
    case StatusCodes.Status431RequestHeaderFieldsTooLarge:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc6585#section-5";
      this._body.title = "Request Header Fields Too Large";
      break;
    case StatusCodes.Status451UnavailableForLegalReasons:
      this._body.type = "";
      this._body.title = "Unavailable For Legal Reasons";
      break;
    case StatusCodes.Status499ClientClosedRequest:
      this._body.type = "";
      this._body.title = "Client Closed Request";
      break;
    case StatusCodes.Status500InternalServerError:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.1";
      this._body.title = "Internal Server Error";
      break;
    case StatusCodes.Status501NotImplemented:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.2";
      this._body.title = "Not Implemented";
      break;
    case StatusCodes.Status502BadGateway:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.3";
      this._body.title = "Bad Gateway";
      break;
    case StatusCodes.Status503ServiceUnavailable:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.4";
      this._body.title = "Service Unavailable";
      break;
    case StatusCodes.Status504GatewayTimeout:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.5";
      this._body.title = "Gateway Timeout";
      break;
    case StatusCodes.Status505HttpVersionNotSupported:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.6";
      this._body.title = "HTTP Version Not Supported";
      break;
    case StatusCodes.Status506VariantAlsoNegotiates:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc2295#section-8.1";
      this._body.title = "Variant Also Negotiates";
      break;
    case StatusCodes.Status507InsufficientStorage:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc4918#section-11.5";
      this._body.title = "Insufficient Storage";
      break;
    case StatusCodes.Status508LoopDetected:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc5842#section-7.2";
      this._body.title = "Loop Detected";
      break;
    case StatusCodes.Status510NotExtended:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc2774#section-7";
      this._body.title = "Not Extended";
      break;
    case StatusCodes.Status511NetworkAuthenticationRequired:
      this._body.type = "https://datatracker.ietf.org/doc/html/rfc6585#section-6";
      this._body.title = "Network Authentication Required";
      break;
    }

    this._code = code;
  }

  addHeader(key: string, value: string): IResponseComposer<ErrorCollection> {
    if (!this._additionalHeaders[key]) {
      this._additionalHeaders[key] = value;
    }

    return this;
  }

  setBody(body: ErrorCollection): IResponseComposer<ErrorCollection> {
    this._body.errors = body;
    return this;
  }

  orchestrate(): NextResponse {
    return NextResponse.json(this._body, {
      headers: this._additionalHeaders,
      status: this._code,
    });
  }

  /**
   * Creates a new instance of ExceptionResponseComposer.
   * @param code {StatusCodes | number} HTTP Status Code
   * @param errors {ErrorCollection} Error Collection
   * @remarks Error Codes should only be 4xx or 5xx.
   * @returns {ExceptionResponseComposer}
   */
  static compose(code: StatusCodes | number, errors: ErrorCollection): IResponseComposer<ErrorCollection> {
    return new ExceptionResponseComposer(code).setBody(errors);
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

export type ErrorCollection = Array<object>;

export interface IApiResponseError {
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

  errors: ErrorCollection;
}
