import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../src/api';
import { PersonalCenter } from '../modules/PersonalCenter';

vi.mock('../AuthContext', () => ({
    useAuth: () => ({
        user: {
            id: 'user-1',
            username: 'owner',
            displayName: '管理员',
            phone: null,
            email: null,
            avatar: null,
            role: 'owner',
            parentId: null,
            permissions: ['*'],
        },
        refreshUser: vi.fn(),
    }),
}));

vi.mock('../src/api', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
    },
}));

const mockAiConfigGet = (chat: Record<string, unknown> = {}, image: Record<string, unknown> = {}) => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url === '/users/me/ai-config') {
            return {
                data: {
                    chat: {
                        baseUrl: '',
                        model: '',
                        provider: '',
                        apiKeyConfigured: false,
                        environmentConfigured: true,
                        ...chat,
                    },
                    image: {
                        baseUrl: '',
                        apiKeyConfigured: false,
                        environmentConfigured: true,
                        endpoints: {
                            analysisLite: '', analysisMini: '', analysisPro: '',
                            generationDefault: '', generationLite: '',
                        },
                        environmentEndpoints: {},
                        ...image,
                    },
                },
            };
        }
        return { data: { appKey: '', appSecretConfigured: false, environmentConfigured: false } };
    });
};

describe('PersonalCenter tabs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAiConfigGet();
        vi.mocked(api.put).mockResolvedValue({ data: {} });
    });

    it('renders profile / AI / YC / password / Shopee tabs for owner', () => {
        render(<PersonalCenter />);

        expect(screen.getByRole('button', { name: '基本信息' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'AI 服务' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '元仓开放平台' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '修改密码' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Shopee 店铺授权' })).toBeInTheDocument();
        // 默认停留在基本信息：头像表单可见，AI / 元仓字段不渲染
        expect(screen.getByText('点击更换头像')).toBeInTheDocument();
        expect(screen.queryByLabelText('对话模型 API Key')).toBeNull();
        expect(screen.queryByLabelText('元仓 appKey')).toBeNull();
    });
});

describe('PersonalCenter YC credentials', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.get).mockResolvedValue({
            data: {
                appKey: 'stored-app-key',
                appSecretConfigured: true,
                environmentConfigured: true,
            },
        });
        vi.mocked(api.put).mockResolvedValue({
            data: {
                appKey: '',
                appSecretConfigured: false,
                environmentConfigured: true,
            },
        });
    });

    const openYcTab = async () => {
        render(<PersonalCenter />);
        fireEvent.click(screen.getByRole('button', { name: '元仓开放平台' }));
        await screen.findByLabelText('元仓 appKey');
    };

    it('shows the two YC credential fields without returning the stored secret', async () => {
        await openYcTab();

        expect(screen.getByLabelText('元仓 appKey')).toHaveValue('stored-app-key');
        expect(screen.getByLabelText('元仓 appSecret')).toHaveValue('••••••••');
        expect(api.get).toHaveBeenCalledWith('/users/me/yc-credentials');
    });

    it('clears personal credentials so the backend can fall back to environment variables', async () => {
        await openYcTab();

        fireEvent.change(screen.getByLabelText('元仓 appKey'), { target: { value: '' } });
        fireEvent.change(screen.getByLabelText('元仓 appSecret'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: '保存元仓配置' }));

        await waitFor(() => {
            expect(api.put).toHaveBeenCalledWith('/users/me/yc-credentials', {
                appKey: '',
                appSecret: '',
            });
        });
        expect(await screen.findByText('已改用服务器环境变量中的元仓配置')).toBeInTheDocument();
    });
});

