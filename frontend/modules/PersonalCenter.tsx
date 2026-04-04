import React, { useState, useEffect, useRef } from 'react';
import { User, Phone, Mail, Camera, Save, Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../AuthContext';
import api from '../src/api';

type TabType = 'profile' | 'password';

export const PersonalCenter: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('profile');

    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [phone, setPhone] = useState(user?.phone || '');
    const [email, setEmail] = useState(user?.email || '');
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');
    const [saving, setSaving] = useState(false);
    const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

            <div className="flex gap-2 mb-6 border-b border-slate-200">
                {(['profile', 'password'] as TabType[]).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => { setActiveTab(tab); setProfileMsg(null); setPwdMsg(null); }}
                        className={`px-5 py-3 text-sm font-medium border-b-2 transition-all ${
                            activeTab === tab
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        {tab === 'profile' ? '基本信息' : '修改密码'}
                    </button>
                ))}
            </div>

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
