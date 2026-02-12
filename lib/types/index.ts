export type ServerActionResult<T> = {
  ok: boolean;
  data?: T;
  message?: string;
}
