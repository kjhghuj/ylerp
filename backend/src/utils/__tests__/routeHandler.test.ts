import type { Request, RequestHandler, Response } from 'express';
import type { ParamsFlatDictionary } from 'express-serve-static-core';
import { handleJsonRouteErrors, handleRouteErrors } from '../routeHandler';

const request = {} as Request<ParamsFlatDictionary>;
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

it('defaults unannotated handlers to scalar route parameters', async () => {
  const req = Object.assign({}, request, { params: { id: 'template-1', country: 'SG' } });
  const res = response();
  await handleRouteErrors((req, res) => {
    const id: string = req.params.id;
    return res.json({ id });
  }, jest.fn())(req, res as unknown as Response, jest.fn());
  await handleJsonRouteErrors((req, res) => {
    const country: string = req.params.country;
    return res.json({ country });
  }, 'Failed to fetch')(req, res as unknown as Response, jest.fn());
  expect(res.json).toHaveBeenNthCalledWith(1, { id: 'template-1' });
  expect(res.json).toHaveBeenNthCalledWith(2, { country: 'SG' });
});

it('preserves inferred and explicit wildcard array parameter types', async () => {
  type WildcardParams = { segments: string[] };
  const req = { params: { segments: ['templates', '1'] } } as Request<WildcardParams>;
  const res = response();
  await handleRouteErrors((req: Request<WildcardParams>, res) => {
    const segments: string[] = req.params.segments;
    return res.json(segments);
  }, jest.fn())(req, res as unknown as Response, jest.fn());
  await handleJsonRouteErrors<WildcardParams>((req, res) => {
    const segments: string[] = req.params.segments;
    return res.json(segments);
  }, 'Failed to fetch')(req, res as unknown as Response, jest.fn());
  expect(res.json).toHaveBeenNthCalledWith(1, ['templates', '1']);
  expect(res.json).toHaveBeenNthCalledWith(2, ['templates', '1']);
});

it('passes the request, response and next callback through on success', async () => {
  const res = response() as unknown as Response;
  const next = jest.fn();
  const handler = jest.fn((_req, _res, callback) => callback());
  const onError = jest.fn();
  await handleRouteErrors(handler, onError)(request, res, next);
  expect(handler).toHaveBeenCalledWith(request, res, next);
  expect(next).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
});

it.each(['throw', 'reject'])('delivers a %s to the router error responder', async mode => {
  const error = new Error('provider unavailable');
  const res = response() as unknown as Response;
  const handler: RequestHandler = mode === 'throw'
    ? () => { throw error; }
    : () => Promise.reject(error);
  const onError = jest.fn();
  await handleRouteErrors(handler, onError)(request, res, jest.fn());
  expect(onError).toHaveBeenCalledWith(error, res);
  expect(onError).toHaveBeenCalledTimes(1);
});

it('keeps a domain failure status and response body without logging it', async () => {
  const error = new Error('invalid input');
  const res = response();
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await handleJsonRouteErrors(() => { throw error; }, 'Failed to save', {
      mapError: caught => caught === error ? { status: 400, body: { detail: 'invalid input' } } : undefined,
    })(request, res as unknown as Response, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ detail: 'invalid input' });
    expect(log).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

it('logs the configured context and exposes only the public failure message', async () => {
  const error = new Error('private database details');
  const res = response();
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await handleJsonRouteErrors(() => Promise.reject(error), 'Failed to save', {
      logMessage: 'Save failed:',
    })(request, res as unknown as Response, jest.fn());
    expect(log).toHaveBeenCalledWith('Save failed:', error);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to save' });
  } finally { log.mockRestore(); }
});
