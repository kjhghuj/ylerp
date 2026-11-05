import React, { useRef, useState } from 'react';
import { PermissionTree, getAllPermissionKeys } from '../../components/PermissionTree';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { FormSelect } from '../../components/FormSelect';
import { ModalFrame } from './ModalFrame';
interface CreateModalProps {
  onClose: () => void;
  onSubmit: (form: { username: string; password: string; displayName: string; role: string; permissions: string[] }) => void;
  error: string;
}
export const CreateUserModal: React.FC<CreateModalProps> = ({ onClose, onSubmit, error }) => {
  const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'viewer', permissions: getAllPermissionKeys() });
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setSaving(true);
    try { await onSubmit(form); } catch { /* Parent supplies the visible error prop; retain the entered values. */ } finally { lock.current = false; setSaving(false); }
  };
  return <ModalFrame title="添加子账户" description="设置登录信息、角色及功能权限" onClose={onClose} busy={saving}><form className="space-y-4" onSubmit={event => void submit(event)}>
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-danger">{error}</p>}
    <div className="space-y-2"><Label htmlFor="create-username">用户名 *</Label><Input id="create-username" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder="登录用户名" autoComplete="off" /></div>
    <div className="space-y-2"><Label htmlFor="create-name">显示名称 *</Label><Input id="create-name" value={form.displayName} onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))} placeholder="显示名称" /></div>
    <div className="space-y-2"><Label htmlFor="create-password">密码 *</Label><Input id="create-password" type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="至少6位" autoComplete="new-password" /></div>
    <div className="space-y-2"><Label htmlFor="create-role">角色</Label><FormSelect id="create-role" value={form.role} options={[{ value: 'admin', label: '管理员 — 可操作所有功能' }, { value: 'viewer', label: '查看者 — 仅查看数据' }]} onValueChange={value => setForm(p => ({ ...p, role: value }))} /></div>
    <div className="space-y-2"><Label>功能权限</Label><PermissionTree selected={form.permissions} onChange={permissions => setForm(p => ({ ...p, permissions }))} /></div>
    <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="outline" onClick={onClose} disabled={saving}>取消</Button><Button type="submit" disabled={saving}>{saving ? '创建中...' : '创建账户'}</Button></div>
  </form></ModalFrame>;
};


