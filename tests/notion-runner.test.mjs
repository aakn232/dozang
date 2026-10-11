import test from 'node:test';
import assert from 'node:assert/strict';
import { BackupRunner, notionBlocks, readRecovery } from '../scripts/notion-backup.mjs';
import { notionContent } from '../lib/backup-format.ts';

const config={site_url:'https://example.test',data_sources:{first:'first-source',second:'second-source'}};
const record={id:'12345678-1234-4123-8123-123456789abc',board:'second',day:'2026-10-11',created_at:'2026-10-11T00:01:02.345Z',content:' 잘했어! \n😀 <tag> ``` \u0000\t',deleted_at:null};
const makeClaim=async r=>({record:r,revision:'rev-'+(r.deleted_at||'normal'),lease:'lease',notion_page_id:null,...await notionContent(r)});

class FakeRunner extends BackupRunner {
  constructor(claim){super({config,connection:{site_url:config.site_url,runner_key:'a'.repeat(64),site_access:'test'},notionToken:'test',sleep:async()=>{}});this.claim=claim;this.pages=[];this.blocks=new Map();this.pending=true;this.acks=0;this.failures=0;this.created=0;this.listCursors=[];}
  async validateSources(){}
  async site(body){
    if(body.action==='list')return {jobs:this.pending?[{id:this.claim.record.id,ticket:'ticket',lease_until:null}]:[],next_cursor:null};
    if(body.action==='claim')return this.claim;
    if(body.action==='ack'){if(this.stale)return null;this.acks++;this.pending=false;return {backed_up_at:'now'};}
    if(body.action==='fail'){this.failures++;return {retry:true};}
    if(body.action==='report'){this.report=body;return {recorded_at:'now'};}
    throw new Error('Unexpected site call');
  }
  async notion(path,method='GET',body){
    if(path.endsWith('/query'))return {results:this.pages.filter(p=>p.properties['도장 ID'].rich_text[0].text.content===body.filter.rich_text.equals),has_more:false};
    if(path==='/pages'&&method==='POST'){
      this.created++;const id='page-'+this.created;
      const page={id,parent:body.parent,properties:structuredClone(body.properties),archived:false};this.pages.push(page);
      this.blocks.set(id,body.children.map((b,i)=>({...structuredClone(b),id:id+'-block-'+i})));
      if(this.loseCreateResponse){this.loseCreateResponse=false;throw new Error('Connection closed after creation');}
      return page;
    }
    if(path.startsWith('/pages/')){
      const p=this.pages.find(p=>p.id===path.slice(7));
      if(method==='PATCH')p.properties=structuredClone(body.properties);
      return structuredClone(p);
    }
    if(path.includes('/children?')){
      const pageId=path.split('/')[2],offset=Number(new URL(path,'https://example.test').searchParams.get('start_cursor')||0);
      this.listCursors.push(offset);
      const all=structuredClone(this.blocks.get(pageId));
      if(this.corruptReadback){const c=all.find(b=>b.code&&b.code.rich_text[0].text.content.includes('dozang-chunk'));c.code.rich_text[0].text.content=c.code.rich_text[0].text.content.replace('잘했어','훼손됨');}
      const more=offset+3<all.length;return {results:all.slice(offset,offset+3),has_more:more,next_cursor:more?String(offset+3):null};
    }
    if(path.startsWith('/blocks/')&&method==='PATCH'){
      for(const blocks of this.blocks.values()){const found=blocks.find(b=>b.id===path.slice(8));if(found){Object.assign(found,structuredClone(body));return found;}}
    }
    throw new Error('Unexpected Notion call '+path);
  }
}

test('REST blocks preserve 10,000 characters, emoji, whitespace and control characters',async()=>{
  const text=(record.content+'가'.repeat(200)).repeat(100).slice(0,10000);
  const expected={...record,content:text},rendered=await notionBlocks(expected);
  assert.ok(rendered.blocks.length<100);
  for(const b of rendered.blocks)for(const t of b[b.type].rich_text)assert.ok(t.text.content.length<=2000);
  assert.deepEqual((await readRecovery(rendered.blocks.map((b,i)=>({...b,id:String(i)})))).record,expected);
});
test('new page is read back across pagination before acknowledgement; board and exact times retained',async()=>{
  const r=new FakeRunner(await makeClaim(record)),result=await r.run();
  assert.equal(result.completed,1);assert.equal(result.pending,0);assert.equal(r.acks,1);
  assert.equal(r.pages[0].parent.data_source_id,'second-source');assert.ok(r.listCursors.includes(3));
  assert.deepEqual((await readRecovery(r.blocks.get('page-1'))).record,record);
});
test('delete and restore update the same page, retain original text, and explicitly clear deletion date',async()=>{
  const r=new FakeRunner(await makeClaim(record));await r.run();
  const oldChunks=JSON.stringify(r.blocks.get('page-1').filter(b=>b.code?.rich_text[0].text.content.includes('dozang-chunk')));
  r.claim={...await makeClaim({...record,deleted_at:'2026-10-12T12:34:56.789Z'}),notion_page_id:'page-1'};r.pending=true;await r.run();
  assert.equal(r.pages[0].properties['상태'].select.name,'삭제됨');assert.equal(r.created,1);
  assert.equal(JSON.stringify(r.blocks.get('page-1').filter(b=>b.code?.rich_text[0].text.content.includes('dozang-chunk'))),oldChunks);
  r.claim={...await makeClaim(record),revision:'restored',notion_page_id:'page-1'};r.pending=true;await r.run();
  assert.equal(r.pages[0].properties['상태'].select.name,'정상');assert.equal(r.pages[0].properties['삭제 시각'].date,null);assert.equal(r.created,1);
});
test('a lost creation response retries by ID without duplicating the page',async()=>{
  const r=new FakeRunner(await makeClaim(record));r.loseCreateResponse=true;
  assert.equal((await r.run()).failed,1);assert.equal(r.pending,true);assert.equal(r.acks,0);
  assert.equal((await r.run()).completed,1);assert.equal(r.created,1);
});
test('corrupt readback retains the queued job and never acknowledges',async()=>{
  const r=new FakeRunner(await makeClaim(record));r.corruptReadback=true;
  const result=await r.run();assert.equal(result.failed,1);assert.equal(result.pending,1);assert.equal(r.acks,0);assert.equal(r.failures,1);
});
test('duplicate IDs are not overwritten',async()=>{
  const r=new FakeRunner(await makeClaim(record));await r.run();r.pending=true;r.pages.push(structuredClone(r.pages[0]));
  const result=await r.run();assert.equal(result.failed,1);assert.equal(r.created,1);
});
test('a changed source revision remains pending after stale completion',async()=>{
  const r=new FakeRunner(await makeClaim(record));r.stale=true;
  const result=await r.run();assert.equal(result.completed,0);assert.equal(result.deferred,1);assert.equal(result.pending,1);
});
test('Notion retry respects rate limits and never repeats an uncertain page creation',async()=>{
  const waits=[];let calls=0;
  const r=new BackupRunner({config,connection:{site_url:config.site_url,runner_key:'a'.repeat(64),site_access:'test'},notionToken:'test',sleep:async n=>waits.push(n),fetcher:async()=>{calls++;return calls===1?new Response('{}',{status:429,headers:{'Retry-After':'2'}}):new Response('{"ok":true}');}});
  assert.equal((await r.notion('/data_sources/test')).ok,true);assert.equal(calls,2);assert.ok(waits.includes(2000));
  calls=0;r.fetcher=async()=>{calls++;throw new Error('timeout');};
  await assert.rejects(r.notion('/pages','POST',{}));assert.equal(calls,1);
});
