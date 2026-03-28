import React from 'react';
import { X } from 'lucide-react';
import { PermissionTree } from '../../components/PermissionTree';

interface PermEditModalProps {
    userName: string;
    userHandle: string;
    selected: string[];
    onChange: (perms: string[]) => void;
    onClose: () => void;
    onSave: () => void;
    saving: boolean;
}

export const EditPermissionsModal: React.FC<PermEditModalProps> = ({
    userName, userHandle, selected, onChange, onClose, onSave, saving
}) => (
    <>
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">编辑权限</h3>
                        <p className="text-xs text-slate-400 mt-0.5">用户: {userName} (@{userHandle})</p>
                    </div>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                <PermissionTree selected={selected} onChange={onChange} />
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl transition">取消</button>
                    <button onClick={onSave} disabled={saving}
                        className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition disabled:opacity-50">
                        {saving ? '保存中...' : '保存权限'}
                    </button>
                </div>
            </div>
        </div>
    </>
);
