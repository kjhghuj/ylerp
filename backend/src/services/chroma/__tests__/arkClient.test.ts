import { chatWithImages, generateImage, type ArkClientConfig } from '../arkClient';
import { ApiError } from '../config';

const config: ArkClientConfig = { apiKey: 'test-provider-key', baseUrl: 'https://provider.test/v3', endpoints: {
  analysisLite: 'analysis', analysisMini: 'mini', analysisPro: 'pro', generationDefault: 'generation', generationLite: 'lite',
} };
const cases = [
  { action: 'analysis', run: () => chatWithImages('default', [{ type: 'text', text: 'test' }], config) },
  { action: 'generation', run: () => generateImage('default', 'test', '2048x2048', undefined, config) },
];
afterEach(() => jest.restoreAllMocks());
describe.each(cases)('Ark $action', ({ action, run }) => {
  test('maps asynchronous response JSON errors to the existing provider error contract', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('provider secret'); } } as unknown as Response);
    await expect(run()).rejects.toMatchObject({ status_code: 502, detail: `Ark ${action} request failed` });
  });
  test('keeps HTTP rejection status without reading or exposing the body', async () => {
    const json = jest.fn();
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 429, json } as unknown as Response);
    await expect(run()).rejects.toBeInstanceOf(ApiError);
    expect(json).not.toHaveBeenCalled();
  });
  test('keeps authorization, payload, timeout and successful JSON behavior', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ output: 'ok' }) } as unknown as Response);
    expect(await run()).toEqual({ output: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('https://provider.test/v3/'), expect.objectContaining({
      method: 'POST', headers: { Authorization: 'Bearer test-provider-key', 'Content-Type': 'application/json' }, signal: expect.any(AbortSignal),
    }));
  });
});
