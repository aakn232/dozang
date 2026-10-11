import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notionContent,recordFromNotion,readBundle} from '../lib/backup-format.ts';
const base={id:'ca5328ef-9012-433a-9b63-bb6d0d577730',board:'first',day:'2026-10-11',created_at:'2026-10-12T01:30:00.000Z',deleted_at:null};
test('10,000 characters, emoji, code fences, spaces and blank lines restore byte for byte',async()=>{
  const edge='  한글 😀\n\n```json\n{"명령":"<page>"}\n```\r\n\t\\"';
  const content=edge+'가'.repeat(10_000-edge.length),record={...base,content};
  const result=await notionContent(record);
  assert.deepEqual(await recordFromNotion(result.content),record);
  const blocks=[...result.content.matchAll(/```json\n([\s\S]*?)\n```/g)];
  assert.ok(blocks.length>2);
  assert.ok(blocks.every(b=>b[1].length<=2000));
});
test('empty and deleted records preserve dates and status',async()=>{
  const record={...base,board:'second',content:'',deleted_at:'2026-10-12T04:00:00Z'};
  assert.deepEqual(await recordFromNotion((await notionContent(record)).content),record);
});
test('missing, reordered or corrupted Notion chunks are rejected',async()=>{
  const result=await notionContent({...base,content:'가'.repeat(4000)});
  await assert.rejects(recordFromNotion(result.content.replace('"index":1','"index":0')));
  await assert.rejects(recordFromNotion(result.content.replace('"content_length":4000','"content_length":4001')));
  await assert.rejects(recordFromNotion(result.content.replace(/"content_sha256":"[a-f0-9]+"/,'"content_sha256":"wrong"')));
});
test('backup bundles validate board, identity, dates, limits and duplicates',()=>{
  const record={...base,content:'복원'}, bundle={format:'dozang-backup',schema_version:1,records:[record]};
  assert.deepEqual(readBundle(bundle),bundle);
  for(const bad of [{board:'other'},{id:'bad'},{content:'가'.repeat(10001)},{day:'2026-02-30'},{created_at:'invalid'}])assert.throws(()=>readBundle({...bundle,records:[{...record,...bad}]}));
  assert.throws(()=>readBundle({...bundle,records:[record,record]}));
});
