import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Button } from '../components/ui/button';
import { FormSelect } from '../components/FormSelect';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import api from '../src/api';
import { Users, UserPlus, Shield, ShieldCheck, Eye, Trash2, Key, CheckCircle, ToggleLeft, ToggleRight, Lock } from 'lucide-react';
import { ALL_PERMISSIONS, getModuleKeys } from '../components/PermissionTree';
import { CreateUserModal } from './user-management/CreateUserModal';
import { ChangePasswordModal } from './user-management/ChangePasswordModal';
import { ResetPasswordModal } from './user-management/ResetPasswordModal';
import { EditPermissionsModal } from './user-management/EditPermissionsModal';

interface UserRecord {
    id: string;
    username: string;
    displayName: string;
    role: string;
    parentId: string | null;
    permissions: string[];
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export const UserManagement: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [resetPwdUser, setResetPwdUser] = useState<UserRecord | null>(null);
    const [resetPwdError, setResetPwdError] = useState('');
    const [changePwdError, setChangePwdError] = useState('');
    const [permEditUser, setPermEditUser] = useState<UserRecord | null>(null);
    const [permEditValues, setPermEditValues] = useState<string[]>([]);
    const [permSaving, setPermSaving] = useState(false);
    const [createError, setCreateError] = useState('');
    const [message, setMessage] = useState('');
    const [deleteUser, setDeleteUser] = useState<UserRecord | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const deleteLock = useRef(false);
    const deleteOrigin = useRef<HTMLButtonElement | null>(null);
    const createUserButton = useRef<HTMLButtonElement | null>(null);

    useEffect(() => { fetchUsers(); }, []);

