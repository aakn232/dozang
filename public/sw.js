/* Push only: no page, credential or stamp-data caching. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{};}catch{}
  const title=typeof data.title==='string'?data.title:'커플도장';
  event.waitUntil(self.registration.showNotification(title,{
    body:typeof data.body==='string'?data.body:'새 칭찬 도장이 도착했어요.',
    icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',
    tag:typeof data.tag==='string'?data.tag:'dozang',data:{url:typeof data.url==='string'?data.url:'/'},
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    let url=new URL('/',self.location.origin);
    try{const proposed=new URL(event.notification.data?.url||'/',self.location.origin);if(proposed.origin===self.location.origin)url=proposed;}catch{}
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clients){if(new URL(client.url).origin===url.origin&&'navigate' in client){await client.navigate(url.href);return client.focus();}}
    return self.clients.openWindow(url.href);
  })());
});
self.addEventListener('pushsubscriptionchange',event=>{
  event.waitUntil((async()=>{
    if(!event.oldSubscription)return;
    const old=event.oldSubscription.toJSON();
    const call=async(action,subscription,board)=>{
      const response=await fetch('/api/push',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,subscription,board})});
      if(!response.ok)throw new Error('Push reconnect failed');return response.json();
    };
    const status=await call('status',old,'first');
    const config=await(await fetch('/api/push',{cache:'no-store',credentials:'omit'})).json();
    const raw=atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/'));
    const next=event.newSubscription||await self.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});
    for(const board of ['first','second'])if(status.enabled[board])await call('subscribe',next.toJSON(),board);
    if(next.endpoint!==old.endpoint)for(const board of ['first','second'])if(status.enabled[board])await call('disable',old,board);
  })());
});
