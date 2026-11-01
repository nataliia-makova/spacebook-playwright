import express, { type Request, type Response, type NextFunction } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DateTime } from 'luxon';
import { z } from 'zod';
import {
  availabilityQuerySchema, bookingInputSchema, createSpaceSchema, spacesQuerySchema, uuidSchema,
  TIMEZONE, CURRENCY, type Booking, type Space, type Slot
} from '../shared/contracts.js';
import { immediate, type Database } from './db.js';
import { config } from './config.js';

type SpaceRow = { id:string; name:string; type:Space['type']; capacity:number; equipment_json:string; hourly_rate:number; opening_hours_json:string; image_url:string };
type BookingRow = { id:string; reference:string; space_id:string; space_name:string; customer_name:string; customer_email:string; private_token:string; starts_at:string; ends_at:string; duration_hours:number; hourly_rate:number; total_price:number; status:'confirmed'|'cancelled'; created_at:string; cancelled_at:string|null };
type SubmitRow = { request_json:string; booking_id:string };

export class HttpError extends Error {
  constructor(public status:number, public code:string, message:string, public fieldErrors?:Record<string,string>) { super(message); }
}
const bad = (message:string, field?:string, code='VALIDATION_ERROR') => new HttpError(400, code, message, field ? {[field]:message} : undefined);
const missing = () => new HttpError(404, 'NOT_FOUND', 'This resource could not be found.');
const format = (row:SpaceRow):Space => ({ id:row.id, name:row.name, type:row.type, capacity:row.capacity,
  equipment: JSON.parse(row.equipment_json) as string[], hourlyRate:row.hourly_rate,
  openingHours:JSON.parse(row.opening_hours_json) as Space['openingHours'],
  imageUrl:row.image_url, timezone:TIMEZONE, currency:CURRENCY });
const bookingView = (b:BookingRow):Booking => ({
  id:b.id, reference:b.reference, spaceId:b.space_id, spaceName:b.space_name,
  customerName:b.customer_name, customerEmail:b.customer_email,
  startsAt:b.starts_at, endsAt:b.ends_at, durationHours:b.duration_hours,
  hourlyRate:b.hourly_rate, totalPrice:b.total_price, status:b.status,
  createdAt:b.created_at, cancelledAt:b.cancelled_at, currency:CURRENCY, timezone:TIMEZONE,
  confirmationUrl:`${config.origin}/bookings/${b.private_token}`
});
function parse<T>(schema:z.ZodType<T>, input:unknown):T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors:Record<string,string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  throw new HttpError(400,'VALIDATION_ERROR','Check the highlighted fields and try again.',fieldErrors);
}
function validateId(id:string):string { return parse(uuidSchema,id); }
function noQuery(req:Request):void { if(Object.keys(req.query).length)throw bad('Unexpected query parameters.'); }
function findSpace(db:Database,id:string):Space {
  const row = db.prepare('SELECT * FROM spaces WHERE id=?').get(id) as SpaceRow | undefined;
  if (!row) throw missing();
  return format(row);
}
function findBookingById(db:Database,id:string):BookingRow {
  const row = db.prepare('SELECT * FROM bookings WHERE id=?').get(id) as BookingRow | undefined;
  if (!row) throw missing();
  return row;
}
function findBookingByToken(db:Database,token:string):BookingRow {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw missing();
  const row = db.prepare('SELECT * FROM bookings WHERE private_token=?').get(token) as BookingRow | undefined;
  if (!row) throw missing();
  return row;
}
function isDate(date:string):boolean {
  const d=DateTime.fromISO(date,{zone:TIMEZONE});
  return d.isValid && d.toISODate()===date;
}
function local(date:string, time:string):DateTime {
  const dt = DateTime.fromISO(`${date}T${time}`,{zone:TIMEZONE});
  if (!dt.isValid || dt.toFormat('yyyy-MM-dd')!==date || dt.toFormat('HH:mm')!==time || dt.getPossibleOffsets().length!==1)
    throw bad('This clock time is unavailable because of a daylight-saving change.', 'startTime','INVALID_LOCAL_TIME');
  return dt;
}
function getRange(space:Space, date:string, startTime:string, hours:number, requireFuture=true):{start:DateTime;end:DateTime;endTime:string} {
  if (!isDate(date)) throw bad('Enter a valid date.','date');
  const startHour=Number(startTime.slice(0,2));
  const endHour=startHour+hours;
  const day=DateTime.fromISO(date,{zone:TIMEZONE}).weekday as 1|2|3|4|5|6|7;
  const hoursForDay=space.openingHours[String(day) as keyof Space['openingHours']];
  if (!hoursForDay || startTime < hoursForDay.opensAt || endHour > Number(hoursForDay.closesAt.slice(0,2)))
    throw bad('The selected time must fit within this space’s opening hours.', 'startTime');
  const endTime=`${String(endHour).padStart(2,'0')}:00`;
  const start=local(date,startTime);
  let end:DateTime;
  try { end=local(date,endTime); }
  catch(error) {
    if (error instanceof HttpError && error.code==='INVALID_LOCAL_TIME')
      throw bad('This time range crosses an unsupported daylight-saving change.','startTime','INVALID_LOCAL_TIME');
    throw error;
  }
  if (end.toMillis()-start.toMillis()!==hours*3_600_000)
    throw bad('This time range crosses an unsupported daylight-saving change.','startTime','INVALID_LOCAL_TIME');
  if (requireFuture && start.toMillis()<=Date.now()) throw bad('Choose a future start time.','startTime');
  return {start,end,endTime};
}
function available(db:Database,spaceId:string,begin:string,end:string):boolean {
  return !db.prepare(`SELECT 1 FROM bookings WHERE space_id=? AND status='confirmed'
    AND starts_at < ? AND ends_at > ? LIMIT 1`).get(spaceId,end,begin);
}
function slots(db:Database,space:Space,date:string,duration:number):Slot[] {
  if (!isDate(date)) throw bad('Enter a valid date.','date');
  const day=DateTime.fromISO(date,{zone:TIMEZONE}).weekday as 1|2|3|4|5|6|7;
  const opening=space.openingHours[String(day) as keyof Space['openingHours']];
  if (!opening) return [];
  const options:Slot[]=[];
  for (let h=Number(opening.opensAt.slice(0,2));h+duration<=Number(opening.closesAt.slice(0,2));h++) {
    const time=`${String(h).padStart(2,'0')}:00`;
    try {
      const r=getRange(space,date,time,duration);
      if (available(db,space.id,r.start.toUTC().toISO()!,r.end.toUTC().toISO()!))
        options.push({startTime:time,endTime:r.endTime});
    } catch (error) { if (!(error instanceof HttpError && error.status===400)) throw error; }
  }
  return options;
}

