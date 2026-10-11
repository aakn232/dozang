import {readFile,writeFile} from 'node:fs/promises';
import {recordFromNotion} from '../lib/backup-format.ts';
const [output,...inputs]=process.argv.slice(2);
if(!output||!inputs.length)throw new Error('Usage: node --experimental-strip-types scripts/notion_restore.mjs output.json input1.md [input2.md ...]');
const records=[];
for(const path of inputs)records.push(await recordFromNotion(await readFile(path,'utf8')));
if(new Set(records.map(r=>r.id)).size!==records.length)throw new Error('Duplicate stamp ID');
await writeFile(output,JSON.stringify({format:'dozang-backup',schema_version:1,records},null,2),{flag:'wx',mode:0o600});
process.stdout.write(`Verified ${records.length} records and wrote the backup file.\n`);
