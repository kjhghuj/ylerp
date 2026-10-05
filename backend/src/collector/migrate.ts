import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {loadConfig} from './config';
import {CredentialStore} from './credentials';
import {checksumOf} from './validate';

function canonicalDestination(directory: string): string {
  if (fs.existsSync(directory)) return fs.realpathSync(directory);
  const parent = path.dirname(directory);
  if (parent === directory) return directory;
  return path.join(canonicalDestination(parent), path.basename(directory));
}

function isOutside(relative: string): boolean {
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

/** One-time migration. The original database/files remain available for rollback. */
export function migrateCollectorData(sourceDirectory: string, destinationDirectory: string) {
  const source = fs.realpathSync(sourceDirectory), destination = path.resolve(destinationDirectory);
  const relation = path.relative(source, canonicalDestination(destination));
  if (!relation || !isOutside(relation)) throw new Error('ERP 数据目录不能位于旧采集目录内');
  if (fs.existsSync(destination)) throw new Error('目标目录已存在，拒绝覆盖 ERP 采集数据');
  const sourceDb = new DatabaseSync(path.join(source, 'collector.db'));
  const staging = `${destination}.migrating-${crypto.randomUUID()}`;
  const priorPause = sourceDb.prepare("SELECT value FROM app_state WHERE key='workerPaused'").get() as {value:string} | undefined;
  let completed = false;
  try {
    sourceDb.exec('BEGIN IMMEDIATE');
    sourceDb.prepare("INSERT INTO app_state(key,value,updated_at) VALUES('workerPaused','1',?) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=excluded.updated_at")
      .run(new Date().toISOString());
    const busy = sourceDb.prepare('SELECT COUNT(*) AS count FROM tasks WHERE lease_owner IS NOT NULL AND lease_expires_at>?')
      .get(new Date().toISOString()) as {count:number};
    sourceDb.exec('COMMIT');
    if (busy.count) throw new Error('旧采集器仍有执行中的任务，请等待完成后迁移');
    fs.mkdirSync(staging, {recursive:true});
    // VACUUM INTO includes committed WAL contents; copying collector.db alone would lose recent writes.
    sourceDb.prepare('VACUUM INTO ?').run(path.join(staging, 'collector.db'));
    fs.copyFileSync(path.join(source, 'credential.key'), path.join(staging, 'credential.key'), fs.constants.COPYFILE_EXCL);
    fs.chmodSync(path.join(staging, 'credential.key'), 0o600);
    const sourceDownloads = path.join(source, 'downloads');
    const copyDirectory = (from:string, to:string) => {
      fs.mkdirSync(to, {recursive:true});
      for (const entry of fs.readdirSync(from, {withFileTypes:true})) {
        if (entry.isSymbolicLink()) throw new Error('报表目录包含符号链接，无法自动迁移');
        const input=path.join(from,entry.name), output=path.join(to,entry.name);
        if(entry.isDirectory()) copyDirectory(input,output);
        else if(entry.isFile()) fs.copyFileSync(input,output,fs.constants.COPYFILE_EXCL);
      }
    };
    copyDirectory(sourceDownloads, path.join(staging, 'downloads'));
    const migrated = new DatabaseSync(path.join(staging, 'collector.db'));
    let summary: {tasks:number;credentials:number;reports:number};
    try {
      const rebase = (file:string, root:string) => {
        // macOS /var aliases and user directory aliases refer to the same files.
        const relative=path.relative(sourceDownloads,fs.realpathSync(file));
        if(isOutside(relative))throw new Error('历史报表路径不在旧采集器下载目录内');
        return path.join(root,'downloads',relative);
      };
      const tasks = migrated.prepare('SELECT id,file_path,file_checksum FROM tasks').all() as {id:number;file_path:string|null;file_checksum:string|null}[];
      for(const task of tasks) {
        if(!task.file_path)continue;
        const copied=rebase(task.file_path,staging);
        if(!fs.existsSync(copied)||!task.file_checksum||checksumOf(copied)!==task.file_checksum)throw new Error(`任务 ${task.id} 原始报表缺失或校验和不匹配`);
        migrated.prepare('UPDATE tasks SET file_path=? WHERE id=?').run(rebase(task.file_path,destination),task.id);
      }
      const downloads=migrated.prepare('SELECT id,file_path FROM downloads').all() as {id:number;file_path:string}[];
      for(const file of downloads)migrated.prepare('UPDATE downloads SET file_path=? WHERE id=?').run(rebase(file.file_path,destination),file.id);
      const credentials=new CredentialStore(migrated,loadConfig(staging));
      const accounts=migrated.prepare('SELECT account_key FROM account_credentials').all() as {account_key:string}[];
      for(const account of accounts)if(!credentials.get(account.account_key))throw new Error('迁移凭据验证失败');
      migrated.prepare("UPDATE app_state SET value='0' WHERE key='workerPaused'").run();
      migrated.prepare("UPDATE accounts SET profile_dir='' WHERE mode='real'").run();
      summary={tasks:tasks.length,credentials:accounts.length,reports:downloads.length};
      fs.writeFileSync(path.join(staging,'migration.json'),JSON.stringify({source,migratedAt:new Date().toISOString(),...summary},null,2));
    } finally { migrated.close(); }
    fs.renameSync(staging,destination);
    completed=true;
    return summary;
  } finally {
    if(!completed) {
      try {sourceDb.exec('ROLLBACK');} catch {}
      if(priorPause)sourceDb.prepare("UPDATE app_state SET value=? WHERE key='workerPaused'").run(priorPause.value);
      else sourceDb.prepare("DELETE FROM app_state WHERE key='workerPaused'").run();
      try { fs.rmSync(staging,{recursive:true,force:true}); } catch {}
    }
    sourceDb.close();
  }
}
