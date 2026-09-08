import React, { useState, useEffect, useRef } from 'react';
import {
    User,
    Phone,
    Mail,
    Camera,
    Save,
    Lock,
    Eye,
    EyeOff,
    CheckCircle,
    AlertCircle,
    KeyRound,
    Sparkles,
    MessageSquare,
    Image as ImageIcon,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import api from '../src/api';
import { ShopeeConnections } from './ShopeeConnections';

type TabType = 'profile' | 'ai' | 'yc' | 'password' | 'shopee';
const YC_SECRET_MASK = '••••••••';
const AI_KEY_MASK = '••••••••';

/** 对话模型服务商预设（Base URL / 推荐模型来自各家官方文档，均为 OpenAI 兼容接口） */
const AI_CHAT_PROVIDERS = [
    { key: 'glm', label: '智谱 GLM · Coding Plan', baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4', defaultModel: 'glm-5.3', models: ['glm-5.3', 'glm-5.3-flash', 'glm-4.6'] },
    { key: 'glm-open', label: '智谱 GLM · 开放平台（按量付费）', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-5.3', models: ['glm-5.3', 'glm-5.2', 'glm-4.6'] },
    { key: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'] },
    { key: 'kimi', label: 'Kimi（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2-turbo-preview', models: ['kimi-k2-turbo-preview', 'kimi-k2-0711-preview'] },
    { key: 'ark', label: '火山方舟（豆包）', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: 'doubao-seed-1-6-250615', models: ['doubao-seed-1-6-250615', 'doubao-seed-1-6-flash-250815'] },
    { key: 'custom', label: '自定义', baseUrl: '', defaultModel: '', models: [] },
] as const;
type AiChatProviderKey = (typeof AI_CHAT_PROVIDERS)[number]['key'];

const AI_CHAT_PROVIDER_HINTS: Record<string, string> = {
    glm: 'GLM Coding Plan 套餐 Key 的专用端点（系统默认）；套餐额度只在此端点生效',
    'glm-open': '适用于开放平台按量付费 Key；Coding Plan 套餐 Key 在此端点会提示余额不足',
    deepseek: 'deepseek-chat 为对话模型，deepseek-reasoner 为深度推理模型',
    kimi: '国内站 Key 使用默认域名；国际站 Key 需把 Base URL 改为 https://api.moonshot.ai/v1（Key 与域名必须匹配）',
    ark: '与「图片生成」卡片共用火山方舟账号的 API Key；模型名也可填 ep- 开头的接入点 ID',
    custom: '填写任意 OpenAI 兼容服务的 Base URL、API Key 与模型名',
};

/** 历史配置没有 provider 时按 Base URL 反推；对不上但有自定义 URL 则视为 custom */
const inferAiChatProvider = (provider: string | undefined, baseUrl: string): AiChatProviderKey | '' => {
    if (provider && AI_CHAT_PROVIDERS.some((preset) => preset.key === provider)) {
        return provider as AiChatProviderKey;
    }
    const byUrl = AI_CHAT_PROVIDERS.find((preset) => preset.baseUrl && preset.baseUrl === baseUrl);
    if (byUrl) return byUrl.key;
    return baseUrl ? 'custom' : '';
};

const AI_ENDPOINT_FIELDS = [
    { key: 'analysisLite', label: '分析接入点 · lite（doubao-seed-2-0-lite）' },
    { key: 'analysisMini', label: '分析接入点 · mini（doubao-seed-2-0-mini）' },
    { key: 'analysisPro', label: '分析接入点 · pro（doubao-seed-2-0-pro）' },
    { key: 'generationDefault', label: '生成接入点（doubao-seedream-4.5）' },
    { key: 'generationLite', label: '生成接入点 · lite（doubao-seedream-5.0-lite）' },
] as const;

export const PersonalCenter: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>(() => window.location.hash.startsWith('#shopee') ? 'shopee' : 'profile');

    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [phone, setPhone] = useState(user?.phone || '');
    const [email, setEmail] = useState(user?.email || '');
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');
    const [saving, setSaving] = useState(false);
    const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [ycAppKey, setYcAppKey] = useState('');
    const [ycAppSecret, setYcAppSecret] = useState('');
    const [ycSecretConfigured, setYcSecretConfigured] = useState(false);
    const [ycEnvironmentConfigured, setYcEnvironmentConfigured] = useState(false);
    const [showYcSecret, setShowYcSecret] = useState(false);
    const [ycLoading, setYcLoading] = useState(true);
    const [ycSaving, setYcSaving] = useState(false);
    const [ycMsg, setYcMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // AI 服务配置（全系统 AI 功能共用：个人优先，环境变量回退）
    const [aiChatProvider, setAiChatProvider] = useState<AiChatProviderKey | ''>('');
    const [aiChatBaseUrl, setAiChatBaseUrl] = useState('');
    const [aiChatApiKey, setAiChatApiKey] = useState('');
    const [aiChatModel, setAiChatModel] = useState('');
    const [aiChatKeyConfigured, setAiChatKeyConfigured] = useState(false);
    const [aiChatEnvConfigured, setAiChatEnvConfigured] = useState(false);
    const [aiImageBaseUrl, setAiImageBaseUrl] = useState('');
    const [aiImageApiKey, setAiImageApiKey] = useState('');
    const [aiImageKeyConfigured, setAiImageKeyConfigured] = useState(false);
    const [aiImageEnvConfigured, setAiImageEnvConfigured] = useState(false);
    const [aiEndpoints, setAiEndpoints] = useState({
        analysisLite: '', analysisMini: '', analysisPro: '', generationDefault: '', generationLite: '',
    });
    const [aiEnvEndpoints, setAiEnvEndpoints] = useState<Record<string, boolean>>({});
    const [showAiEndpoints, setShowAiEndpoints] = useState(false);
    const [showAiChatKey, setShowAiChatKey] = useState(false);
    const [showAiImageKey, setShowAiImageKey] = useState(false);
    const [aiLoading, setAiLoading] = useState(true);
    const [aiSaving, setAiSaving] = useState(false);
    const [aiMsg, setAiMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showOldPwd, setShowOldPwd] = useState(false);
    const [showNewPwd, setShowNewPwd] = useState(false);
    const [pwdSaving, setPwdSaving] = useState(false);
    const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (user) {
            setDisplayName(user.displayName || '');
            setPhone(user.phone || '');
            setEmail(user.email || '');
            setAvatarUrl(user.avatar || '');
        }
    }, [user]);

    useEffect(() => {
        let cancelled = false;
        const loadYcCredentials = async () => {
            setYcLoading(true);
            try {
                const response = await api.get('/users/me/yc-credentials');
                if (cancelled) return;
                setYcAppKey(response.data.appKey || '');
                setYcSecretConfigured(Boolean(response.data.appSecretConfigured));
                setYcEnvironmentConfigured(Boolean(response.data.environmentConfigured));
                setYcAppSecret(response.data.appSecretConfigured ? YC_SECRET_MASK : '');
            } catch (error: any) {
                if (!cancelled) {
                    setYcMsg({
                        type: 'error',
                        text: error.response?.data?.error || '获取元仓配置失败',
                    });
                }
            } finally {
                if (!cancelled) setYcLoading(false);
            }
        };
        void loadYcCredentials();
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    useEffect(() => {
        let cancelled = false;
        const applyAiConfig = (data: any) => {
            const chat = data?.chat ?? {};
            const image = data?.image ?? {};
            setAiChatBaseUrl(chat.baseUrl || '');
            setAiChatModel(chat.model || '');
            setAiChatProvider(inferAiChatProvider(chat.provider, chat.baseUrl || ''));
            setAiChatKeyConfigured(Boolean(chat.apiKeyConfigured));
            setAiChatEnvConfigured(Boolean(chat.environmentConfigured));
            setAiChatApiKey(chat.apiKeyConfigured ? AI_KEY_MASK : '');
            setAiImageBaseUrl(image.baseUrl || '');
            setAiImageKeyConfigured(Boolean(image.apiKeyConfigured));
            setAiImageEnvConfigured(Boolean(image.environmentConfigured));
            setAiImageApiKey(image.apiKeyConfigured ? AI_KEY_MASK : '');
            setAiEndpoints({
                analysisLite: '', analysisMini: '', analysisPro: '', generationDefault: '', generationLite: '',
                ...(image.endpoints ?? {}),
            });
            setAiEnvEndpoints(image.environmentEndpoints ?? {});
        };
        const loadAiConfig = async () => {
            setAiLoading(true);
            try {
                const response = await api.get('/users/me/ai-config');
                if (cancelled) return;
                applyAiConfig(response.data);
            } catch (error: any) {
                if (!cancelled) {
                    setAiMsg({
                        type: 'error',
                        text: error.response?.data?.error || '获取 AI 配置失败',
                    });
                }
            } finally {
                if (!cancelled) setAiLoading(false);
            }
        };
        void loadAiConfig();
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setProfileMsg({ type: 'error', text: '请选择图片文件' });
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setProfileMsg({ type: 'error', text: '图片大小不能超过2MB' });
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            setAvatarUrl(base64);
        };
        reader.readAsDataURL(file);
    };

    const handleSaveProfile = async () => {
        setSaving(true);
        setProfileMsg(null);
        try {
            await api.put('/users/me/profile', {
                displayName,
                phone: phone || null,
                email: email || null,
                avatar: avatarUrl || null,
            });
            await refreshUser();
            setProfileMsg({ type: 'success', text: '个人信息已保存' });
        } catch (error: any) {
            setProfileMsg({ type: 'error', text: error.response?.data?.error || '保存失败' });
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async () => {
        setPwdMsg(null);
        if (!oldPassword) {
            setPwdMsg({ type: 'error', text: '请输入当前密码' });
            return;
        }
        if (newPassword.length < 6) {
            setPwdMsg({ type: 'error', text: '新密码长度至少6位' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setPwdMsg({ type: 'error', text: '两次输入的新密码不一致' });
            return;
        }
        setPwdSaving(true);
        try {
            await api.put('/users/me/password', { oldPassword, newPassword });
            setPwdMsg({ type: 'success', text: '密码修改成功' });
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            setPwdMsg({ type: 'error', text: error.response?.data?.error || '修改失败' });
        } finally {
            setPwdSaving(false);
        }
    };

    const handleSaveYcCredentials = async () => {
        setYcSaving(true);
        setYcMsg(null);
        try {
            const response = await api.put('/users/me/yc-credentials', {
                appKey: ycAppKey,
                ...(ycAppSecret === YC_SECRET_MASK ? {} : { appSecret: ycAppSecret }),
            });
            const secretConfigured = Boolean(response.data.appSecretConfigured);
            setYcAppKey(response.data.appKey || '');
            setYcSecretConfigured(secretConfigured);
            setYcEnvironmentConfigured(Boolean(response.data.environmentConfigured));
            setYcAppSecret(secretConfigured ? YC_SECRET_MASK : '');
            setYcMsg({
                type: 'success',
                text: response.data.appKey || secretConfigured
                    ? '元仓配置已保存'
                    : '已改用服务器环境变量中的元仓配置',
            });
        } catch (error: any) {
            setYcMsg({ type: 'error', text: error.response?.data?.error || '保存元仓配置失败' });
        } finally {
            setYcSaving(false);
        }
    };

    /** 选择预设服务商：自动填充 Base URL 与默认模型（仍可手改）；自定义则保留现值 */
    const handleAiProviderChange = (key: AiChatProviderKey) => {
        setAiChatProvider(key);
        if (key === 'custom') return;
        const preset = AI_CHAT_PROVIDERS.find((item) => item.key === key);
        if (preset) {
            setAiChatBaseUrl(preset.baseUrl);
            setAiChatModel(preset.defaultModel);
        }
    };

    const handleSaveAiConfig = async () => {
        setAiSaving(true);
        setAiMsg(null);
        try {
            const response = await api.put('/users/me/ai-config', {
                chat: {
                    provider: aiChatProvider,
                    baseUrl: aiChatBaseUrl.trim(),
                    model: aiChatModel.trim(),
                    ...(aiChatApiKey === AI_KEY_MASK ? {} : { apiKey: aiChatApiKey.trim() }),
                },
                image: {
                    baseUrl: aiImageBaseUrl.trim(),
                    ...(aiImageApiKey === AI_KEY_MASK ? {} : { apiKey: aiImageApiKey.trim() }),
                    endpoints: {
                        analysisLite: aiEndpoints.analysisLite.trim(),
                        analysisMini: aiEndpoints.analysisMini.trim(),
                        analysisPro: aiEndpoints.analysisPro.trim(),
                        generationDefault: aiEndpoints.generationDefault.trim(),
                        generationLite: aiEndpoints.generationLite.trim(),
                    },
                },
            });
            const chat = response.data?.chat ?? {};
            const image = response.data?.image ?? {};
            setAiChatBaseUrl(chat.baseUrl || '');
            setAiChatModel(chat.model || '');
            setAiChatProvider(inferAiChatProvider(chat.provider, chat.baseUrl || ''));
            setAiChatKeyConfigured(Boolean(chat.apiKeyConfigured));
            setAiChatEnvConfigured(Boolean(chat.environmentConfigured));
            setAiChatApiKey(chat.apiKeyConfigured ? AI_KEY_MASK : '');
            setAiImageBaseUrl(image.baseUrl || '');
            setAiImageKeyConfigured(Boolean(image.apiKeyConfigured));
            setAiImageEnvConfigured(Boolean(image.environmentConfigured));
            setAiImageApiKey(image.apiKeyConfigured ? AI_KEY_MASK : '');
            setAiEndpoints({
                analysisLite: '', analysisMini: '', analysisPro: '', generationDefault: '', generationLite: '',
                ...(image.endpoints ?? {}),
            });
            setAiMsg({ type: 'success', text: 'AI 配置已保存' });
        } catch (error: any) {
            setAiMsg({ type: 'error', text: error.response?.data?.error || '保存 AI 配置失败' });
        } finally {
            setAiSaving(false);
        }
    };

    const getRoleLabel = (role: string) => {
        switch (role) {
            case 'owner': return '超级管理员';
            case 'admin': return '管理员';
            case 'viewer': return '查看者';
            default: return role;
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-800">个人中心</h2>
                <p className="text-slate-500 mt-1">管理您的账户信息与安全设置</p>
            </div>

            <div className="flex gap-2 mb-6 border-b border-slate-200 flex-wrap">
                {(['profile', 'ai', 'yc', 'password', ...(user?.role === 'owner' ? ['shopee'] : [])] as TabType[]).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => { setActiveTab(tab); setProfileMsg(null); setPwdMsg(null); setAiMsg(null); setYcMsg(null); }}
                        className={`px-5 py-3 text-sm font-medium border-b-2 transition-all ${
                            activeTab === tab
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        {tab === 'profile' ? '基本信息' : tab === 'ai' ? 'AI 服务' : tab === 'yc' ? '元仓开放平台' : tab === 'password' ? '修改密码' : 'Shopee 店铺授权'}
                    </button>
                ))}
            </div>

            {activeTab === 'shopee' && user?.role === 'owner' && <ShopeeConnections />}
            {activeTab === 'profile' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
                    {profileMsg && (
                        <div className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
                            profileMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                            {profileMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                            {profileMsg.text}
                        </div>
                    )}

                    <div className="flex flex-col md:flex-row gap-8">
                        <div className="flex flex-col items-center gap-3">
                            <div className="relative group">
                                <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-indigo-400 to-purple-400 flex items-center justify-center text-white text-4xl font-bold shadow-lg overflow-hidden">
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt="头像" className="w-full h-full object-cover" />
                                    ) : (
                                        user?.displayName?.charAt(0) || 'U'
                                    )}
                                </div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                >
                                    <Camera size={24} className="text-white" />
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleAvatarChange}
                                    className="hidden"
                                />
                            </div>
                            <span className="text-xs text-slate-400">点击更换头像</span>
                        </div>

                        <div className="flex-1 space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1.5">用户名</label>
                                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 rounded-xl text-slate-400 border border-slate-100">
                                    <User size={16} />
                                    <span>{user?.username}</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1.5">角色</label>
                                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 rounded-xl text-slate-400 border border-slate-100">
                                    <span>{getRoleLabel(user?.role || '')}</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                                    显示名称 <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none"
                                    placeholder="请输入显示名称"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1.5">手机号码</label>
                                <div className="relative">
                                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none"
                                        placeholder="请输入手机号码"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1.5">邮箱地址</label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none"
                                        placeholder="请输入邮箱地址"
                                    />
                                </div>
                            </div>

                            <div className="pt-2">
                                <button
                                    onClick={handleSaveProfile}
                                    disabled={saving || !displayName.trim()}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 text-white rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow-md"
                                >
                                    <Save size={16} />
                                    {saving ? '保存中...' : '保存修改'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'yc' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="p-2.5 bg-indigo-50 rounded-xl">
                            <KeyRound size={20} className="text-indigo-500" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-800">元仓开放平台</h3>
                            <p className="text-xs text-slate-400">
                                个人配置优先；清空并保存后使用服务器环境变量
                            </p>
                        </div>
                    </div>

                        {ycMsg && (
                            <div className={`mb-5 flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
                                ycMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                            }`}>
                                {ycMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                {ycMsg.text}
                            </div>
                        )}

                        <div className="space-y-5 max-w-xl">
                            <div>
                                <label htmlFor="yc-app-key" className="block text-sm font-medium text-slate-600 mb-1.5">
                                    元仓 appKey
                                </label>
                                <input
                                    id="yc-app-key"
                                    type="text"
                                    value={ycAppKey}
                                    onChange={(e) => setYcAppKey(e.target.value)}
                                    disabled={ycLoading || ycSaving}
                                    autoComplete="off"
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none disabled:bg-slate-50"
                                    placeholder="留空则使用 YC_APP_KEY"
                                />
                            </div>

                            <div>
                                <label htmlFor="yc-app-secret" className="block text-sm font-medium text-slate-600 mb-1.5">
                                    元仓 appSecret
                                </label>
                                <div className="relative">
                                    <input
                                        id="yc-app-secret"
                                        type={showYcSecret ? 'text' : 'password'}
                                        value={ycAppSecret}
                                        onChange={(e) => setYcAppSecret(e.target.value)}
                                        onFocus={(e) => {
                                            if (ycAppSecret === YC_SECRET_MASK) e.currentTarget.select();
                                        }}
                                        disabled={ycLoading || ycSaving}
                                        autoComplete="new-password"
                                        className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none disabled:bg-slate-50"
                                        placeholder="留空则使用 YC_APP_SECRET"
                                    />
                                    <button
                                        type="button"
                                        aria-label={showYcSecret ? '隐藏元仓 appSecret' : '显示元仓 appSecret'}
                                        onClick={() => setShowYcSecret(!showYcSecret)}
                                        disabled={ycLoading || ycSaving}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:text-slate-300"
                                    >
                                        {showYcSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                <p className="mt-1.5 text-xs text-slate-400">
                                    {ycSecretConfigured
                                        ? '已保存个人 appSecret；删除圆点后留空保存可恢复环境变量'
                                        : ycEnvironmentConfigured
                                            ? '当前服务器环境变量中已有可用凭据'
                                            : '当前尚未配置个人或服务器 appSecret'}
                                </p>
                            </div>

                            <div className="pt-1">
                                <button
                                    onClick={handleSaveYcCredentials}
                                    disabled={ycLoading || ycSaving}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 text-white rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow-md"
                                >
                                    <Save size={16} />
                                    {ycSaving ? '保存中...' : '保存元仓配置'}
                                </button>
                            </div>
                        </div>
                </div>
            )}

            {activeTab === 'ai' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="p-2.5 bg-indigo-50 rounded-xl">
                            <Sparkles size={20} className="text-indigo-500" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-800">AI 服务配置</h3>
                            <p className="text-xs text-slate-400">
                                全系统 AI 功能（商品分析对话、图片制作）优先使用个人配置；留空项回退服务器环境变量
                            </p>
                        </div>
                    </div>

                        {aiMsg && (
                            <div className={`mb-5 flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
                                aiMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                            }`}>
                                {aiMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                {aiMsg.text}
                            </div>
                        )}

                        <div className="space-y-6 max-w-xl">
                            <div className="rounded-xl border border-slate-100 p-4 space-y-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <MessageSquare size={15} className="text-slate-400" />
                                    对话模型（商品分析 AI · OpenAI 兼容接口）
                                </div>
                                <div>
                                    <label htmlFor="ai-chat-provider" className="block text-sm font-medium text-slate-600 mb-1.5">
                                        服务商
                                    </label>
                                    <select
                                        id="ai-chat-provider"
                                        value={aiChatProvider}
                                        onChange={(e) => handleAiProviderChange(e.target.value as AiChatProviderKey)}
                                        disabled={aiLoading || aiSaving}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none disabled:bg-slate-50"
                                    >
                                        <option value="">请选择（或直接手动填写下方配置）</option>
                                        {AI_CHAT_PROVIDERS.map((preset) => (
                                            <option key={preset.key} value={preset.key}>{preset.label}</option>
                                        ))}
                                    </select>
                                    <p className="mt-1.5 text-xs text-slate-400">
                                        {AI_CHAT_PROVIDER_HINTS[aiChatProvider] || '选择服务商后自动填充推荐配置，商品分析 AI 对话将使用该配置'}
                                    </p>
                                </div>
                                <div>
                                    <label htmlFor="ai-chat-base-url" className="block text-sm font-medium text-slate-600 mb-1.5">
                                        对话模型 Base URL
                                    </label>
                                    <input
                                        id="ai-chat-base-url"
                                        type="text"
                                        value={aiChatBaseUrl}
                                        onChange={(e) => setAiChatBaseUrl(e.target.value)}
                                        disabled={aiLoading || aiSaving}
                                        autoComplete="off"
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none disabled:bg-slate-50"
                                        placeholder="默认 https://open.bigmodel.cn/api/coding/paas/v4"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="ai-chat-api-key" className="block text-sm font-medium text-slate-600 mb-1.5">
                                        对话模型 API Key
                                    </label>
                                    <div className="relative">
                                        <input
                                            id="ai-chat-api-key"
                                            type={showAiChatKey ? 'text' : 'password'}
                                            value={aiChatApiKey}
                                            onChange={(e) => setAiChatApiKey(e.target.value)}
                                            onFocus={(e) => {
                                                if (aiChatApiKey === AI_KEY_MASK) e.currentTarget.select();
                                            }}
                                            disabled={aiLoading || aiSaving}
                                            autoComplete="new-password"
                                            className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none disabled:bg-slate-50"
                                            placeholder="留空则使用服务器 GLM_API_KEY"
                                        />
                                        <button
                                            type="button"
                                            aria-label={showAiChatKey ? '隐藏对话模型 API Key' : '显示对话模型 API Key'}
                                            onClick={() => setShowAiChatKey(!showAiChatKey)}
                                            disabled={aiLoading || aiSaving}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:text-slate-300"
                                        >
                                            {showAiChatKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <p className="mt-1.5 text-xs text-slate-400">
                                        {aiChatKeyConfigured
                                            ? '已保存个人 API Key；删除圆点后留空保存可恢复环境变量'
                                            : aiChatEnvConfigured
                                                ? '当前使用服务器环境变量中的 API Key'
                                                : '尚未配置个人或服务器 API Key，AI 对话将不可用'}
                                    </p>
                                </div>
                                <div>
                                    <label htmlFor="ai-chat-model" className="block text-sm font-medium text-slate-600 mb-1.5">
                                        模型名称
                                    </label>
                                    <input
                                        id="ai-chat-model"
                                        type="text"
                                        value={aiChatModel}
                                        list="ai-chat-model-options"
                                        onChange={(e) => setAiChatModel(e.target.value)}
                                        disabled={aiLoading || aiSaving}
                                        autoComplete="off"
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none disabled:bg-slate-50"
                                        placeholder="默认 glm-5.3-flash"
                                    />
                                    <datalist id="ai-chat-model-options">
                                        {(aiChatProvider && aiChatProvider !== 'custom'
                                            ? AI_CHAT_PROVIDERS.find((preset) => preset.key === aiChatProvider)?.models ?? []
                                            : AI_CHAT_PROVIDERS.flatMap((preset) => [...preset.models])
                                        ).map((model) => (
                                            <option key={model} value={model} />
                                        ))}
                                    </datalist>
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-100 p-4 space-y-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <ImageIcon size={15} className="text-slate-400" />
                                    图片生成（图片制作 · 火山方舟）
                                </div>
                                <div>
                                    <label htmlFor="ai-image-api-key" className="block text-sm font-medium text-slate-600 mb-1.5">
                                        图片生成 API Key
                                    </label>
                                    <div className="relative">
                                        <input
                                            id="ai-image-api-key"
                                            type={showAiImageKey ? 'text' : 'password'}
                                            value={aiImageApiKey}
                                            onChange={(e) => setAiImageApiKey(e.target.value)}
                                            onFocus={(e) => {
                                                if (aiImageApiKey === AI_KEY_MASK) e.currentTarget.select();
                                            }}
                                            disabled={aiLoading || aiSaving}
                                            autoComplete="new-password"
                                            className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none disabled:bg-slate-50"
                                            placeholder="留空则使用服务器 ARK_API_KEY"
                                        />
                                        <button
                                            type="button"
                                            aria-label={showAiImageKey ? '隐藏图片生成 API Key' : '显示图片生成 API Key'}
                                            onClick={() => setShowAiImageKey(!showAiImageKey)}
                                            disabled={aiLoading || aiSaving}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:text-slate-300"
                                        >
                                            {showAiImageKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <p className="mt-1.5 text-xs text-slate-400">
                                        {aiImageKeyConfigured
                                            ? '已保存个人 API Key；删除圆点后留空保存可恢复环境变量'
                                            : aiImageEnvConfigured
                                                ? '当前使用服务器环境变量中的 API Key'
                                                : '尚未配置个人或服务器 API Key，图片生成类功能将不可用'}
                                    </p>
                                </div>
                                <div>
                                    <label htmlFor="ai-image-base-url" className="block text-sm font-medium text-slate-600 mb-1.5">
                                        图片生成 Base URL
                                    </label>
                                    <input
                                        id="ai-image-base-url"
                                        type="text"
                                        value={aiImageBaseUrl}
                                        onChange={(e) => setAiImageBaseUrl(e.target.value)}
                                        disabled={aiLoading || aiSaving}
                                        autoComplete="off"
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none disabled:bg-slate-50"
                                        placeholder="默认 https://ark.cn-beijing.volces.com/api/v3"
                                    />
                                </div>
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setShowAiEndpoints(!showAiEndpoints)}
                                        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                                    >
                                        {showAiEndpoints ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                        接入点高级设置（使用自己的方舟账号时需要填写）
                                    </button>
                                    {showAiEndpoints && (
                                        <div className="mt-3 space-y-3">
                                            {AI_ENDPOINT_FIELDS.map((field) => (
                                                <div key={field.key}>
                                                    <label htmlFor={`ai-endpoint-${field.key}`} className="block text-sm font-medium text-slate-600 mb-1.5">
                                                        {field.label}
                                                    </label>
                                                    <input
                                                        id={`ai-endpoint-${field.key}`}
                                                        type="text"
                                                        value={aiEndpoints[field.key]}
                                                        onChange={(e) => setAiEndpoints((current) => ({ ...current, [field.key]: e.target.value }))}
                                                        disabled={aiLoading || aiSaving}
                                                        autoComplete="off"
                                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none disabled:bg-slate-50"
                                                        placeholder={aiEnvEndpoints[field.key] ? '留空使用服务器配置的接入点' : '服务器未配置，使用个人 Key 时需填写（ep- 开头）'}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="pt-1">
                                <button
                                    onClick={handleSaveAiConfig}
                                    disabled={aiLoading || aiSaving}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 text-white rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow-md"
                                >
                                    <Save size={16} />
                                    {aiSaving ? '保存中...' : '保存 AI 配置'}
                                </button>
                            </div>
                        </div>
                </div>
            )}

            {activeTab === 'password' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-amber-50 rounded-xl">
                            <Lock size={20} className="text-amber-500" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-800">修改密码</h3>
                            <p className="text-xs text-slate-400">修改密码后需要重新登录</p>
                        </div>
                    </div>

                    {pwdMsg && (
                        <div className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
                            pwdMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                            {pwdMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                            {pwdMsg.text}
                        </div>
                    )}

                    <div className="space-y-5 max-w-md">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">当前密码</label>
                            <div className="relative">
                                <input
                                    type={showOldPwd ? 'text' : 'password'}
                                    value={oldPassword}
                                    onChange={(e) => setOldPassword(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none pr-10"
                                    placeholder="请输入当前密码"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowOldPwd(!showOldPwd)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showOldPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">新密码</label>
                            <div className="relative">
                                <input
                                    type={showNewPwd ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none pr-10"
                                    placeholder="新密码至少6位"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPwd(!showNewPwd)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">确认新密码</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none"
                                placeholder="再次输入新密码"
                            />
                        </div>

                        <div className="pt-2">
                            <button
                                onClick={handleChangePassword}
                                disabled={pwdSaving || !oldPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                                className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow-md"
                            >
                                <Lock size={16} />
                                {pwdSaving ? '修改中...' : '修改密码'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
