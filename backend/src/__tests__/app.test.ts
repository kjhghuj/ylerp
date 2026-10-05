jest.mock('../infrastructure/runtimeResources', () => ({
  prisma: { user: { findUnique: jest.fn() } },
  safeRedis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  initializeRuntimeResources: jest.fn(),
}));

import express from 'express';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHmac } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../app';
import { prisma, initializeRuntimeResources } from '../infrastructure/runtimeResources';

it('app assembly does not listen or start timers, connections or database queries', () => {
  jest.useFakeTimers();
  const listen = jest.spyOn(express.application, 'listen');
  try {
    const app = createApp();
    expect(typeof app).toBe('function');
    expect(listen).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    expect(initializeRuntimeResources).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  } finally { listen.mockRestore(); jest.useRealTimers(); }
});

describe('assembled HTTP application', () => {
  let server: Server;
  let origin: string;
  let inbox: string;
  const env = process.env;
  const callbackUrl = 'https://app-smoke.example/api/shopee/webhook';
  const pushKey = 'app-smoke-test-key';
  beforeAll(async () => {
    inbox = await mkdtemp(path.join(os.tmpdir(), 'erp-app-test-'));
    process.env = { ...env, SHOPEE_PUSH_PARTNER_KEY: pushKey, SHOPEE_WEBHOOK_URL: callbackUrl,
      SHOPEE_PUSH_INBOX_DIR: inbox, SHOPEE_PUSH_DIAGNOSTICS: '0' };
    server = http.createServer(createApp());
    server.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve); server.once('error', reject);
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    process.env = env;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    if (inbox) await rm(inbox, { recursive: true, force: true });
  });

  it('keeps health and authorization callback public and products protected', async () => {
    const health = await fetch(`${origin}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    expect((await fetch(`${origin}/api/shopee/callback`)).status).toBe(200);
    expect((await fetch(`${origin}/api/products`)).status).toBe(401);
  });

  it('keeps bounded JSON validation ahead of product authentication', async () => {
    const malformed = await fetch(`${origin}/api/products/with-templates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'Invalid JSON body' });
    const oversized = await fetch(`${origin}/api/products/with-templates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(2 * 1024 * 1024) }),
    });
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({ error: 'Request body too large' });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('verifies and stores signed Shopee bytes before the general JSON parser', async () => {
    const body = '{ "code": 3, "data": { "name": "测试" } }\n';
    const signature = createHmac('sha256', pushKey).update(callbackUrl).update('|').update(body).digest('hex');
    const response = await fetch(`${origin}/api/shopee/webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: signature }, body,
    });
    expect(response.status).toBe(200);
    const files = await readdir(inbox);
    expect(files).toHaveLength(1);
    expect(await readFile(path.join(inbox, files[0]), 'utf8')).toBe(body);
  });
});
