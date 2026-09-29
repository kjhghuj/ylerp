import 'dotenv/config';
import {loadConfig} from '../src/collector/config';
import {migrateCollectorData} from '../src/collector/migrate';

const source=process.argv[2];
if(!source)throw new Error('用法：npm run collector:migrate -- <旧采集器 real 数据目录> [ERP 数据目录]');
const target=process.argv[3]||loadConfig().dataDir;
const summary=migrateCollectorData(source,target);
console.log(JSON.stringify({target,...summary},null,2));
