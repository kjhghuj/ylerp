import React, { useState } from 'react';
import { X, Lock, Eye, EyeOff } from 'lucide-react';
import api from '../../../src/api';

interface PasswordConfirmModalProps {
    title: string;
    description: string;
    onClose: () => void;
    onConfirm: () => void;
}

export const PasswordConfirmModal: React.FC<PasswordConfirmModalProps> = ({ title, description, onClose, onConfirm }) => {
    const [password, setPassword] = useState('');
    const [showPwd, setShowPwd] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/verify-password', { password });
            if (res.data.valid) {
                onConfirm();
                onClose();
            }
        } catch (err: any) {
            setError(err.response?.data?.error || '密码验证失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
                            <Lock size={20} className="text-rose-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
                            <p className="text-sm text-slate-500">{description}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">请输入密码确认操作</label>
                        <div className="relative">
                            <input
                                type={showPwd ? 'text' : 'password'}
                                value={password}
                                onChange={e => { setPassword(e.target.value); setError(''); }}
                                placeholder="输入登录密码"
                                autoFocus
                                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-100 transition"
                            />
                            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {error && <p className="text-xs text-rose-500 mt-1.5">{error}</p>}
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">
                            取消
                        </button>
                        <button type="submit" disabled={loading || !password} className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
                            {loading ? '验证中...' : '确认'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
