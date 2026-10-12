import {readFile} from 'node:fs/promises';
try {
  const site=JSON.parse(await readFile(new URL('../.openai/backup.json',import.meta.url),'utf8'));
  const connection=JSON.parse(process.env.DOZANG_BACKUP_CONFIG||'null');
  if(!connection||connection.site_url!==site.site_url||!connection.runner_key||!connection.site_access)throw new Error('config');
  const response=await fetch(site.site_url+'/api/push/worker',{method:'POST',redirect:'error',signal:AbortSignal.timeout(40000),
    headers:{'Content-Type':'application/json','Origin':site.site_url,'OAI-Sites-Authorization':'Bearer '+connection.site_access,'X-Dozang-Backup-Key':connection.runner_key},body:'{}'});
  if(!response.ok)throw new Error('delivery');
  const data=await response.json();
  console.log(JSON.stringify({accepted:data.accepted||0,failed:data.failed||0,pending:data.pending||0}));
  if(data.failed)process.exitCode=1;
}catch{console.error('Phone notification retry could not complete; queued notifications retained.');process.exitCode=1;}
