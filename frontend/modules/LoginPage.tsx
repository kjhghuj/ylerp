import React, { useRef, useState } from 'react';
import { useAuth } from '../AuthContext';
import { Lock, User, Eye, EyeOff, ArrowRight, Package, Globe, BarChart3, Shield, Sun, Moon } from 'lucide-react';
import { version } from '../package.json';
import { useThemePreference } from '../hooks/useThemePreference';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [darkMode, setDarkMode] = useThemePreference();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const submitting = useRef(false);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    if (!username.trim() || !password.trim()) { setError('请输入用户名和密码'); return; }
    submitting.current = true;
    setIsLoading(true);
    setError('');
    try {
      const result = await login(username, password);
      if (!result.success) setError(result.error || '登录失败');
    } catch { setError('登录失败，请检查网络后重试'); }
    finally { submitting.current = false; setIsLoading(false); }
  };
  const features = [{ icon: Package, text: '多平台商品管理' }, { icon: BarChart3, text: '精准利润计算' }, { icon: Globe, text: '跨境全链路覆盖' }, { icon: Shield, text: '数据安全可靠' }];
  return <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-2">
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex xl:p-16">
      <div className="flex items-center gap-3"><img src="/logo.png" alt="阳零 ERP" className="h-10 w-10 object-contain" /><span className="text-xl font-semibold tracking-tight">阳零 ERP</span></div>
      <div className="max-w-lg space-y-8"><div><p className="mb-4 text-sm font-medium tracking-wide text-blue-300">YangLing Cross-border ERP</p><h2 className="text-4xl font-semibold leading-tight xl:text-5xl">让跨境经营<br /><span className="text-blue-300">更清晰，更高效</span></h2><p className="mt-5 max-w-md text-base leading-relaxed text-white/80">一站式管理商品、利润、库存、定价等核心业务流程。</p></div><div className="grid grid-cols-2 gap-4">{features.map(({ icon: Icon, text }) => <div key={text} className="flex items-center gap-2 text-sm text-white/90"><Icon className="h-4 w-4 shrink-0 text-blue-300" />{text}</div>)}</div></div>
      <p className="text-xs text-white/60">v{version} · © {new Date().getFullYear()} 阳零科技</p>
    </aside>
    <main className="relative flex min-h-screen items-center justify-center px-5 py-16 sm:px-8">
      <Button variant="ghost" size="icon" className="absolute right-5 top-5 text-muted-foreground" onClick={() => setDarkMode(value => !value)} aria-label={darkMode ? '切换到浅色模式' : '切换到深色模式'}>{darkMode ? <Sun /> : <Moon />}</Button>
      <div className="w-full max-w-md"><div className="mb-6 flex items-center gap-2 lg:hidden"><img src="/logo.png" alt="阳零 ERP" className="h-8 w-8 object-contain" /><span className="text-lg font-semibold">阳零 ERP</span></div>
        <Card className="shadow-sm"><CardHeader className="space-y-2 pb-6"><CardTitle className="text-2xl"><h1>欢迎回来</h1></CardTitle><CardDescription>登录以继续使用系统</CardDescription></CardHeader><CardContent>
          {error && <Alert variant="destructive" className="mb-5"><AlertDescription>{error}</AlertDescription></Alert>}
          <form onSubmit={handleSubmit} className="space-y-5" aria-busy={isLoading}>
            <div className="space-y-2"><Label htmlFor="login-username">用户名</Label><div className="relative"><User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="login-username" name="username" autoComplete="username" autoFocus value={username} onChange={event => setUsername(event.target.value)} placeholder="请输入用户名" className="h-11 pl-10" /></div></div>
            <div className="space-y-2"><Label htmlFor="login-password">密码</Label><div className="relative"><Lock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="login-password" name="password" autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="请输入密码" className="h-11 pl-10 pr-12" /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-9 w-9 text-muted-foreground" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>{showPassword ? <EyeOff /> : <Eye />}</Button></div></div>
            <Button type="submit" disabled={isLoading} className="h-11 w-full">{isLoading ? '登录中…' : <>登录<ArrowRight /></>}</Button>
          </form>
        </CardContent></Card><p className="mt-5 text-center text-xs text-muted-foreground lg:hidden">v{version}</p>
      </div>
    </main>
  </div>;
};

