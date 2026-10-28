import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
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
    const passwordId = React.useId();
    const passwordRef = React.useRef<HTMLInputElement>(null);
    const [password, setPassword] = useState('');
    const [showPwd, setShowPwd] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const mountedRef = React.useRef(false);
    const verifyingRef = React.useRef(false);
    const verificationId = React.useRef(0);

    React.useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            verificationId.current += 1;
        };
    }, []);

    const handleClose = () => {
        if (verifyingRef.current) return;
        verificationId.current += 1;
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password || verifyingRef.current) return;
        verifyingRef.current = true;
        const requestId = ++verificationId.current;
        const isCurrent = () => mountedRef.current && requestId === verificationId.current;
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/verify-password', { password });
            if (!isCurrent()) return;
            if (res.data.valid) {
                onConfirm();
                onClose();
            }
        } catch (err: any) {
            if (isCurrent()) setError(err.response?.data?.error || '密码验证失败');
        } finally {
            if (isCurrent()) {
                verifyingRef.current = false;
                setLoading(false);
            }
        }
    };

    return (
        <Dialog open onOpenChange={open => { if (!open) handleClose(); }}>
            <DialogContent showCloseButton={false} onEscapeKeyDown={event => { if (verifyingRef.current) event.preventDefault(); }} onInteractOutside={event => { if (verifyingRef.current) event.preventDefault(); }} onOpenAutoFocus={event => { event.preventDefault(); passwordRef.current?.focus(); }} aria-label={title} className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm flex-col gap-0 overflow-hidden rounded-xl p-0">
                <div className="flex items-center justify-between p-5 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
                            <Lock size={20} className="text-danger" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-semibold text-foreground">{title}</DialogTitle>
                            <DialogDescription className="text-sm text-muted-foreground">{description}</DialogDescription>
                        </div>
                    </div>
                    <Button aria-label="关闭" variant="ghost" size="sm" disabled={loading} onClick={handleClose} className="p-2 hover:bg-muted rounded-xl transition text-muted-foreground hover:text-muted-foreground">
                        <X size={20} />
                    </Button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label htmlFor={passwordId} className="text-sm font-medium text-foreground mb-1.5 block">请输入密码确认操作</label>
                        <div className="relative">
                            <Input id={passwordId} ref={passwordRef} disabled={loading} aria-invalid={Boolean(error)} aria-describedby={error ? `${passwordId}-error` : undefined}
                                type={showPwd ? 'text' : 'password'}
                                value={password}
                                onChange={e => { setPassword(e.target.value); setError(''); }}
                                placeholder="输入登录密码"
                               
                                className="w-full px-4 py-2.5 pr-12 rounded-xl border border-border text-sm outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-100 transition"
                            />
                            <Button aria-label={showPwd ? "隐藏密码" : "显示密码"} variant="ghost" size="icon" type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground">
                                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                            </Button>
                        </div>
                        {error && <p role="alert" id={`${passwordId}-error`} className="text-xs text-danger mt-1.5">{error}</p>}
                    </div>

                    <div className="flex gap-3 pt-1">
                        <Button variant="ghost" size="sm" type="button" disabled={loading} onClick={handleClose} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-muted-foreground text-sm font-medium hover:bg-muted transition">
                            取消
                        </Button>
                        <Button variant="destructive" size="sm" type="submit" disabled={loading || !password} className="flex-1 px-4 py-2.5 text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed">
                            {loading ? '验证中...' : '确认'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
