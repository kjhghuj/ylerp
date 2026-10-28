import React, { useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ModalFrame } from './ModalFrame';
interface ChangePasswordModalProps { onClose: () => void; onSubmit: (oldPassword: string, newPassword: string) => Promise<void>; error: string; }
export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose, onSubmit, error }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const lock = useRef(false);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current || !oldPassword || newPassword.length < 6 || newPassword !== confirmPassword) return;
    lock.current = true; setLoading(true);
    try { await onSubmit(oldPassword, newPassword); } catch { /* Parent supplies the visible error prop; retain the entered values. */ } finally { lock.current = false; setLoading(false); }
  };
  return <ModalFrame title="修改密码" description="验证当前密码后设置新的登录密码" onClose={onClose} busy={loading}><form onSubmit={event => void handleSubmit(event)} className="space-y-4">
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-danger">{error}</p>}
    <div className="space-y-2"><Label htmlFor="change-old-password">当前密码</Label><Input id="change-old-password" type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="输入当前密码" required autoComplete="current-password" /></div>
    <div className="space-y-2"><Label htmlFor="change-new-password">新密码</Label><div className="relative"><Input id="change-new-password" type={showPwd ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="至少6位" className="pr-10" required minLength={6} autoComplete="new-password" /><Button variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowPwd(value => !value)} aria-label={showPwd ? '隐藏密码' : '显示密码'}>{showPwd ? <EyeOff /> : <Eye />}</Button></div></div>
    <div className="space-y-2"><Label htmlFor="change-confirm-password">确认新密码</Label><Input id="change-confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="再次输入新密码" required minLength={6} autoComplete="new-password" />{confirmPassword && newPassword !== confirmPassword && <p className="text-xs text-danger">两次密码不一致</p>}</div>
    <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="outline" onClick={onClose} disabled={loading}>取消</Button><Button type="submit" disabled={loading || !oldPassword || newPassword.length < 6 || newPassword !== confirmPassword}>{loading ? '修改中...' : '确认修改'}</Button></div>
  </form></ModalFrame>;
};