    const fetchUsers = async () => {
        try {
            const res = await api.get('/users');
            setUsers(res.data);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (form: { username: string; password: string; displayName: string; role: string; permissions: string[] }) => {
        setCreateError('');
        if (!form.username || !form.password || !form.displayName) { setCreateError('请填写所有必填字段'); return; }
        if (form.password.length < 6) { setCreateError('密码长度至少6位'); return; }
        try {
            const res = await api.post('/users', form);
            setUsers(prev => [res.data, ...prev]);
            setShowCreateModal(false);
            setMessage('子账户创建成功');
            setTimeout(() => setMessage(''), 3000);
        } catch (error: any) {
            setCreateError(error.response?.data?.error || '创建失败');
        }
    };

    const handleToggleActive = async (u: UserRecord) => {
        try {
            const res = await api.put(`/users/${u.id}`, { isActive: !u.isActive });
            setUsers(prev => prev.map(item => item.id === u.id ? res.data : item));
        } catch (error) { console.error('Failed to toggle user:', error); }
    };

    const handleUpdateRole = async (u: UserRecord, newRole: string) => {
        try {
            const res = await api.put(`/users/${u.id}`, { role: newRole });
            setUsers(prev => prev.map(item => item.id === u.id ? res.data : item));
        } catch (error) { console.error('Failed to update role:', error); }
    };

    const handleDelete = async (u: UserRecord) => {
        if (deleteLock.current) return;
        deleteLock.current = true; setDeleteBusy(true); setDeleteError('');
        try {
            await api.delete(`/users/${u.id}`);
            setUsers(prev => prev.filter(item => item.id !== u.id));
            setDeleteUser(null);
            setMessage('用户已删除');
            setTimeout(() => setMessage(''), 3000);
        } catch (error: any) {
            setDeleteError(error.response?.data?.error || '删除失败');
        } finally { deleteLock.current = false; setDeleteBusy(false); }
    };

    const handleChangePassword = async (oldPassword: string, newPassword: string) => {
        setChangePwdError('');
        try {
            await api.put('/users/me/password', { oldPassword, newPassword });
            setShowPasswordModal(false);
            setMessage('密码修改成功');
            setTimeout(() => setMessage(''), 3000);
        } catch (error: any) {
            setChangePwdError(error.response?.data?.error || '修改失败');
            throw error;
        }
    };

    const handleResetPassword = async (newPassword: string) => {
        if (!resetPwdUser) return;
        setResetPwdError('');
        try {
            await api.put(`/users/${resetPwdUser.id}/reset-password`, { newPassword });
            setResetPwdUser(null);
            setMessage(`已重置 ${resetPwdUser.displayName} 的密码`);
            setTimeout(() => setMessage(''), 3000);
        } catch (error: any) {
            setResetPwdError(error.response?.data?.error || '重置失败');
            throw error;
        }
    };

    const handleSavePermissions = async () => {
        if (!permEditUser) return;
        setPermSaving(true);
        try {
            const res = await api.put(`/users/${permEditUser.id}`, { permissions: permEditValues });
            setUsers(prev => prev.map(item => item.id === permEditUser.id ? res.data : item));
            setPermEditUser(null);
            setMessage('权限修改成功');
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            console.error('Failed to update permissions:', error);
        } finally {
            setPermSaving(false);
        }
    };

    const getPermissionSummary = (perms: string[]) => {
        if (!perms || perms.length === 0) return <span className="text-xs text-muted-foreground">无权限</span>;
        const moduleKeys = getModuleKeys();
        const allModuleSelected = moduleKeys.every(k => perms.includes(k));
        const hasSubPerms = perms.some(p => p.includes('.'));
        if (allModuleSelected && !hasSubPerms) return <span className="text-xs font-bold text-success">全部模块</span>;

        const modules = ALL_PERMISSIONS.map(node => {
            const hasModule = perms.includes(node.key);
            const subPerms = node.children?.filter(c => perms.includes(c.key)) || [];
            if (!hasModule && subPerms.length === 0) return null;
            return (
                <div key={node.key} className="flex items-center gap-1 flex-wrap">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent text-primary border border-border">{node.label}</span>
                    {!hasModule && subPerms.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                            ({subPerms.map(s => s.label).join('、')})
                        </span>
                    )}
                </div>
            );
        }).filter(Boolean);

        if (modules.length === 0) return <span className="text-xs text-muted-foreground">无权限</span>;
        return <div className="flex flex-wrap gap-1">{modules}</div>;
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'owner': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-warning-subtle text-warning border border-border"><ShieldCheck size={12} /> 超级管理员</span>;
            case 'admin': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-accent text-primary border border-border"><Shield size={12} /> 管理员</span>;
            default: return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-muted text-muted-foreground border border-border"><Eye size={12} /> 查看者</span>;
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-border border-t-transparent rounded-full animate-spin"></div></div>;
    }

    return (
        <div className="h-full flex flex-col gap-4">
            {showCreateModal && <CreateUserModal onClose={() => { setShowCreateModal(false); setCreateError(''); }} onSubmit={handleCreate} error={createError} />}
            {showPasswordModal && <ChangePasswordModal onClose={() => { setShowPasswordModal(false); setChangePwdError(''); }} onSubmit={handleChangePassword} error={changePwdError} />}
            {resetPwdUser && <ResetPasswordModal username={resetPwdUser.username} onClose={() => { setResetPwdUser(null); setResetPwdError(''); }} onSubmit={handleResetPassword} error={resetPwdError} />}
            {permEditUser && <EditPermissionsModal userName={permEditUser.displayName} userHandle={permEditUser.username} selected={permEditValues} onChange={setPermEditValues} onClose={() => setPermEditUser(null)} onSave={handleSavePermissions} saving={permSaving} />}

            <div className="px-4 py-3 bg-card/70 backdrop-blur-xl rounded-xl shadow-sm border border-white/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                <div className="flex items-center gap-3 text-foreground">
                    <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl text-white shadow-lg shadow-warning/10"><Users size={20} /></div>
                    <div>
                        <h2 className="font-extrabold text-lg text-foreground leading-tight">用户管理</h2>
                        <p className="text-xs text-muted-foreground font-medium">管理子账户与权限</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowPasswordModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-muted border border-border text-muted-foreground rounded-xl text-sm font-bold transition shadow-sm"><Key size={16} /> 修改密码</Button>
                    {currentUser?.role === 'owner' && (
                        <Button ref={createUserButton} variant="default" size="sm" onClick={() => setShowCreateModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary text-primary-foreground rounded-xl text-sm font-bold transition shadow-md shadow-primary/10"><UserPlus size={16} /> 添加子账户</Button>
                    )}
                </div>
            </div>

            {message && (
                <div className="flex items-center gap-2 px-4 py-2 bg-success-subtle border border-border rounded-xl text-success text-sm font-bold"><CheckCircle size={16} /> {message}</div>
            )}

            <div className="flex-1 bg-card/70 backdrop-blur-xl border border-white/50 shadow-sm rounded-xl overflow-hidden">
                <Table wrapped={false} className="w-full">
                    <TableHeader>
                        <TableRow className="border-b border-border bg-muted/50">
                            <TableHead className="text-left px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">用户</TableHead>
                            <TableHead className="text-left px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">角色</TableHead>
                            <TableHead className="text-left px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">权限</TableHead>
                            <TableHead className="text-left px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">状态</TableHead>
                            <TableHead className="text-left px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">创建时间</TableHead>
                            {currentUser?.role === 'owner' && <TableHead className="text-right px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">操作</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((u) => (
                            <TableRow key={u.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                                <TableCell className="px-5 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ${u.role === 'owner' ? 'bg-gradient-to-br from-amber-400 to-orange-500' : u.role === 'admin' ? 'bg-gradient-to-br from-blue-400 to-indigo-500' : 'bg-gradient-to-br from-slate-300 to-slate-400'}`}>{u.displayName.charAt(0)}</div>
                                        <div>
                                            <p className="text-sm font-bold text-foreground">{u.displayName}</p>
                                            <p className="text-xs text-muted-foreground">@{u.username}</p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="px-5 py-3">{getRoleBadge(u.role)}</TableCell>
                                <TableCell className="px-5 py-3">{u.role === 'owner' ? <span className="text-xs font-bold text-warning">全部权限</span> : getPermissionSummary(u.permissions)}</TableCell>
                                <TableCell className="px-5 py-3">
                                    {u.isActive
                                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-success-subtle text-success">● 活跃</span>
                                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-destructive/10 text-danger">● 已禁用</span>}
                                </TableCell>
                                <TableCell className="px-5 py-3 text-sm text-muted-foreground">{new Date(u.createdAt).toLocaleDateString('zh-CN')}</TableCell>
                                {currentUser?.role === 'owner' && (
                                    <TableCell className="px-5 py-3 text-right">
                                        {u.id !== currentUser?.id && (
                                            <div className="flex items-center justify-end gap-1">
                                                <Button variant="ghost" size="sm" onClick={() => handleToggleActive(u)} className={`p-1.5 rounded-lg transition text-xs ${u.isActive ? 'text-warning hover:bg-warning-subtle' : 'text-success hover:bg-success-subtle'}`} title={u.isActive ? '禁用' : '启用'}>
                                                    {u.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                                </Button>
                                                <FormSelect aria-label={`修改 ${u.displayName} 的角色`} value={u.role} options={[{ value: 'admin', label: '管理员' }, { value: 'viewer', label: '查看者' }]} onValueChange={(value) => handleUpdateRole(u, value)} triggerClassName="h-8 w-auto text-xs px-2 py-1 border border-border rounded-lg bg-card text-muted-foreground cursor-pointer" />
                                                <Button variant="ghost" size="sm" onClick={() => { setPermEditUser(u); setPermEditValues([...u.permissions]); }} className="p-1.5 text-primary hover:text-primary hover:bg-accent rounded-lg transition" title="编辑权限"><Lock size={16} /></Button>
                                                <Button variant="ghost" size="sm" onClick={() => { setResetPwdUser(u); setResetPwdError(''); }} className="p-1.5 text-warning hover:text-warning hover:bg-warning-subtle rounded-lg transition" title="重置密码"><Key size={16} /></Button>
                                                <Button variant="ghost" size="sm" onClick={event => { deleteOrigin.current = event.currentTarget; setDeleteError(''); setDeleteUser(u); }} className="p-1.5 text-danger hover:text-danger hover:bg-destructive/10 rounded-lg transition" title="删除"><Trash2 size={16} /></Button>
                                            </div>
                                        )}
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <AlertDialog open={deleteUser !== null} onOpenChange={open => { if (!open && !deleteBusy) setDeleteUser(null); }}>
              <AlertDialogContent onEscapeKeyDown={event => { if (deleteBusy) event.preventDefault(); }} onCloseAutoFocus={event => {
                if (deleteOrigin.current && !deleteOrigin.current.isConnected && createUserButton.current?.isConnected) {
                  event.preventDefault();
                  createUserButton.current.focus({ preventScroll: true });
                }
              }}>
                <AlertDialogHeader><AlertDialogTitle>删除用户</AlertDialogTitle><AlertDialogDescription>确认删除用户 "{deleteUser?.displayName}" 吗？此操作不可撤销。</AlertDialogDescription></AlertDialogHeader>
                {deleteError && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-danger">{deleteError}</p>}
                <AlertDialogFooter><AlertDialogCancel disabled={deleteBusy}>取消</AlertDialogCancel><AlertDialogAction disabled={deleteBusy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={event => { event.preventDefault(); if (deleteUser) void handleDelete(deleteUser); }}>{deleteBusy ? '删除中...' : '确认删除'}</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};




