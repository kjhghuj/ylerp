/** 任务状态机。状态命名与任务书 C 节对应。 */
export const TaskStatus = {
  PENDING: "PENDING", // 待处理
  PAUSED: "PAUSED", // 用户暂停
  SUBMITTING: "SUBMITTING", // 正在提交导出（提交意图已落库，崩溃后需先查导出历史）
  WAITING_GENERATION: "WAITING_GENERATION", // 已提交/等待生成
  DOWNLOADING: "DOWNLOADING", // 正在下载
  DOWNLOADED: "DOWNLOADED", // 已下载（待校验后转待上传）
  READY_TO_UPLOAD: "READY_TO_UPLOAD", // 待上传
  UPLOADING: "UPLOADING", // 正在上传
  WAITING_IMPORT_CONFIRM: "WAITING_IMPORT_CONFIRM", // 已上传，等待入库确认
  IMPORTED: "IMPORTED", // 已入库
  UPLOADED_UNCONFIRMED: "UPLOADED_UNCONFIRMED", // 已上传，入库待核实（接收端无法确认）
  SAVED: "SAVED", // 已保存本地（未启用上传或该任务选择不上传；文件已校验，可单独重试上传）
  FAILED: "FAILED", // 失败
  NEEDS_CONFIG: "NEEDS_CONFIG", // 缺少配置
  WAITING_AUTH: "WAITING_AUTH", // 等待登录
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

/** 可被 worker 认领执行的状态 */
export const RUNNABLE: TaskStatus[] = [
  TaskStatus.PENDING,
  TaskStatus.SUBMITTING,
  TaskStatus.WAITING_GENERATION,
  TaskStatus.DOWNLOADING,
  TaskStatus.DOWNLOADED,
  TaskStatus.READY_TO_UPLOAD,
  TaskStatus.UPLOADING,
  TaskStatus.WAITING_IMPORT_CONFIRM,
  TaskStatus.UPLOADED_UNCONFIRMED,
];

export const TERMINAL_OK: TaskStatus[] = [TaskStatus.IMPORTED, TaskStatus.SAVED];
export const TERMINAL_FAIL: TaskStatus[] = [TaskStatus.FAILED];

/** 流水线阶段（写入 attempts 表） */
export const Stage = {
  SUBMIT: "SUBMIT",
  WAIT: "WAIT",
  DOWNLOAD: "DOWNLOAD",
  VALIDATE: "VALIDATE",
  UPLOAD: "UPLOAD",
  CONFIRM: "CONFIRM",
} as const;
export type Stage = (typeof Stage)[keyof typeof Stage];

/** 账号级状态 */
export const AccountStatus = {
  OK: "ok",
  WAITING_AUTH: "WAITING_AUTH",
  NEEDS_CONFIG: "NEEDS_CONFIG",
} as const;
