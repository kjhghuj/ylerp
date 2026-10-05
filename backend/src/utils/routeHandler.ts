import type { RequestHandler, Response } from 'express';
import type { ParamsFlatDictionary } from 'express-serve-static-core';

type RouteErrorResponder = (error: unknown, res: Response) => unknown;
type JsonFailure = { status: number; body: unknown };

/**
 * Keep each router's error contract while sharing the asynchronous boundary.
 * Defaults to scalar route parameters; supply Params for wildcard array routes.
 */
export function handleRouteErrors<Params = ParamsFlatDictionary>(
  handler: RequestHandler<Params>,
  onError: RouteErrorResponder,
): RequestHandler<Params> {
  return async (req, res, next) => {
    try {
      return await handler(req, res, next);
    } catch (error) {
      return onError(error, res);
    }
  };
}

/** Standard JSON failures; domain-specific statuses and bodies remain explicit. */
export function handleJsonRouteErrors<Params = ParamsFlatDictionary>(
  handler: RequestHandler<Params>,
  message: string,
  options: {
    logMessage?: string;
    mapError?: (error: unknown) => JsonFailure | undefined;
  } = {},
): RequestHandler<Params> {
  return handleRouteErrors(handler, (error, res) => {
    const failure = options.mapError?.(error);
    if (failure) return res.status(failure.status).json(failure.body);
    console.error(options.logMessage ?? `${message}:`, error);
    return res.status(500).json({ error: message });
  });
}
