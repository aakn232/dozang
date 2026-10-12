import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { backupRecord, notionContent, recordFromNotion } from '../lib/backup-format.ts';

export class BackupError extends Error {}
const plain = value => (value || []).map(r => r.plain_text ?? r.text?.content ?? '').join('');
const rich = text => [{type:'text',text:{content:text}}];
const block = (type, data) => ({object:'block',type,[type]:data});
const uuid = value => String(value || '').replaceAll('-','').toLowerCase();
const sameRecord = (a,b) => ['id','board','day','created_at','deleted_at','content'].every(key => a[key] === b[key]);

export function notionProperties(record, hash, revision, now) {
  return {
    '제목':{title:rich(`${record.board==='first'?'기훈':'빛나'} · ${record.day} · 잘했어요!`)},
    '도장 ID':{rich_text:rich(record.id)},
    '도장 날짜':{date:{start:record.day}}, '작성 시각':{date:{start:record.created_at}},
    '상태':{select:{name:record.deleted_at?'삭제됨':'정상'}},
    '삭제 시각':{date:record.deleted_at?{start:record.deleted_at}:null},
    '백업 시각':{date:{start:now}}, '형식 버전':{number:1},
    '원문 SHA256':{rich_text:rich(hash)}, '동기화 버전':{rich_text:rich(revision)},
  };
}

export async function notionBlocks(record) {
  const {content,hash}=await notionContent(record);
  const recovery=[...content.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => match[1]);
  // Plain rich text avoids interpreting user text as markup. Recovery JSON retains every character.
  const readable=record.content.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'�') || '내용 없이 찍은 도장입니다.';
  const parts=[];let part='';
  for(const point of readable){if(part.length+point.length>1800){parts.push(part);part='';}part+=point;}
  parts.push(part);
  return {hash,header:recovery[0],blocks:[
    block('heading_2',{rich_text:rich('칭찬 내용')}),
    ...parts.map(text=>block('paragraph',{rich_text:rich(text)})),
    block('heading_2',{rich_text:rich('복원 데이터')}),
    ...recovery.map(text=>block('code',{language:'json',rich_text:rich(text)})),
  ]};
}

export async function readRecovery(blocks) {
  const codes=blocks.filter(b=>b.type==='code'&&b.code.language==='json');
  const record=await recordFromNotion(codes.map(b=>'```json\n'+plain(b.code.rich_text)+'\n```').join('\n\n'));
  const headers=codes.filter(b=>{try{return JSON.parse(plain(b.code.rich_text)).format==='dozang-record';}catch{return false;}});
  if(headers.length!==1)throw new BackupError('Invalid recovery header');
  return {record,headerBlockId:headers[0].id};
}

