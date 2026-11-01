import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type {Server} from 'node:http';
import {DateTime} from 'luxon';
import {createApp} from '../app.js';
import {openDatabase,migrate} from '../db.js';
import {seed} from '../seed.js';
import {config} from '../config.js';
import {TIMEZONE,type Booking,type Space} from '../../shared/contracts.js';

function listen(app:ReturnType<typeof createApp>):Promise<{server:Server;base:string}>{
  return new Promise((resolve,reject)=>{
    const server=app.listen(0,'127.0.0.1',()=>{
      const address=server.address();
      if(!address||typeof address==='string'){reject(new Error('No server address'));return;}
      resolve({server,base:`http://127.0.0.1:${address.port}`});
    });
    server.once('error',reject);
  });
}
function stop(server:Server):Promise<void>{return new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
async function request(base:string,url:string,method='GET',body?:unknown,cookie='',key='',origin=config.origin){
  const response=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(key?{'Idempotency-Key':key}:{}),...(['POST','PUT','PATCH','DELETE'].includes(method)?{Origin:origin}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const setCookie=response.headers.get('set-cookie')?.split(';')[0]??'';
  return {status:response.status,data:response.status===204?null:await response.json(),cookie:setCookie};
}
const signup=(base:string,email:string,name='Test User')=>request(base,'/api/auth/signup','POST',{fullName:name,email,password:'a-test-password-1234'});
const slotData=(space:Space)=>({spaceId:space.id,date:DateTime.now().setZone(TIMEZONE).plus({days:14}).toISODate()!,startTime:'10:00',durationHours:2});

test('auth, booking ownership, concurrency, legacy migration and isolated cleanup',async()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'spacebook-auth-test-'));
  const dbPath=path.join(dir,'isolated.sqlite');
  const db=openDatabase(dbPath);
  // Exercise migration over an existing first-release database with a real legacy guest booking.
  db.exec(readFileSync(path.resolve('migrations/001_initial.sql'),'utf8'));
  db.prepare('INSERT INTO schema_migrations(version) VALUES (?)').run('001_initial.sql');
  seed(db);
  const space=db.prepare("SELECT * FROM spaces WHERE type='photography-studio' LIMIT 1").get() as {id:string;name:string;hourly_rate:number};
  const date=DateTime.now().setZone(TIMEZONE).plus({days:21}).toISODate()!;
  const begin=DateTime.fromISO(`${date}T10:00`,{zone:TIMEZONE}).toUTC().toISO()!;
  const end=DateTime.fromISO(`${date}T12:00`,{zone:TIMEZONE}).toUTC().toISO()!;
  const legacyId=randomUUID(),legacyKey=randomUUID();
  const token=randomBytes(24).toString('base64url');
  db.prepare(`INSERT INTO bookings(id,reference,space_id,space_name,customer_name,customer_email,private_token,starts_at,ends_at,duration_hours,hourly_rate,total_price,status,created_at,cancelled_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`).run(legacyId,'SB-LEGACY',space.id,space.name,'Guest','guest@example.org',token,begin,end,2,space.hourly_rate,space.hourly_rate*2,'confirmed',new Date().toISOString());
  const legacyPayload={spaceId:space.id,date,startTime:'10:00',durationHours:2,customerName:'Guest',customerEmail:'guest@example.org'};
  db.prepare('INSERT INTO booking_submissions(submission_key,request_json,booking_id) VALUES (?,?,?)').run(legacyKey,JSON.stringify(legacyPayload),legacyId);
  migrate(db);migrate(db);seed(db);
  const db2=openDatabase(dbPath);
  const servers=await Promise.all([listen(createApp(db,'development')),listen(createApp(db2,'test'))]);
  const normal=servers[0]!,isolated=servers[1]!;
  try{
    assert.equal((await request(normal.base,'/api/spaces')).status,200);
    assert.equal((await request(normal.base,'/api/spaces?minCapacity=none')).status,400);
    assert.equal((await request(normal.base,'/api/spaces/not-an-id')).status,400);
    assert.equal((await request(normal.base,`/api/spaces/${randomUUID()}`)).status,404);
    assert.equal((await request(normal.base,'/api/test-support/spaces','POST',{})).status,404);
    assert.equal((await request(normal.base,'/api/test-support/users/'+randomUUID(),'DELETE')).status,404);
    assert.equal((await request(normal.base,'/api/me/bookings')).status,401);
    assert.equal((await request(normal.base,'/api/bookings','POST',slotData({id:space.id} as Space),'',randomUUID())).status,401);
    assert.equal((await request(normal.base,'/api/auth/signup','POST',{fullName:'A',email:'not-email',password:'short'})).status,400);
    assert.equal((await request(normal.base,'/api/auth/signup','POST',{fullName:'A',email:'foo@bar.org',password:'long-enough-secret'},'','', 'https://evil.example')).status,403);
    const first=await signup(normal.base,'First@Example.ORG','First User');assert.equal(first.status,201);
    assert.equal(first.data.user.email,'first@example.org');
    const cookie1=first.cookie;
    assert.equal((await signup(normal.base,'FIRST@example.org')).status,409);
    const second=await signup(normal.base,'second@example.org','Second User');assert.equal(second.status,201);
    const cookie2=second.cookie;
    assert.equal((await request(normal.base,'/api/auth/me','GET',undefined,cookie1)).data.user.id,first.data.user.id);
    assert.equal((await request(normal.base,'/api/auth/signin','POST',{email:'first@example.org',password:'wrong-password'})).status,401);
    const login=await request(normal.base,'/api/auth/signin','POST',{email:'FIRST@example.org',password:'a-test-password-1234'});
    assert.equal(login.status,200);
    assert.ok(login.cookie);
    const cookie1b=login.cookie;
    const spaces=(await request(normal.base,'/api/spaces')).data.spaces as Space[];
    const photographic=spaces.find(s=>s.type==='photography-studio')!;
    const open=await request(normal.base,`/api/spaces/${photographic.id}/availability?date=${slotData(photographic).date}&durationHours=2`);
    assert.equal(open.status,200);
    const slot=open.data.slots[0];assert.ok(slot);
    const payload={...slotData(photographic),startTime:slot.startTime};
    const key=randomUUID(),differentKey=randomUUID();
    // Two independently opened SQLite connections attempt the same space/slot simultaneously.
    const [a,b]=await Promise.all([
      request(normal.base,'/api/bookings','POST',payload,cookie1b,key),
      request(isolated.base,'/api/bookings','POST',payload,cookie2,differentKey)
    ]);
    assert.deepEqual([a.status,b.status].sort(),[201,409]);
    const created=a.status===201?a:b;
    const ownerCookie=a.status===201?cookie1b:cookie2;
    const otherCookie=a.status===201?cookie2:cookie1b;
    const winningKey=a.status===201?key:differentKey;
    const booking=created.data.booking as Booking;
    assert.equal(booking.customerName,a.status===201?'First User':'Second User');
    assert.equal(booking.totalPrice,photographic.hourlyRate*2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bookings WHERE user_id IS NOT NULL').get()?.n,1);
    assert.equal((await request(normal.base,'/api/bookings','POST',payload,ownerCookie,winningKey)).status,200);
    assert.equal((await request(normal.base,'/api/bookings','POST',{...payload,durationHours:1},ownerCookie,winningKey)).data.error.code,'IDEMPOTENCY_KEY_REUSED');
    assert.equal((await request(normal.base,'/api/bookings','POST',payload,otherCookie,winningKey)).status,404);
    const privatePath=new URL(booking.confirmationUrl).pathname;
    assert.equal((await request(normal.base,'/api'+privatePath)).status,404); // Private path is not an API endpoint.
    const tokenPath='/api/bookings/'+privatePath.split('/').pop();
    assert.equal((await request(normal.base,tokenPath)).status,404);
    assert.equal((await request(normal.base,tokenPath,'GET',undefined,otherCookie)).status,404);
    assert.equal((await request(normal.base,tokenPath,'GET',undefined,ownerCookie)).status,200);
    assert.equal((await request(normal.base,tokenPath+'/cancel','POST',undefined,otherCookie)).status,404);
    const ownList=await request(normal.base,'/api/me/bookings','GET',undefined,ownerCookie);
    assert.equal(ownList.status,200);assert.equal(ownList.data.bookings.length,1);
    assert.equal((await request(normal.base,'/api/me/bookings','GET',undefined,otherCookie)).data.bookings.length,0);
    const adjacentPayload={...payload,startTime:slot.endTime,durationHours:1};
    const adjacentKey=randomUUID();
    const [adjacent,adjacentReplay]=await Promise.all([
      request(normal.base,'/api/bookings','POST',adjacentPayload,ownerCookie,adjacentKey),
      request(isolated.base,'/api/bookings','POST',adjacentPayload,ownerCookie,adjacentKey)
    ]);
    assert.deepEqual([adjacent.status,adjacentReplay.status].sort(),[200,201]);
    assert.equal(adjacent.data.booking.id,adjacentReplay.data.booking.id);
    assert.equal((await request(normal.base,tokenPath+'/cancel','POST',undefined,ownerCookie)).status,200);
    assert.equal((await request(normal.base,tokenPath+'/cancel','POST',undefined,ownerCookie)).status,200);
    const free=await request(normal.base,`/api/spaces/${photographic.id}/availability?date=${payload.date}&durationHours=2`);
    assert.ok(free.data.slots.some((s:{startTime:string})=>s.startTime===slot.startTime));
    // Old private links and unchanged old idempotency records survive the additive migration.
    assert.equal((await request(normal.base,`/api/bookings/${token}`)).status,200);
    assert.equal((await request(normal.base,'/api/bookings','POST',legacyPayload,'',legacyKey)).status,200);
    assert.equal((await request(normal.base,`/api/bookings/${token}/cancel`,'POST')).status,200);
    assert.equal((await request(isolated.base,`/api/test-support/spaces/${space.id}`,'DELETE')).status,409);
    const userId=created.data.booking.customerEmail===first.data.user.email?first.data.user.id:second.data.user.id;
    assert.equal((await request(isolated.base,`/api/test-support/users/${userId}`,'DELETE')).data.error.code,'USER_HAS_BOOKINGS');
    assert.equal((await request(isolated.base,`/api/test-support/bookings/${booking.id}`,'DELETE')).status,204);
    assert.equal((await request(isolated.base,`/api/test-support/bookings/${adjacent.data.booking.id}`,'DELETE')).status,204);
    assert.equal((await request(isolated.base,`/api/test-support/users/${userId}`,'DELETE')).status,204);
    assert.equal((await request(isolated.base,`/api/test-support/users/${userId}`,'DELETE')).status,204);
    assert.equal((await request(normal.base,'/api/auth/me','GET',undefined,ownerCookie)).status,401);
    assert.equal((await request(normal.base,'/api/auth/signout','POST',undefined,otherCookie)).status,204);
    assert.equal((await request(normal.base,'/api/auth/signout','POST',undefined,otherCookie)).status,204);
    assert.equal((await request(normal.base,'/api/auth/me','GET',undefined,otherCookie)).status,401);
    const badUser='throttle@example.org';
    for(let attempt=0;attempt<10;attempt++){
      const failed=await request(normal.base,'/api/auth/signin','POST',{email:badUser,password:'nope'});
      assert.equal(failed.status,401);
    }
    assert.equal((await request(normal.base,'/api/auth/signin','POST',{email:badUser,password:'nope'})).status,429);
    const opening=Object.fromEntries(Array.from({length:7},(_,i)=>[String(i+1),{opensAt:'09:00',closesAt:'18:00'}]));
    assert.equal((await request(isolated.base,'/api/test-support/spaces','POST',{name:'Bad'})).status,400);
    const testSpace=await request(isolated.base,'/api/test-support/spaces','POST',{name:'Integration Space',type:'podcast-booth',capacity:1,equipment:[],hourlyRate:1000,openingHours:opening});
    assert.equal(testSpace.status,201);
    assert.equal((await request(normal.base,`/api/spaces/${testSpace.data.space.id}`)).status,200);
    const nextYear=DateTime.now().setZone(TIMEZONE).year+1;
    const dstOpening=Object.fromEntries(Array.from({length:7},(_,i)=>[String(i+1),{opensAt:'00:00',closesAt:'05:00'}]));
    const dstSpace=await request(isolated.base,'/api/test-support/spaces','POST',{name:'DST Space',type:'podcast-booth',capacity:1,equipment:[],hourlyRate:1000,openingHours:dstOpening});
    assert.equal(dstSpace.status,201);
    const dstUser=await signup(normal.base,'dst@example.org');
    assert.equal(dstUser.status,201);
    for(const month of [3,10]){
      const date=DateTime.local(nextYear,month,31).minus({days:DateTime.local(nextYear,month,31).weekday%7}).toISODate()!;
      const invalid=await request(normal.base,'/api/bookings','POST',{spaceId:dstSpace.data.space.id,date,startTime:'02:00',durationHours:1},dstUser.cookie,randomUUID());
      assert.equal(invalid.status,400);
      assert.equal(invalid.data.error.code,'INVALID_LOCAL_TIME');
    }
    assert.equal((await request(isolated.base,`/api/test-support/spaces/${dstSpace.data.space.id}`,'DELETE')).status,204);
    assert.equal((await request(isolated.base,`/api/test-support/spaces/${testSpace.data.space.id}`,'DELETE')).status,204);
    assert.equal((await request(normal.base,`/api/spaces/${testSpace.data.space.id}`)).status,404);
    const after=openDatabase(dbPath);
    assert.equal((after.prepare('PRAGMA foreign_keys').get() as {foreign_keys:number}).foreign_keys,1);
    assert.equal(after.prepare('SELECT COUNT(*) AS n FROM bookings WHERE id=?').get(legacyId)?.n,1);
    after.close();
  }finally{
    await Promise.all(servers.map(s=>stop(s.server)));
    db.close();db2.close();rmSync(dir,{recursive:true,force:true});
  }
});
