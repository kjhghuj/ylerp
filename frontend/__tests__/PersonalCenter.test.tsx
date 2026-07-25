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

    it('shows the two YC credential fields without returning the stored secret', async () => {
        render(<PersonalCenter />);

        expect(await screen.findByLabelText('元仓 appKey')).toHaveValue('stored-app-key');
        expect(screen.getByLabelText('元仓 appSecret')).toHaveValue('••••••••');
        expect(api.get).toHaveBeenCalledWith('/users/me/yc-credentials');
    });

    it('clears personal credentials so the backend can fall back to environment variables', async () => {
        render(<PersonalCenter />);

        const appKeyInput = await screen.findByLabelText('元仓 appKey');
        const appSecretInput = screen.getByLabelText('元仓 appSecret');
        fireEvent.change(appKeyInput, { target: { value: '' } });
        fireEvent.change(appSecretInput, { target: { value: '' } });
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
