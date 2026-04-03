import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { Lock, User, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [shake, setShake] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) {
            setError('请输入用户名和密码');
            triggerShake();
            return;
        }

        setIsLoading(true);
        setError('');

        const result = await login(username, password);

        if (!result.success) {
            setError(result.error || '登录失败');
            triggerShake();
        }

        setIsLoading(false);
    };

    const triggerShake = () => {
        setShake(true);
        setTimeout(() => setShake(false), 600);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 relative overflow-hidden">
            {/* Decorative Background */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/20 blur-[120px]"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/20 blur-[120px]"></div>
            <div className="absolute top-[30%] right-[20%] w-[30%] h-[30%] rounded-full bg-indigo-500/10 blur-[100px]"></div>

            {/* Login Card */}
            <div className={`relative w-full max-w-md mx-4 transform transition-all duration-300 ${shake ? 'animate-shake' : ''}`}>
                <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl p-8 md:p-10">
                    {/* Logo & Title */}
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-blue-500/30">
                            <Lock size={28} className="text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">阳零 ERP</h1>
                        <p className="text-blue-200/70 text-sm mt-1">全链路跨境电商管理系统</p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-5 flex items-center gap-2 px-4 py-3 bg-red-500/20 border border-red-400/30 rounded-xl text-red-200 text-sm">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-blue-200/70 text-xs font-semibold mb-1.5 uppercase tracking-wider">用户名</label>
                            <div className="relative">
                                <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-300/50" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="请输入用户名"
                                    className="w-full h-12 rounded-xl bg-white/10 border border-white/20 pl-11 pr-4 text-white placeholder-blue-300/40 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/20 text-base transition-all"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-blue-200/70 text-xs font-semibold mb-1.5 uppercase tracking-wider">密码</label>
                            <div className="relative">
                                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-300/50" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="请输入密码"
                                    className="w-full h-12 rounded-xl bg-white/10 border border-white/20 pl-11 pr-12 text-white placeholder-blue-300/40 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/20 text-base transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-blue-300/50 hover:text-blue-200 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-12 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] text-base"
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <span>登 录</span>
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </form>

                    <p className="text-center text-blue-300/40 text-xs mt-6">v1.0.2 正式版</p>
                </div>
            </div>

            {/* Shake animation */}
            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
                    20%, 40%, 60%, 80% { transform: translateX(6px); }
                }
                .animate-shake { animation: shake 0.5s ease-in-out; }
            `}</style>
        </div>
    );
};