export function createApp(db:Database, mode=config.mode) {
  const app=express();
  app.disable('x-powered-by');
  app.use('/api',express.json({limit:'20kb',strict:true}));
  app.get('/api/spaces',(req,res) => {
    const query=parse(spacesQuerySchema,req.query);
    const rows=db.prepare(`SELECT * FROM spaces WHERE (? IS NULL OR type=?)
      AND (? IS NULL OR capacity>=?) ORDER BY name COLLATE NOCASE,id`).all(
        query.type??null,query.type??null,query.minCapacity??null,query.minCapacity??null
      ) as SpaceRow[];
    res.json({spaces:rows.map(format)});
  });
  app.get('/api/spaces/:spaceId',(req,res) => { noQuery(req);res.json({space:findSpace(db,validateId(req.params.spaceId!))}); });
  app.get('/api/spaces/:spaceId/availability',(req,res) => {
    const id=validateId(req.params.spaceId!);
    const query=parse(availabilityQuerySchema,req.query);
    const space=findSpace(db,id);
    res.json({spaceId:id,date:query.date,durationHours:query.durationHours,timezone:TIMEZONE,
      hourlyRate:space.hourlyRate,totalPrice:space.hourlyRate*query.durationHours,
      slots:slots(db,space,query.date,query.durationHours)});
  });
  app.post('/api/bookings',(req,res) => {
    noQuery(req);
    const key=parse(uuidSchema,req.header('Idempotency-Key'));
    const data=parse(bookingInputSchema,req.body);
    if (!isDate(data.date)) throw bad('Enter a valid date.','date');
    const normalized=JSON.stringify(data);
    const response=immediate(db,()=>{
      // A replay is checked before checking the clock, space or availability.
      const existing=db.prepare('SELECT * FROM booking_submissions WHERE submission_key=?').get(key) as SubmitRow|undefined;
      if (existing) {
        if (existing.request_json!==normalized) throw new HttpError(409,'IDEMPOTENCY_KEY_REUSED','This submission identifier belongs to a different booking attempt.');
        return {booking:bookingView(findBookingById(db,existing.booking_id)),created:false};
      }
      const space=findSpace(db,data.spaceId);
      const range=getRange(space,data.date,data.startTime,data.durationHours);
      const start=range.start.toUTC().toISO()!;
      const end=range.end.toUTC().toISO()!;
      if (!available(db,space.id,start,end))
        throw new HttpError(409,'BOOKING_CONFLICT','That time is no longer available. Choose another start time.');
      const id=randomUUID();
      const reference=`SB-${randomBytes(7).toString('hex').toUpperCase()}`;
      const token=randomBytes(24).toString('base64url');
      const createdAt=new Date().toISOString();
      db.prepare(`INSERT INTO bookings(id,reference,space_id,space_name,customer_name,customer_email,private_token,
        starts_at,ends_at,duration_hours,hourly_rate,total_price,status,created_at,cancelled_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`).run(id,reference,space.id,space.name,data.customerName,data.customerEmail,token,
          start,end,data.durationHours,space.hourlyRate,space.hourlyRate*data.durationHours,'confirmed',createdAt);
      db.prepare('INSERT INTO booking_submissions(submission_key,request_json,booking_id) VALUES (?,?,?)').run(key,normalized,id);
      return {booking:bookingView(findBookingById(db,id)),created:true};
    });
    res.status(response.created?201:200).json({booking:response.booking});
  });
  app.get('/api/bookings/:token',(req,res) => { noQuery(req);res.json({booking:bookingView(findBookingByToken(db,req.params.token!))}); });
  app.post('/api/bookings/:token/cancel',(req,res) => {
    noQuery(req);
    if (req.body !== undefined && (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body as object).length))
      throw bad('Cancellation does not accept additional fields.');
    const booking=immediate(db,()=>{
      const found=findBookingByToken(db,req.params.token!);
      if (found.status==='cancelled') return found;
      if (Date.parse(found.starts_at)<=Date.now())
        throw new HttpError(409,'CANCELLATION_CLOSED','This booking has already started and cannot be cancelled.');
      db.prepare(`UPDATE bookings SET status='cancelled',cancelled_at=? WHERE id=?`).run(new Date().toISOString(),found.id);
      return findBookingById(db,found.id);
    });
    res.json({booking:bookingView(booking)});
  });

  // Intentionally completely unavailable unless APP_ENV=test; no secret token or admin UI.
  const test=express.Router();
  test.post('/spaces',(req,res) => {
    noQuery(req);
    const data=parse(createSpaceSchema,req.body);
    const id=randomUUID();
    const image:Record<Space['type'],string>={
      'photography-studio':'/images/daylight-studio.webp',
      'rehearsal-room':'/images/rehearsal-room.svg',
      'podcast-booth':'/images/podcast-booth.svg'
    };
    immediate(db,()=>db.prepare(`INSERT INTO spaces
      (id,name,type,capacity,equipment_json,hourly_rate,opening_hours_json,image_url)
      VALUES(?,?,?,?,?,?,?,?)`).run(id,data.name,data.type,data.capacity,JSON.stringify(data.equipment),data.hourlyRate,JSON.stringify(data.openingHours),image[data.type]));
    res.status(201).json({space:findSpace(db,id)});
  });
  test.delete('/bookings/:bookingId',(req,res) => {
    noQuery(req);
    const id=validateId(req.params.bookingId!);
    immediate(db,()=>db.prepare('DELETE FROM bookings WHERE id=?').run(id));
    res.status(204).end();
  });
  test.delete('/spaces/:spaceId',(req,res) => {
    noQuery(req);
    const id=validateId(req.params.spaceId!);
    immediate(db,()=>{
      if (db.prepare('SELECT 1 FROM bookings WHERE space_id=? LIMIT 1').get(id))
        throw new HttpError(409,'SPACE_HAS_BOOKINGS','Delete all bookings for this space before deleting it.');
      db.prepare('DELETE FROM spaces WHERE id=?').run(id);
    });
    res.status(204).end();
  });
  app.use('/api/test-support',(req,res,next) => mode==='test' ? test(req,res,next) : res.status(404).json({error:{code:'NOT_FOUND',message:'This resource could not be found.'}}));
  app.use('/api',(req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'This resource could not be found.'}}));

  const root=path.resolve(process.cwd(),'dist');
  if (existsSync(path.join(root,'index.html'))) {
    app.use(express.static(root));
    app.use((req,res,next)=>{
      if (req.method==='GET' && !req.path.startsWith('/api/')) res.sendFile(path.join(root,'index.html'));
      else next();
    });
  }
  app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
    if (error instanceof HttpError) {
      res.status(error.status).json({error:{code:error.code,message:error.message,...(error.fieldErrors?{fieldErrors:error.fieldErrors}:{})}});
      return;
    }
    if (typeof error==='object' && error!==null && 'type' in error && typeof error.type==='string' && error.type.startsWith('entity.')) {
      res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Send a valid JSON request within the size limit.'}});
      return;
    }
    // No request bodies, tokens, emails, keys, SQL, or stack traces in routine logs or responses.
    console.error('Unexpected API failure:', error instanceof Error ? error.name : 'Unknown error');
    res.status(500).json({error:{code:'INTERNAL_ERROR',message:'Something went wrong on the server. Please try again.'}});
  });
  return app;
}
