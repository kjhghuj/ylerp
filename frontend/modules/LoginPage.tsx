import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { Lock, User, Eye, EyeOff, ArrowRight, AlertCircle, Package, Globe, BarChart3, Shield } from 'lucide-react';
import { version } from '../package.json';

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

    const features = [
        { icon: Package, text: '多平台商品管理' },
        { icon: BarChart3, text: '精准利润计算' },
        { icon: Globe, text: '跨境全链路覆盖' },
        { icon: Shield, text: '数据安全可靠' },
    ];

    return (
        <div className="min-h-screen flex bg-slate-50">
            {/* Left Brand Panel */}
            <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950">
                <div className="absolute inset-0">
                    <div className="absolute top-[15%] left-[10%] w-72 h-72 rounded-full bg-blue-500/8 blur-[80px]"></div>
                    <div className="absolute bottom-[10%] right-[15%] w-96 h-96 rounded-full bg-indigo-500/8 blur-[100px]"></div>
                    <div className="absolute top-[50%] left-[50%] w-64 h-64 rounded-full bg-cyan-500/5 blur-[60px]"></div>
                </div>

                <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}></div>

                <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                                <Package size={20} className="text-white" />
                            </div>
                            <span className="text-xl font-black text-white tracking-tight">阳零 ERP</span>
                        </div>
                        <p className="text-blue-300/50 text-sm ml-[52px] -mt-1">YangLing Cross-border ERP</p>
                    </div>

                    <div className="space-y-8">
                        <div>
                            <h2 className="text-4xl xl:text-5xl font-black text-white leading-tight">
                                全链路<br />
                                <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent">跨境电商</span><br />
                                管理系统
                            </h2>
                            <p className="text-blue-200/40 text-base mt-4 leading-relaxed max-w-md">
                                一站式管理商品、利润、库存、定价等核心业务流程，助力跨境业务高效运转。
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 max-w-md">
                            {features.map((feat, i) => (
                                <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm">
                                    <feat.icon size={18} className="text-blue-400/70 shrink-0" />
                                    <span className="text-sm font-semibold text-blue-100/70">{feat.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <p className="text-blue-300/30 text-xs">v{version}</p>
                        <p className="text-blue-300/20 text-xs">&copy; {new Date().getFullYear()} 阳零科技</p>
                    </div>
                </div>
            </div>

            {/* Right Form Panel */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12">
                <div className={`w-full max-w-sm ${shake ? 'animate-shake' : ''}`}>
                    <div className="lg:hidden flex items-center gap-2.5 mb-10">
                        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20">
                            <Package size={18} className="text-white" />
                        </div>
                        <span className="text-lg font-black text-slate-800 tracking-tight">阳零 ERP</span>
                    </div>

                    <div className="mb-8">
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">欢迎回来</h1>
                        <p className="text-slate-400 text-sm mt-1.5">登录以继续使用系统</p>
                    </div>

                    {error && (
                        <div className="mb-5 flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-200/80 rounded-xl text-red-600 text-sm font-medium">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">用户名</label>
                            <div className="relative">
                                <User size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="请输入用户名"
                                    className="w-full h-12 rounded-xl bg-white border border-slate-200 pl-11 pr-4 text-slate-700 placeholder-slate-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-[15px] font-medium transition-all"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">密码</label>
                            <div className="relative">
                                <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="请输入密码"
                                    className="w-full h-12 rounded-xl bg-white border border-slate-200 pl-11 pr-12 text-slate-700 placeholder-slate-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-[15px] font-medium transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-12 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] text-[15px]"
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <span>登 录</span>
                                    <ArrowRight size={17} />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="lg:hidden text-center mt-8">
                        <p className="text-slate-300 text-xs">v{version}</p>
                    </div>
                </div>
            </div>

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
