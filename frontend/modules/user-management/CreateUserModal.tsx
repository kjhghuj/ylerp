import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { PermissionTree, getAllPermissionKeys } from '../../components/PermissionTree';

interface CreateModalProps {
    onClose: () => void;
    onSubmit: (form: { username: string; password: string; displayName: string; role: string; permissions: string[] }) => void;
    error: string;
}

export const CreateUserModal: React.FC<CreateModalProps> = ({ onClose, onSubmit, error }) => {
    const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'viewer', permissions: getAllPermissionKeys() });

    return (
        <>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-lg font-bold text-slate-800">添加子账户</h3>
                        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                    </div>
                    {error && (
                        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1">用户名 *</label>
                            <input type="text" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                placeholder="登录用户名" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1">显示名称 *</label>
                            <input type="text" value={form.displayName} onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
                                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                placeholder="显示名称" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1">密码 *</label>
                            <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                placeholder="至少6位" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1">角色</label>
                            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition cursor-pointer">
                                <option value="admin">管理员 — 可操作所有功能</option>
                                <option value="viewer">查看者 — 仅查看数据</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-2">功能权限</label>
                            <PermissionTree selected={form.permissions} onChange={(perms) => setForm(p => ({ ...p, permissions: perms }))} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl transition">取消</button>
                        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition">创建账户</button>
                    </div>
                </div>
            </div>
        </>
    );
};
