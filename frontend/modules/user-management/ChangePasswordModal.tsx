import React, { useState } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';

interface PasswordModalProps {
    onClose: () => void;
    onSubmit: (data: { oldPassword: string; newPassword: string }) => Promise<void>;
}

export const ChangePasswordModal: React.FC<PasswordModalProps> = ({ onClose, onSubmit }) => {
    const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async () => {
        setError('');
        setSuccess('');
        if (!form.oldPassword || !form.newPassword) { setError('请填写所有字段'); return; }
        if (form.newPassword.length < 6) { setError('新密码长度至少6位'); return; }
        if (form.newPassword !== form.confirmPassword) { setError('两次输入的密码不一致'); return; }
        try {
            await onSubmit({ oldPassword: form.oldPassword, newPassword: form.newPassword });
            setSuccess('密码修改成功');
            setForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
            setTimeout(() => { onClose(); setSuccess(''); }, 2000);
        } catch (err: any) {
            setError(err.response?.data?.error || '修改失败');
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-lg font-bold text-slate-800">修改密码</h3>
                        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                    </div>
                    {error && <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm"><AlertCircle size={14} /> {error}</div>}
                    {success && <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-600 text-sm"><CheckCircle size={14} /> {success}</div>}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1">旧密码</label>
                            <input type="password" value={form.oldPassword} onChange={e => setForm(p => ({ ...p, oldPassword: e.target.value }))}
                                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1">新密码</label>
                            <input type="password" value={form.newPassword} onChange={e => setForm(p => ({ ...p, newPassword: e.target.value }))}
                                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                                placeholder="至少6位" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1">确认新密码</label>
                            <input type="password" value={form.confirmPassword} onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl transition">取消</button>
                        <button onClick={handleSubmit} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition">确认修改</button>
                    </div>
                </div>
            </div>
        </>
    );
};
