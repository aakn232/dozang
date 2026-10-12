import { AsyncLocalStorage } from 'node:async_hooks';
const contexts=new AsyncLocalStorage<Pick<ExecutionContext,'waitUntil'>>();
export function runWithPushContext<T>(ctx:Pick<ExecutionContext,'waitUntil'>,run:()=>T):T{return contexts.run(ctx,run);}
export async function afterPushResponse(task:Promise<unknown>):Promise<void> {
  const safe=task.catch(()=>{console.error('push delivery deferred; retained for retry');});
  const ctx=contexts.getStore();
  if(ctx)ctx.waitUntil(safe);
  else await safe;
}
