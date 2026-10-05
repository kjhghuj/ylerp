test('environment loads before provider modules capture their settings', () => {
  const saved = { GLM_API_KEY: process.env.GLM_API_KEY, ARK_API_KEY: process.env.ARK_API_KEY };
  delete process.env.GLM_API_KEY;
  delete process.env.ARK_API_KEY;
  jest.doMock('dotenv/config', () => {
    process.env.GLM_API_KEY = 'test-chat-loaded-config';
    process.env.ARK_API_KEY = 'test-image-loaded-config';
    return {};
  });
  try {
    jest.isolateModules(() => {
      expect(require('../../services/glm/glmConfig').GLM_API_KEY).toBe('test-chat-loaded-config');
      expect(require('../../services/chroma/config').ARK_API_KEY).toBe('test-image-loaded-config');
    });
  } finally {
    jest.dontMock('dotenv/config');
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