describe('PersonalCenter AI config', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAiConfigGet({
            baseUrl: 'https://user.example/v1',
            model: 'user-model',
            apiKeyConfigured: true,
            environmentConfigured: true,
        }, {
            endpoints: {
                analysisLite: 'ep-user-lite', analysisMini: '', analysisPro: '',
                generationDefault: '', generationLite: '',
            },
        });
        vi.mocked(api.put).mockResolvedValue({ data: {} });
    });

    const openAiTab = async () => {
        render(<PersonalCenter />);
        fireEvent.click(screen.getByRole('button', { name: 'AI 服务' }));
        await screen.findByLabelText('对话模型 Base URL');
    };

    it('loads AI config with masked chat API key and status hints', async () => {
        await openAiTab();

        expect(screen.getByLabelText('对话模型 Base URL')).toHaveValue('https://user.example/v1');
        expect(screen.getByLabelText('模型名称')).toHaveValue('user-model');
        expect(screen.getByLabelText('对话模型 API Key')).toHaveValue('••••••••');
        expect(screen.getByText('已保存个人 API Key；删除圆点后留空保存可恢复环境变量')).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith('/users/me/ai-config');
    });

    it('keeps the masked key untouched and submits cleared fields on save', async () => {
        await openAiTab();

        fireEvent.change(screen.getByLabelText('对话模型 API Key'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: '保存 AI 配置' }));

        await waitFor(() => {
            expect(api.put).toHaveBeenCalledWith('/users/me/ai-config', {
                chat: { provider: 'custom', baseUrl: 'https://user.example/v1', model: 'user-model', apiKey: '' },
                image: {
                    baseUrl: '',
                    apiKey: '',
                    endpoints: {
                        analysisLite: 'ep-user-lite',
                        analysisMini: '',
                        analysisPro: '',
                        generationDefault: '',
                        generationLite: '',
                    },
                },
            });
        });
    });

    it('does not submit an unchanged masked key', async () => {
        await openAiTab();

        fireEvent.click(screen.getByRole('button', { name: '保存 AI 配置' }));

        await waitFor(() => {
            expect(api.put).toHaveBeenCalledWith('/users/me/ai-config', expect.objectContaining({
                chat: expect.not.objectContaining({ apiKey: expect.anything() }),
            }));
        });
        expect(await screen.findByText('AI 配置已保存')).toBeInTheDocument();
    });
});

describe('PersonalCenter AI chat provider presets', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAiConfigGet();
        vi.mocked(api.put).mockResolvedValue({ data: {} });
    });

    const openAiTab = async () => {
        render(<PersonalCenter />);
        fireEvent.click(screen.getByRole('button', { name: 'AI 服务' }));
        await screen.findByLabelText('服务商');
    };

    it('fills recommended Base URL and model when a provider preset is selected', async () => {
        await openAiTab();

        fireEvent.change(screen.getByLabelText('服务商'), { target: { value: 'glm' } });
        expect(screen.getByLabelText('对话模型 Base URL')).toHaveValue('https://open.bigmodel.cn/api/coding/paas/v4');
        expect(screen.getByLabelText('模型名称')).toHaveValue('glm-5.3');

        fireEvent.change(screen.getByLabelText('服务商'), { target: { value: 'deepseek' } });
        expect(screen.getByLabelText('对话模型 Base URL')).toHaveValue('https://api.deepseek.com');
        expect(screen.getByLabelText('模型名称')).toHaveValue('deepseek-chat');
        expect(screen.getByText('deepseek-chat 为对话模型，deepseek-reasoner 为深度推理模型')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '保存 AI 配置' }));
        await waitFor(() => {
            expect(api.put).toHaveBeenCalledWith('/users/me/ai-config', expect.objectContaining({
                chat: expect.objectContaining({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' }),
            }));
        });
    });

    it('keeps fields editable when switching to custom provider', async () => {
        await openAiTab();

        fireEvent.change(screen.getByLabelText('服务商'), { target: { value: 'glm' } });
        fireEvent.change(screen.getByLabelText('服务商'), { target: { value: 'custom' } });
        expect(screen.getByLabelText('对话模型 Base URL')).toHaveValue('https://open.bigmodel.cn/api/coding/paas/v4');
        expect(screen.getByLabelText('模型名称')).toHaveValue('glm-5.3');
    });

    it('infers the provider from a stored Base URL when provider is empty', async () => {
        const { unmount } = render(<PersonalCenter />);
        await screen.findByRole('button', { name: 'AI 服务' });
        unmount();

        mockAiConfigGet({ baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' });
        render(<PersonalCenter />);
        fireEvent.click(screen.getByRole('button', { name: 'AI 服务' }));
        const providerSelect = await screen.findByLabelText('服务商') as HTMLSelectElement;
        expect(providerSelect.value).toBe('deepseek');
    });
});
