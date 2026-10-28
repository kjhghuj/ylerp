import React from 'react';
import { PermissionTree } from '../../components/PermissionTree';
import { Button } from '../../components/ui/button';
import { ModalFrame } from './ModalFrame';
interface PermEditModalProps { userName: string; userHandle: string; selected: string[]; onChange: (perms: string[]) => void; onClose: () => void; onSave: () => void; saving: boolean; }
export const EditPermissionsModal: React.FC<PermEditModalProps> = ({ userName, userHandle, selected, onChange, onClose, onSave, saving }) => <ModalFrame title="编辑权限" description={`用户: ${userName} (@${userHandle})`} onClose={onClose} busy={saving}><PermissionTree selected={selected} onChange={onChange} /><div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="outline" onClick={onClose} disabled={saving}>取消</Button><Button onClick={onSave} disabled={saving}>{saving ? '保存中...' : '保存权限'}</Button></div></ModalFrame>;
