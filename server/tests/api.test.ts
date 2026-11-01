import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { DateTime } from 'luxon';
import { createApp } from '../app.js';
import { openDatabase, migrate } from '../db.js';
import { seed } from '../seed.js';
import { TIMEZONE, type Space } from '../../shared/contracts.js';

async function stop(server:Server):Promise<void>{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
async function request(base:string,url:string,method='GET',body?:unknown,key?:string){
  const response=await fetch(base+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});
  const data=response.status===204?null:await response.json();
  return {status:response.status,data};
}
test('normal API, concurrency, persistence, idempotency, cancellation and test support',async()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'spacebook-tests-'));
  const dbfile=path.join(dir,'isolated.sqlite');
  const db=openDatabase(dbfile);migrate(db);seed(db);seed(db);
  const db2=openDatabase(dbfile);
  const normal=createApp(db,'development').listen(0,'127.0.0.1');
  const testServer=createApp(db2,'test').listen(0,'127.0.0.1');
  const getBase=async(server:Server)=>{
    await once(server,'listening');
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    return `http://127.0.0.1:${address.port}`;
  };
  // Register both listening handlers before awaiting either server.
  const [normalBase,testBase]=await Promise.all([getBase(normal),getBase(testServer)]);
  try {
    const list=await request(normalBase,'/api/spaces');assert.equal(list.status,200);assert.equal(list.data.spaces.length,3);
    const space=list.data.spaces.find((s:Space)=>s.type==='photography-studio') as Space;
    assert.ok(space);
    assert.equal((await request(normalBase,'/api/spaces?type=photography-studio&minCapacity=7')).data.spaces.length,0);
    assert.equal((await request(normalBase,'/api/spaces?type=podcast-booth&minCapacity=3')).data.spaces.length,1);
    assert.equal((await request(normalBase,'/api/spaces?minCapacity=oops')).status,400);
    assert.equal((await request(normalBase,'/api/spaces?type=unknown')).status,400);
    assert.equal((await request(normalBase,'/api/spaces/not-uuid')).status,400);
    assert.equal((await request(normalBase,`/api/spaces/${randomUUID()}`)).status,404);
    assert.equal((await request(normalBase,'/api/bookings/missing')).status,404);
    assert.equal((await request(normalBase,'/api/test-support/spaces','POST',{})).status,404);
    assert.equal((await request(normalBase,'/api/test-support/spaces/'+space.id,'DELETE')).status,404);
    const date=DateTime.now().setZone(TIMEZONE).plus({days:14}).toISODate()!;
    const available=await request(normalBase,`/api/spaces/${space.id}/availability?date=${date}&durationHours=2`);
    assert.equal(available.status,200);assert.ok(available.data.slots.length>1);
    assert.ok(!JSON.stringify(available.data).includes('customerName'));
    assert.equal((await request(normalBase,`/api/spaces/${space.id}/availability?date=2026-02-30&durationHours=2`)).status,400);
    const slot=available.data.slots[0] as {startTime:string;endTime:string};
    const payload={spaceId:space.id,date,startTime:slot.startTime,durationHours:2,customerName:' Customer  ',customerEmail:' customer@example.com '};
    assert.equal((await request(normalBase,'/api/bookings','POST',{...payload,unexpected:1},randomUUID())).status,400);
    assert.equal((await request(normalBase,'/api/bookings','POST',payload)).status,400);
    assert.equal((await request(normalBase,'/api/bookings','POST',{...payload,durationHours:5},randomUUID())).status,400);
    assert.equal((await request(normalBase,'/api/bookings','POST',{...payload,date:'2024-01-01'},randomUUID())).status,400);
    const malformed=await fetch(normalBase+'/api/bookings',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:'{broken'});
    assert.equal(malformed.status,400);
    const key1=randomUUID(),key2=randomUUID();
    const [a,b]=await Promise.all([request(normalBase,'/api/bookings','POST',payload,key1),request(testBase,'/api/bookings','POST',payload,key2)]);
    assert.deepEqual([a.status,b.status].sort(),[201,409]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bookings').get()?.n,1);
    const created=a.status===201?a:b;
    const winningKey=a.status===201?key1:key2;
    const booking=created.data.booking;
    assert.equal(booking.totalPrice,6000);assert.equal(booking.customerName,'Customer');
    assert.ok(booking.confirmationUrl.includes('/bookings/'));
    const token=new URL(booking.confirmationUrl).pathname.split('/').pop()!;
    assert.equal((await request(normalBase,`/api/bookings/${token}`)).status,200);
    assert.equal((await request(normalBase,'/api/bookings','POST',payload,winningKey)).status,200);
    assert.equal((await request(normalBase,'/api/bookings','POST',{...payload,customerName:'Other'},winningKey)).data.error.code,'IDEMPOTENCY_KEY_REUSED');
    const adjacentKey=randomUUID();
    const [adjacent,replayAdjacent]=await Promise.all([
      request(normalBase,'/api/bookings','POST',{...payload,startTime:slot.endTime,durationHours:1},adjacentKey),
      request(testBase,'/api/bookings','POST',{...payload,startTime:slot.endTime,durationHours:1},adjacentKey)
    ]);
    assert.deepEqual([adjacent.status,replayAdjacent.status].sort(),[200,201]);
    assert.equal(adjacent.data.booking.id,replayAdjacent.data.booking.id);
    const cancel=await request(normalBase,`/api/bookings/${token}/cancel`,'POST');
    assert.equal(cancel.status,200);assert.equal(cancel.data.booking.status,'cancelled');
    assert.equal((await request(normalBase,`/api/bookings/${token}/cancel`,'POST')).status,200);
    assert.equal((await request(normalBase,'/api/bookings','POST',payload,winningKey)).data.booking.status,'cancelled');
    assert.equal((await request(normalBase,'/api/bookings','POST',payload,winningKey)).status,200);
    const free=await request(normalBase,`/api/spaces/${space.id}/availability?date=${date}&durationHours=2`);
    assert.ok(free.data.slots.some((s:{startTime:string})=>s.startTime===slot.startTime));
    assert.equal((await request(testBase,'/api/test-support/spaces','POST',{name:'Broken'})).status,400);
    const weekday=Object.fromEntries(Array.from({length:7},(_,i)=>[String(i+1),{opensAt:'00:00',closesAt:'05:00'}]));
    const create=await request(testBase,'/api/test-support/spaces','POST',{name:' DST Room ',type:'podcast-booth',capacity:1,equipment:[],hourlyRate:1300,openingHours:weekday});
    assert.equal(create.status,201);assert.equal(create.data.space.name,'DST Room');
    const tempId=create.data.space.id;
    assert.equal((await request(normalBase,`/api/spaces/${tempId}`)).status,200);
    for(const date of ['2027-03-28','2027-10-31']){
      const dst=await request(normalBase,'/api/bookings','POST',{...payload,spaceId:tempId,date,startTime:'02:00',durationHours:1},randomUUID());
      assert.equal(dst.status,400);assert.equal(dst.data.error.code,'INVALID_LOCAL_TIME');
    }
    const tempKey=randomUUID();
    const tempBooking=await request(testBase,'/api/bookings','POST',{...payload,spaceId:tempId,date:'2027-12-01',startTime:'01:00',durationHours:1},tempKey);
    assert.equal(tempBooking.status,201);
    assert.equal((await request(testBase,`/api/test-support/spaces/${tempId}`,'DELETE')).data.error.code,'SPACE_HAS_BOOKINGS');
    const tempToken=new URL(tempBooking.data.booking.confirmationUrl).pathname.split('/').pop()!;
    assert.equal((await request(testBase,`/api/bookings/${tempToken}/cancel`,'POST')).status,200);
    assert.equal((await request(testBase,`/api/test-support/spaces/${tempId}`,'DELETE')).status,409);
    assert.equal((await request(testBase,`/api/test-support/bookings/${tempBooking.data.booking.id}`,'DELETE')).status,204);
    assert.equal((await request(testBase,`/api/test-support/bookings/${tempBooking.data.booking.id}`,'DELETE')).status,204);
    assert.equal((await request(testBase,`/api/bookings/${tempToken}`)).status,404);
    assert.equal(db.prepare('SELECT 1 FROM booking_submissions WHERE submission_key=?').get(tempKey),undefined);
    assert.equal((await request(testBase,`/api/test-support/spaces/${tempId}`,'DELETE')).status,204);
    assert.equal((await request(testBase,`/api/test-support/spaces/${tempId}`,'DELETE')).status,204);
    assert.equal((await request(normalBase,`/api/spaces/${tempId}`)).status,404);
    const stillThere=await request(normalBase,`/api/spaces/${space.id}`);assert.equal(stillThere.status,200);
    const fk=db.prepare('PRAGMA foreign_keys').get() as {'foreign_keys':number};assert.equal(fk.foreign_keys,1);
  } finally { await stop(normal);await stop(testServer);db.close();db2.close(); }
  const reopened=openDatabase(dbfile);
  try { assert.equal((reopened.prepare('SELECT COUNT(*) AS n FROM bookings').get() as {n:number}).n,2); }
  finally {reopened.close();rmSync(dir,{recursive:true,force:true});}
});