export class BackupRunner {
  constructor({config,connection,notionToken,fetcher=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>new Date()}) {
    if(connection.site_url!==config.site_url || !/^https:\/\//.test(config.site_url) || !/^[a-f0-9]{64}$/.test(connection.runner_key) || !connection.site_access || !notionToken)throw new BackupError('Missing or invalid backup secrets');
    Object.assign(this,{config,connection,notionToken,fetcher,sleep,now});this.lastNotionRequest=0;
  }
  async request(url,options,retry) {
    for(let attempt=0;;attempt++) {
      let response;
      try{response=await this.fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});}catch{
        if(retry && attempt<2){await this.sleep(1000*(attempt+1));continue;}
        throw new BackupError('Network request failed; pending records retained');
      }
      if(retry && [429,500,502,503,504].includes(response.status) && attempt<2) {
        const seconds=Math.min(30,Math.max(1,Number(response.headers.get('retry-after'))||attempt+1));
        await response.arrayBuffer();await this.sleep(seconds*1000);continue;
      }
      let data;try{data=await response.json();}catch{throw new BackupError(`Non-JSON response (HTTP ${response.status})`);}
      return {status:response.status,data};
    }
  }
  async site(body) {
    const r=await this.request(this.config.site_url+'/api/backup/worker',{
      method:'POST',headers:{'Content-Type':'application/json','Origin':this.config.site_url,
        'OAI-Sites-Authorization':'Bearer '+this.connection.site_access,'X-Dozang-Backup-Key':this.connection.runner_key},body:JSON.stringify(body),
    },['list','report'].includes(body.action));
    if(r.status===409)return null;
    if(r.status!==200)throw new BackupError(`Site authentication or write failed (HTTP ${r.status})`);
    return r.data;
  }
  async notion(path,method='GET',body) {
    const delay=350-(Date.now()-this.lastNotionRequest);if(delay>0)await this.sleep(delay);
    this.lastNotionRequest=Date.now();
    const r=await this.request('https://api.notion.com/v1'+path,{
      method,headers:{'Authorization':'Bearer '+this.notionToken,'Notion-Version':'2025-09-03','Content-Type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    },method!=='POST'||path.endsWith('/query'));
    if(r.status<200||r.status>=300)throw new BackupError(`Notion request failed (HTTP ${r.status}); check integration access`);
    return r.data;
  }
  async validateSources() {
    const schema={'제목':'title','도장 ID':'rich_text','도장 날짜':'date','작성 시각':'date','상태':'select','삭제 시각':'date','백업 시각':'date','형식 버전':'number','원문 SHA256':'rich_text','동기화 버전':'rich_text'};
    for(const source of Object.values(this.config.data_sources)) {
      const data=await this.notion('/data_sources/'+source);
      if(Object.entries(schema).some(([key,type])=>data.properties?.[key]?.type!==type))throw new BackupError('Notion backup schema mismatch');
    }
  }
  async jobs() {
    const all=[],seen=new Set();let after;
    do {
      const page=await this.site({action:'list',...(after?{after}:{})});
      if(!page || !Array.isArray(page.jobs))throw new BackupError('Invalid job list');
      all.push(...page.jobs);after=page.next_cursor;
      if(after && seen.has(after))throw new BackupError('Repeated job cursor');
      seen.add(after);
    }while(after);
    return all;
  }
  checkPage(page,record) {
    const expected=this.config.data_sources[record.board];
    if(page.archived || page.in_trash || uuid(page.parent?.data_source_id)!==uuid(expected) || plain(page.properties?.['도장 ID']?.rich_text)!==record.id)throw new BackupError('Notion page identity or parent mismatch');
  }
  async findPage(claim) {
    let cursor;const found=[],seen=new Set();
    do {
      const r=await this.notion('/data_sources/'+this.config.data_sources[claim.record.board]+'/query','POST',{
        filter:{property:'도장 ID',rich_text:{equals:claim.record.id}},page_size:100,...(cursor?{start_cursor:cursor}:{}),
      });
      if(!Array.isArray(r.results))throw new BackupError('Invalid Notion query');
      found.push(...r.results);
      if(found.length>1)throw new BackupError('Duplicate Notion stamp IDs; no pages overwritten');
      cursor=r.has_more?r.next_cursor:null;
      if((r.has_more&&!cursor)||(cursor&&seen.has(cursor)))throw new BackupError('Invalid Notion query cursor');
      seen.add(cursor);
    }while(cursor);
    if(claim.notion_page_id && (!found.length||uuid(found[0].id)!==uuid(claim.notion_page_id)))throw new BackupError('Previously backed up Notion page is missing or moved');
    if(found.length)this.checkPage(found[0],claim.record);
    return found[0]||null;
  }
  async children(pageId) {
    const all=[],seen=new Set();let cursor;
    do {
      const r=await this.notion('/blocks/'+pageId+'/children?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):''));
      if(!Array.isArray(r.results))throw new BackupError('Invalid Notion blocks');
      all.push(...r.results);cursor=r.has_more?r.next_cursor:null;
      if((r.has_more&&!cursor)||(cursor&&seen.has(cursor)))throw new BackupError('Invalid Notion block cursor');
      seen.add(cursor);
    }while(cursor);
    return all;
  }
  async save(claim) {
    const record=backupRecord(claim.record),rendered=await notionBlocks(record);
    if(rendered.hash!==claim.hash)throw new BackupError('Source hash mismatch');
    const properties=notionProperties(record,claim.hash,claim.revision,this.now().toISOString());
    let page=await this.findPage(claim);
    if(page) {
      const existing=await readRecovery(await this.children(page.id));
      // Stamp text is immutable. Preserve the old page and fail if its recovery copy is damaged.
      if(!sameRecord({...existing.record,deleted_at:record.deleted_at},record))throw new BackupError('Existing Notion recovery data differs; original page retained');
      await this.notion('/blocks/'+existing.headerBlockId,'PATCH',{code:{language:'json',rich_text:rich(rendered.header)}});
      await this.notion('/pages/'+page.id,'PATCH',{properties});
    }else{
      // A creation timeout is never blindly retried. The next run queries the stamp ID first.
      page=await this.notion('/pages','POST',{parent:{type:'data_source_id',data_source_id:this.config.data_sources[record.board]},properties,children:rendered.blocks});
    }
    const readback=await this.notion('/pages/'+page.id);this.checkPage(readback,record);
    const recovered=await readRecovery(await this.children(page.id));
    const p=readback.properties,deleted=p['삭제 시각']?.date?.start??null;
    if(!sameRecord(recovered.record,record) || plain(p['동기화 버전']?.rich_text)!==claim.revision || plain(p['원문 SHA256']?.rich_text)!==claim.hash ||
      p['상태']?.select?.name!==(record.deleted_at?'삭제됨':'정상') || (record.deleted_at?deleted===null||Math.floor(Date.parse(deleted)/60000)!==Math.floor(Date.parse(record.deleted_at)/60000):deleted!==null))throw new BackupError('Notion readback verification failed');
    return page.id;
  }
  async run({verifyExisting=false}={}) {
    await this.validateSources();
    if(verifyExisting) {
      let after;const seen=new Set();
      do {
        const page=await this.site({action:'resync',...(after?{after}:{})});
        if(!page)throw new BackupError('Existing backup recheck was not queued');
        after=page.next_cursor;
        if(after&&seen.has(after))throw new BackupError('Repeated recheck cursor');
        seen.add(after);
      }while(after);
    }
    const jobs=await this.jobs(),result={completed:0,failed:0,deferred:0,pending:0};
    for(const job of jobs) {
      if(job.lease_until && Date.parse(job.lease_until)>this.now().getTime()){result.deferred++;continue;}
      let claim;
      try {
        claim=await this.site({action:'claim',id:job.id,ticket:job.ticket});
        if(!claim){result.deferred++;continue;}
        const page_id=await this.save(claim);
        const ack=await this.site({action:'ack',id:job.id,ticket:job.ticket,lease:claim.lease,page_id,hash:claim.hash});
        if(ack)result.completed++;else result.deferred++;
      }catch(error){
        result.failed++;
        if(claim)try{await this.site({action:'fail',id:job.id,ticket:job.ticket,lease:claim.lease,error:error instanceof BackupError?error.message:'Notion backup validation failed'});}catch{/* Lease expiry allows a later retry. */}
      }
    }
    result.pending=(await this.jobs()).length;
    await this.site({action:'report',completed:result.completed,failed:result.failed});
    return result;
  }
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const config=JSON.parse(await readFile(new URL('../.openai/backup.json',import.meta.url),'utf8'));
    if(!process.env.DOZANG_BACKUP_CONFIG || !process.env.NOTION_API_TOKEN)throw new BackupError('Register NOTION_API_TOKEN and DOZANG_BACKUP_CONFIG in GitHub Actions secrets');
    let connection;try{connection=JSON.parse(process.env.DOZANG_BACKUP_CONFIG);}catch{throw new BackupError('DOZANG_BACKUP_CONFIG must contain the copied connection JSON');}
    const result=await new BackupRunner({config,connection,notionToken:process.env.NOTION_API_TOKEN}).run({verifyExisting:process.env.NOTION_VERIFY_EXISTING==='true'});
    console.log(JSON.stringify(result));
    if(result.failed)process.exitCode=1;
  }catch(error){console.error(error instanceof BackupError?error.message:'Backup configuration or validation failed; source records retained');process.exitCode=1;}
}
