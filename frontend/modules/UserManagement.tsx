import React, { useState, useEffect } from 'react';
import { useAuth, AuthUser } from '../AuthContext';
import api from '../src/api';
import { Users, UserPlus, Shield, ShieldCheck, Eye, Trash2, Edit3, Save, X, Key, CheckCircle, AlertCircle, ToggleLeft, ToggleRight, Lock } from 'lucide-react';
import { PermissionTree, ALL_PERMISSIONS, getAllPermissionKeys } from '../components/PermissionTree';

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
    const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [permEditUser, setPermEditUser] = useState<UserRecord | null>(null);
    const [permEditValues, setPermEditValues] = useState<string[]>([]);
    const [permSaving, setPermSaving] = useState(false);

    // Create form
    const [createForm, setCreateForm] = useState({ username: '', password: '', displayName: '', role: 'viewer', permissions: getAllPermissionKeys() });
    const [createError, setCreateError] = useState('');

    // Password change form
    const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchUsers();
    }, []);

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

    const handleCreate = async () => {
        setCreateError('');
        if (!createForm.username || !createForm.password || !createForm.displayName) {
            setCreateError('请填写所有必填字段');
            return;
        }
        if (createForm.password.length < 6) {
            setCreateError('密码长度至少6位');
            return;
        }
        try {
            const res = await api.post('/users', createForm);
            setUsers(prev => [res.data, ...prev]);
            setShowCreateModal(false);
            setCreateForm({ username: '', password: '', displayName: '', role: 'viewer', permissions: getAllPermissionKeys() });
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
        } catch (error) {
            console.error('Failed to toggle user:', error);
        }
    };

    const handleUpdateRole = async (u: UserRecord, newRole: string) => {
        try {
            const res = await api.put(`/users/${u.id}`, { role: newRole });
            setUsers(prev => prev.map(item => item.id === u.id ? res.data : item));
            setEditingUser(null);
        } catch (error) {
            console.error('Failed to update role:', error);
        }
    };

    const handleDelete = async (u: UserRecord) => {
        if (!confirm(`确认删除用户 "${u.displayName}" 吗？此操作不可撤销。`)) return;
        try {
            await api.delete(`/users/${u.id}`);
            setUsers(prev => prev.filter(item => item.id !== u.id));
            setMessage('用户已删除');
            setTimeout(() => setMessage(''), 3000);
        } catch (error: any) {
            alert(error.response?.data?.error || '删除失败');
        }
    };

    const handleChangePassword = async () => {
        setPasswordError('');
        setPasswordSuccess('');
        if (!passwordForm.oldPassword || !passwordForm.newPassword) {
            setPasswordError('请填写所有字段');
            return;
        }
        if (passwordForm.newPassword.length < 6) {
            setPasswordError('新密码长度至少6位');
            return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError('两次输入的密码不一致');
            return;
        }
        try {
            await api.put('/auth/password', {
                oldPassword: passwordForm.oldPassword,
                newPassword: passwordForm.newPassword,
            });
            setPasswordSuccess('密码修改成功');
            setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
            setTimeout(() => { setShowPasswordModal(false); setPasswordSuccess(''); }, 2000);
        } catch (error: any) {
            setPasswordError(error.response?.data?.error || '修改失败');
        }
    };

    const handleOpenPermEdit = (u: UserRecord) => {
        setPermEditUser(u);
        setPermEditValues([...u.permissions]);
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
        if (!perms || perms.length === 0) return <span className="text-xs text-slate-400">无权限</span>;
        const allKeys = getAllPermissionKeys();
        if (perms.length === allKeys.length) return <span className="text-xs font-bold text-emerald-600">全部模块</span>;
        return (
            <div className="flex flex-wrap gap-1">
                {perms.slice(0, 3).map(k => {
                    const node = ALL_PERMISSIONS.find(n => n.key === k);
                    return node ? (
                        <span key={k} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                            {node.label}
                        </span>
                    ) : null;
                })}
                {perms.length > 3 && (
                    <span className="text-[10px] text-slate-400">+{perms.length - 3}</span>
                )}
            </div>
        );
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'owner':
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200"><ShieldCheck size={12} /> 超级管理员</span>;
            case 'admin':
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200"><Shield size={12} /> 管理员</span>;
            default:
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200"><Eye size={12} /> 查看者</span>;
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>;
    }

    return (
        <div className="h-full flex flex-col gap-4">
            {/* Header */}
            <div className="px-4 py-3 bg-white/70 backdrop-blur-xl rounded-xl shadow-sm border border-white/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                <div className="flex items-center gap-3 text-slate-800">
                    <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl text-white shadow-lg shadow-amber-200"><Users size={20} /></div>
                    <div>
                        <h2 className="font-extrabold text-lg text-slate-800 leading-tight">用户管理</h2>
                        <p className="text-xs text-slate-500 font-medium">管理子账户与权限</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowPasswordModal(true)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold transition shadow-sm"
                    >
                        <Key size={16} /> 修改密码
                    </button>
                    {currentUser?.role === 'owner' && (
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition shadow-md shadow-blue-100"
                        >
                            <UserPlus size={16} /> 添加子账户
                        </button>
                    )}
                </div>
            </div>

            {/* Success Message */}
            {message && (
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-bold">
                    <CheckCircle size={16} /> {message}
                </div>
            )}

            {/* User Table */}
            <div className="flex-1 bg-white/70 backdrop-blur-xl border border-white/50 shadow-sm rounded-xl overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                            <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">用户</th>
                            <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">角色</th>
                            <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">权限</th>
                            <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">状态</th>
                            <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">创建时间</th>
                            {currentUser?.role === 'owner' && (
                                <th className="text-right px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">操作</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => (
                            <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                <td className="px-5 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                                            u.role === 'owner' ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                                            u.role === 'admin' ? 'bg-gradient-to-br from-blue-400 to-indigo-500' :
                                            'bg-gradient-to-br from-slate-300 to-slate-400'
                                        }`}>
                                            {u.displayName.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">{u.displayName}</p>
                                            <p className="text-xs text-slate-400">@{u.username}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-5 py-3">{getRoleBadge(u.role)}</td>
                                <td className="px-5 py-3">
                                    {u.role === 'owner' ? (
                                        <span className="text-xs font-bold text-amber-600">全部权限</span>
                                    ) : getPermissionSummary(u.permissions)}
                                </td>
                                <td className="px-5 py-3">
                                    {u.isActive ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-700">● 活跃</span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-red-100 text-red-600">● 已禁用</span>
                                    )}
                                </td>
                                <td className="px-5 py-3 text-sm text-slate-500">{new Date(u.createdAt).toLocaleDateString('zh-CN')}</td>
                                {currentUser?.role === 'owner' && (
                                    <td className="px-5 py-3 text-right">
                                        {u.id !== currentUser?.id && (
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => handleToggleActive(u)}
                                                    className={`p-1.5 rounded-lg transition text-xs ${u.isActive ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                                                    title={u.isActive ? '禁用' : '启用'}
                                                >
                                                    {u.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                                </button>
                                                <select
                                                    value={u.role}
                                                    onChange={(e) => handleUpdateRole(u, e.target.value)}
                                                    className="text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white text-slate-600 outline-none cursor-pointer"
                                                >
                                                    <option value="admin">管理员</option>
                                                    <option value="viewer">查看者</option>
                                                </select>
                                                <button
                                                    onClick={() => handleOpenPermEdit(u)}
                                                    className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                    title="编辑权限"
                                                >
                                                    <Lock size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(u)}
                                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                    title="删除"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <>
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setShowCreateModal(false)} />
                    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md p-6">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-lg font-bold text-slate-800">添加子账户</h3>
                                <button onClick={() => setShowCreateModal(false)} className="p-1 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                            </div>

                            {createError && (
                                <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                                    <AlertCircle size={14} /> {createError}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">用户名 *</label>
                                    <input type="text" value={createForm.username} onChange={e => setCreateForm(p => ({ ...p, username: e.target.value }))}
                                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                        placeholder="登录用户名" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">显示名称 *</label>
                                    <input type="text" value={createForm.displayName} onChange={e => setCreateForm(p => ({ ...p, displayName: e.target.value }))}
                                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                        placeholder="显示名称" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">密码 *</label>
                                    <input type="password" value={createForm.password} onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                        placeholder="至少6位" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">角色</label>
                                    <select value={createForm.role} onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}
                                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition cursor-pointer">
                                        <option value="admin">管理员 — 可操作所有功能</option>
                                        <option value="viewer">查看者 — 仅查看数据</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-2">功能权限</label>
                                    <PermissionTree
                                        selected={createForm.permissions}
                                        onChange={(perms) => setCreateForm(p => ({ ...p, permissions: perms }))}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-6">
                                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl transition">取消</button>
                                <button onClick={handleCreate} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition">创建账户</button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Change Password Modal */}
            {showPasswordModal && (
                <>
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setShowPasswordModal(false)} />
                    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md p-6">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-lg font-bold text-slate-800">修改密码</h3>
                                <button onClick={() => setShowPasswordModal(false)} className="p-1 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                            </div>

                            {passwordError && (
                                <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                                    <AlertCircle size={14} /> {passwordError}
                                </div>
                            )}
                            {passwordSuccess && (
                                <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-600 text-sm">
                                    <CheckCircle size={14} /> {passwordSuccess}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">旧密码</label>
                                    <input type="password" value={passwordForm.oldPassword} onChange={e => setPasswordForm(p => ({ ...p, oldPassword: e.target.value }))}
                                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">新密码</label>
                                    <input type="password" value={passwordForm.newPassword} onChange={e => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                        placeholder="至少6位" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">确认新密码</label>
                                    <input type="password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition" />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-6">
                                <button onClick={() => setShowPasswordModal(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl transition">取消</button>
                                <button onClick={handleChangePassword} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition">确认修改</button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Edit Permissions Modal */}
            {permEditUser && (
                <>
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setPermEditUser(null)} />
                    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md p-6">
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">编辑权限</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">用户: {permEditUser.displayName} (@{permEditUser.username})</p>
                                </div>
                                <button onClick={() => setPermEditUser(null)} className="p-1 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                            </div>

                            <PermissionTree
                                selected={permEditValues}
                                onChange={setPermEditValues}
                            />

                            <div className="flex justify-end gap-2 mt-6">
                                <button onClick={() => setPermEditUser(null)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl transition">取消</button>
                                <button
                                    onClick={handleSavePermissions}
                                    disabled={permSaving}
                                    className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition disabled:opacity-50"
                                >
                                    {permSaving ? '保存中...' : '保存权限'}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
