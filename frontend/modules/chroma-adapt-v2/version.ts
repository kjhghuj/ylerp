
export const CHROMA_V2_MODULE_VERSION = '2.0.0';
export const CHROMA_V2_MODULE_NAME = 'chroma-adapt-v2';
export const CHROMA_V2_API_BASE = '/api/chroma-adapt-v2';

export interface ModuleVersionInfo {
  name: string;
  version: string;
  apiBase: string;
  buildDate: string;
  changelog: ChangelogEntry[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  description: string;
  changes: string[];
}

export const MODULE_VERSION_INFO: ModuleVersionInfo = {
  name: CHROMA_V2_MODULE_NAME,
  version: CHROMA_V2_MODULE_VERSION,
  apiBase: CHROMA_V2_API_BASE,
  buildDate: new Date().toISOString().split('T')[0],
  changelog: [
    {
      version: '2.0.0',
      date: '2026-03-27',
      description: '色彩适配V2 - 独立模块初始版本，基于V1完整功能复制',
      changes: [
        '从chroma-adapt V1完整复制所有功能',
        '独立类型系统（ChromaV2Language, ChromaV2AppState等）',
        '独立API服务（VITE_CHROMA_V2_API_BASE_URL）',
        '独立后端路由（/api/chroma-adapt-v2）',
        '模块化架构设计，支持独立升级',
        '版本管理机制（MODULE_VERSION, MODULE_NAME）',
        '完整单元测试覆盖',
      ]
    }
  ]
};
