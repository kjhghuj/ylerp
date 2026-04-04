import React, { useState } from 'react';
import { X, KeyRound, Eye, EyeOff } from 'lucide-react';

interface ResetPasswordModalProps {
    username: string;
    onClose: () => void;
    onSubmit: (newPassword: string) => Promise<void>;
    error: string;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ username, onClose, onSubmit, error }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPwd, setShowPwd] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword.length < 6) return;
        if (newPassword !== confirmPassword) return;
        setLoading(true);
        try {
            await onSubmit(newPassword);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                            <KeyRound size={20} className="text-amber-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800">重置密码</h3>
                            <p className="text-sm text-slate-500">用户: {username}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">新密码</label>
                        <div className="relative">
                            <input
                                type={showPwd ? 'text' : 'password'}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="至少6位"
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 pr-10"
                                required
                                minLength={6}
                            />
                            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">确认新密码</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="再次输入新密码"
                            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            required
                            minLength={6}
                        />
                        {confirmPassword && newPassword !== confirmPassword && (
                            <p className="text-red-500 text-xs mt-1">两次密码不一致</p>
                        )}
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors">
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={loading || newPassword.length < 6 || newPassword !== confirmPassword}
                            className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? '重置中...' : '确认重置'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
