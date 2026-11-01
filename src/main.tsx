import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import { bookingInputSchema, TIMEZONE, type Availability, type Booking, type BookingInput, type Space, spaceTypes, type Slot } from '../shared/contracts.js';
import './styles.css';

const money=(cents:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',minimumFractionDigits:cents%100===0?0:2,maximumFractionDigits:2}).format(cents/100);
const prettyType=(t:string)=>t.split('-').map(x=>x[0]!.toUpperCase()+x.slice(1)).join(' ');
const tomorrow=()=>DateTime.now().setZone(TIMEZONE).plus({days:1}).toISODate()!;
const dateLabel=(s:string)=>DateTime.fromISO(s,{zone:TIMEZONE}).toLocaleString({day:'numeric',month:'long',year:'numeric'});
const utcLocal=(s:string)=>DateTime.fromISO(s,{zone:'utc'}).setZone(TIMEZONE);
const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

type FieldErrors=Record<string,string>;
class ApiProblem extends Error {
  constructor(public status:number, public code:string, message:string, public fields:FieldErrors={}){super(message);}
}
async function api<T>(url:string,options:RequestInit={}):Promise<T>{
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),10000);
  try {
    const response=await fetch(url,{...options,signal:controller.signal,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
    if (!response.ok){
      let p:{error?:{code?:string;message?:string;fieldErrors?:FieldErrors}}={};
      try {p=await response.json() as typeof p;}catch { /* non-JSON upstream response */ }
      throw new ApiProblem(response.status,p.error?.code||'REQUEST_FAILED',p.error?.message||'The request could not be completed.',p.error?.fieldErrors);
    }
    return await response.json() as T;
  } catch(error){
    if(error instanceof ApiProblem)throw error;
    throw new ApiProblem(0,'CONNECTION_ERROR','The server could not be reached or the request timed out.');
  }finally{window.clearTimeout(timeout);}
}
function useRead<T>(url:string|null){
  const [reloadId,setReloadId]=useState(0);
  const [state,setState]=useState<{data:T|null;loading:boolean;error:ApiProblem|null}>({data:null,loading:true,error:null});
  useEffect(()=>{
    if(!url){setState({data:null,loading:false,error:null});return;}
    let active=true;
    setState({data:null,loading:true,error:null});
    api<T>(url).then(data=>{if(active)setState({data,loading:false,error:null});})
      .catch((error:ApiProblem)=>{if(active)setState({data:null,loading:false,error});});
    return ()=>{active=false;};
  },[url,reloadId]);
  return {...state,retry:()=>setReloadId(id=>id+1)};
}
function Header(){return <header className="site-header"><Link to="/spaces" className="wordmark">SpaceBook</Link><nav aria-label="Main"><Link to="/spaces">Browse spaces</Link></nav></header>;}
function Alert({children}:React.PropsWithChildren){return <div className="alert" role="alert">{children}</div>;}
function ReadError({error,onRetry}:{error:ApiProblem;onRetry:()=>void}){
  return error.status===404||error.status===400?<NotFound embedded/>:<div className="read-error" role="alert"><h3>We couldn’t load this right now.</h3><p>{error.message}</p><button type="button" className="outline-btn" onClick={onRetry}>Retry</button></div>;
}
function NotFound({embedded=false}:{embedded?:boolean}){return <section className={embedded?'missing embedded':'missing'}><span className="eyebrow">Unavailable</span><h1>We couldn’t find that page.</h1><p>The space or booking may have been removed, or the link may be incorrect.</p><Link className="primary-btn link-btn" to="/spaces">Browse spaces</Link></section>;}
function Spinner({label='Loading…'}:{label?:string}){return <div className="loading" role="status"><span className="spinner" aria-hidden="true"/>{label}</div>;}
function SpaceCard({space}:{space:Space}){return <Link to={`/spaces/${space.id}`} className="space-card"><img src={space.imageUrl} alt={`${space.name} venue`}/><div className="card-inner"><div className="card-title-row"><h2>{space.name}</h2><span className="card-price">{money(space.hourlyRate)}<small> / hour</small></span></div><p>{prettyType(space.type)} <span aria-hidden="true">·</span> Up to {space.capacity} people</p><span className="view-link">Explore space <span aria-hidden="true">↗</span></span></div></Link>;}
function Browse(){
  const [type,setType]=useState('');const [capacity,setCapacity]=useState('');
  const query=new URLSearchParams();if(type)query.set('type',type);if(capacity)query.set('minCapacity',capacity);
  const url=`/api/spaces${query.size?'?'+query.toString():''}`;
  const {data,loading,error,retry}=useRead<{spaces:Space[]}>(url);
  return <main className="browse shell"><div className="browse-heading"><span className="eyebrow">Spaces for making</span><h1>Find room for your next idea.</h1><p>Thoughtful spaces for photography, music, and conversation. Book by the hour.</p></div><div className="filters" aria-label="Filter spaces"><div className="field"><label htmlFor="type-filter">Space type</label><select id="type-filter" value={type} onChange={e=>setType(e.target.value)}><option value="">All types</option>{spaceTypes.map(t=><option key={t} value={t}>{prettyType(t)}</option>)}</select></div><div className="field"><label htmlFor="capacity-filter">Minimum capacity</label><select id="capacity-filter" value={capacity} onChange={e=>setCapacity(e.target.value)}><option value="">Any size</option>{[1,2,3,4,5,6,8,10].map(n=><option key={n} value={n}>{n}+ people</option>)}</select></div><button className="text-button" type="button" onClick={()=>{setType('');setCapacity('');}} disabled={!type&&!capacity}>Clear filters</button></div>{loading?<Spinner label="Finding spaces…"/>:error?<ReadError error={error} onRetry={retry}/>:data?.spaces.length?<><p className="results-count">{data.spaces.length} {data.spaces.length===1?'space':'spaces'} available to explore</p><div className="space-grid">{data.spaces.map(space=><SpaceCard key={space.id} space={space}/>)}</div></>:<div className="empty"><h2>No spaces match these filters.</h2><p>Try a different type or lower the minimum capacity.</p><button type="button" className="outline-btn" onClick={()=>{setType('');setCapacity('');}}>Show all spaces</button></div>}</main>;
}

type Pending={key:string;payload:BookingInput};
const storageKey='spacebook:uncertain-booking';
function getAnyPending():Pending|null{
  try {const raw=sessionStorage.getItem(storageKey);if(!raw)return null;const x=JSON.parse(raw) as Pending;return x.payload?.spaceId&&typeof x.key==='string'?x:null;}
  catch {return null;}
}
function storedPending(spaceId:string):Pending|null{
  const x=getAnyPending();return x?.payload.spaceId===spaceId?x:null;
}
function savePending(p:Pending):boolean {try{sessionStorage.setItem(storageKey,JSON.stringify(p));return true;}catch{return false;}}
function clearPending(){try{sessionStorage.removeItem(storageKey);}catch{/* no storage */}}
function formErrors(payload:BookingInput){
  const result=bookingInputSchema.safeParse(payload);
  const errors:FieldErrors={};
  if(!result.success)for(const issue of result.error.issues){const key=String(issue.path[0]||'_form');if(!errors[key])errors[key]=issue.message;}
  return errors;
}
function focusField(errors:FieldErrors){
  const fields=['date','durationHours','startTime','customerName','customerEmail'];
  const first=fields.find(x=>errors[x]);
  if(first)window.requestAnimationFrame(()=>document.getElementById(first)?.focus());
}
function FieldMessage({name,errors}:{name:string;errors:FieldErrors}){return errors[name]?<p className="field-error" id={`${name}-error`}>{errors[name]}</p>:null;}
function BookingForm({space}:{space:Space}){
  const navigate=useNavigate();
  const [initial]=useState(()=>storedPending(space.id));
  const otherPending=getAnyPending();
  const blockedByOther=otherPending&&otherPending.payload.spaceId!==space.id;
  const [date,setDate]=useState(initial?.payload.date||tomorrow());
  const [duration,setDuration]=useState(initial?.payload.durationHours||2);
  const [time,setTime]=useState(initial?.payload.startTime||'');
  const [name,setName]=useState(initial?.payload.customerName||'');
  const [email,setEmail]=useState(initial?.payload.customerEmail||'');
  const [uncertain,setUncertain]=useState<Pending|null>(initial);
  const [submitting,setSubmitting]=useState(false);
  const [errors,setErrors]=useState<FieldErrors>({});
  const [message,setMessage]=useState('');
  const [conflict,setConflict]=useState(false);
  const [spaceMissing,setSpaceMissing]=useState(false);
  const query=new URLSearchParams({date,durationHours:String(duration)});
  const {data,loading,error,retry}=useRead<Availability>(`/api/spaces/${space.id}/availability?${query}`);
  const availableSlots=data?.slots||[];
  const selected=availableSlots.find(s=>s.startTime===time);
  const locked=!!uncertain||submitting;
  useEffect(()=>{if(!loading&&!error&&data&&!uncertain&&time&&!data.slots.some(s=>s.startTime===time))setTime('');},[data,loading,error,time,uncertain]);
  const weekday=DateTime.fromISO(date,{zone:TIMEZONE}).weekday;
  const opening=space.openingHours[String(weekday) as keyof Space['openingHours']];
  const startOptions=opening?Array.from({length:Math.max(0,Number(opening.closesAt.slice(0,2))-Number(opening.opensAt.slice(0,2))-duration+1)},(_,i)=>`${String(Number(opening.opensAt.slice(0,2))+i).padStart(2,'0')}:00`):[];
  const field=(fieldName:string)=>errors[fieldName]?`${fieldName}-error`:undefined;
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();if(submitting)return;
    if(blockedByOther){setMessage('Finish verifying the earlier booking before starting a new one.');return;}
    let attempt:Pending;
    if(uncertain){attempt=uncertain;}
    else{
      const payload={spaceId:space.id,date,startTime:time,durationHours:duration,customerName:name,customerEmail:email};
      const validation=formErrors(payload);
      if(!time)validation.startTime='Choose an available start time.';
      if(!availableSlots.some(s=>s.startTime===time)&&!loading&&!error)validation.startTime='Choose an available start time.';
      if(Object.keys(validation).length){setErrors(validation);setMessage('Please correct the highlighted fields.');focusField(validation);return;}
      if(loading||error){setMessage('Wait for available times to load, or retry loading them.');return;}
      attempt={key:crypto.randomUUID(),payload:{...payload,customerName:name.trim(),customerEmail:email.trim()}};
      if(!savePending(attempt)){setMessage('This browser cannot preserve a safe booking retry. Enable session storage and try again.');return;}
    }
    setErrors({});setMessage('');setConflict(false);setSubmitting(true);
    try{
      const response=await api<{booking:Booking}>('/api/bookings',{method:'POST',headers:{'Idempotency-Key':attempt.key},body:JSON.stringify(attempt.payload)});
      clearPending();setUncertain(null);
      navigate(new URL(response.booking.confirmationUrl).pathname);
    }catch(err){
      const problem=err as ApiProblem;
      if(problem.status===400||problem.status===409||problem.status===404){
        clearPending();setUncertain(null);setErrors(problem.fields||{});
        if(problem.code==='BOOKING_CONFLICT'){setConflict(true);retry();setMessage('Someone just reserved this slot. Choose another available time. Your contact details are saved.');}
        else {setMessage(problem.message);if(problem.status===404)setSpaceMissing(true);}
        if(problem.fields)focusField(problem.fields);
      } else {
        setUncertain(attempt);
        setMessage('We couldn’t verify whether this booking was saved. Your details and submission identifier are preserved. Retry this same request—do not start a new booking.');
      }
    }finally{setSubmitting(false);}
  };
  if(spaceMissing)return <section className="booking-panel"><NotFound embedded/></section>;
  return <section className="booking-panel" aria-labelledby="book-heading"><h2 id="book-heading">Book this space</h2><div className="hero-rate"><strong>{money(space.hourlyRate)}</strong> <span>/ hour</span></div><form onSubmit={submit} noValidate>
    <div className="field"><label htmlFor="date">Date</label><input id="date" type="date" value={date} min={DateTime.now().setZone(TIMEZONE).toISODate()!} disabled={locked} aria-invalid={!!errors.date} aria-describedby={field('date')} onChange={e=>{setDate(e.target.value);setTime('');setErrors({});setMessage('');}}/><small className="muted">All times: {TIMEZONE}</small><FieldMessage name="date" errors={errors}/></div>
    <div className="field"><label htmlFor="durationHours">Duration</label><select id="durationHours" value={duration} disabled={locked} aria-invalid={!!errors.durationHours} aria-describedby={field('durationHours')} onChange={e=>{setDuration(Number(e.target.value));setTime('');setErrors({});setMessage('');}}>{[1,2,3,4].map(h=><option value={h} key={h}>{h} {h===1?'hour':'hours'}</option>)}</select><FieldMessage name="durationHours" errors={errors}/></div>
    <fieldset id="startTime" tabIndex={-1} aria-describedby={field('startTime')} className="slots-field" disabled={locked}><legend>Select a time</legend>{loading?<Spinner label="Checking availability…"/>:error?<ReadError error={error} onRetry={retry}/>:!startOptions.length?<div className="slot-empty">This space is closed or has no slots that fit on this date. Try another date or duration.</div>:<div className="time-grid">{startOptions.map(start=>{const free=availableSlots.some(s=>s.startTime===start);return <button type="button" key={start} className={'time-option'+(time===start?' selected':'')} disabled={!free||locked} aria-pressed={time===start} onClick={()=>{setTime(start);setMessage('');setErrors({});setConflict(false);}} title={free?'Available':'Unavailable'}>{start}<span className="sr-only">{free?' available':' unavailable'}</span></button>;})}</div>}{errors.startTime&&<p role="alert" className="field-error" id="startTime-error">{errors.startTime}</p>}{!loading&&!error&&startOptions.length>0&&!availableSlots.length&&<p className="slot-empty">No start times are free. Try another date or shorter duration.</p>}</fieldset>
    <div className="selected-summary"><span>Selected time</span><div>{time?(uncertain?`${time}–${String(Number(time.slice(0,2))+duration).padStart(2,'0')}:00`:selected?`${time}–${selected.endTime}`:'Choose an available time'):'Choose an available time'}</div></div>
    <div className="field"><label htmlFor="customerName">Full name</label><input id="customerName" autoComplete="name" type="text" maxLength={100} placeholder="e.g. Anna Kowalska" value={name} disabled={locked} aria-invalid={!!errors.customerName} aria-describedby={field('customerName')} onChange={e=>{setName(e.target.value);setErrors(old=>({...old,customerName:''}));}}/><FieldMessage name="customerName" errors={errors}/></div>
    <div className="field"><label htmlFor="customerEmail">Email</label><input id="customerEmail" autoComplete="email" type="email" maxLength={254} placeholder="e.g. you@example.com" value={email} disabled={locked} aria-invalid={!!errors.customerEmail} aria-describedby={field('customerEmail')} onChange={e=>{setEmail(e.target.value);setErrors(old=>({...old,customerEmail:''}));}}/><FieldMessage name="customerEmail" errors={errors}/></div>
    <div className="price-breakdown"><div><span>{money(space.hourlyRate)} × {duration} {duration===1?'hour':'hours'}</span><span>{money(space.hourlyRate*duration)}</span></div><div className="total"><strong>Total</strong><strong>{money(space.hourlyRate*duration)}</strong></div></div>
    {blockedByOther&&<Alert>An earlier booking has an uncertain result. <Link to={`/spaces/${otherPending.payload.spaceId}`}>Return to that booking attempt</Link> before making another reservation.</Alert>}
    {message&&<Alert>{message}</Alert>}{conflict&&<p className="muted">Availability has been refreshed.</p>}
    <button type="submit" className="primary-btn confirm" disabled={submitting||!!blockedByOther||(!uncertain&&(loading||!!error))}>{submitting?'Checking booking…':uncertain?'Retry same booking':'Confirm booking'}</button>
    <p className="no-payment">No payment required</p>
  </form></section>;
}
function SpaceDetails(){
  const {spaceId}=useParams();const {data,loading,error,retry}=useRead<{space:Space}>(`/api/spaces/${spaceId}`);
  if(loading)return <main className="shell"><Spinner label="Loading space details…"/></main>;
  if(error)return <main className="shell"><ReadError error={error} onRetry={retry}/></main>;
  if(!data)return <NotFound/>;
  const space=data.space;
  return <main className="shell details-layout"><div className="details-left"><Link className="back-link" to="/spaces"><span aria-hidden="true">←</span> Back to spaces</Link><h1>{space.name}</h1><p className="details-subtitle">{prettyType(space.type)} <span>·</span> Up to {space.capacity} people</p><img className="main-photo" src={space.imageUrl} alt={`${space.name}, a ${prettyType(space.type).toLowerCase()} for creative work`}/><div className="equipment-list">{space.equipment.map((e,i)=><div className="equipment" key={`${e}-${i}`}><span className="equipment-icon" aria-hidden="true">{i%3===0?'✳':i%3===1?'▣':'♧'}</span>{e}</div>)}</div><p className="hours-intro">◷ &nbsp; Opening hours · {TIMEZONE}</p><div className="hours-list">{days.map((d,i)=><div key={d}><span>{d}</span><span>{space.openingHours[String(i+1) as keyof Space['openingHours']]?`${space.openingHours[String(i+1) as keyof Space['openingHours']]!.opensAt}–${space.openingHours[String(i+1) as keyof Space['openingHours']]!.closesAt}`:'Closed'}</span></div>)}</div></div><BookingForm space={space}/></main>;
}
function BookingDetails(){
  const {token}=useParams();const {data,loading,error,retry}=useRead<{booking:Booking}>(`/api/bookings/${token}`);
  const [working,setWorking]=useState(false);const [cancelError,setCancelError]=useState('');
  const [dialogOpen,setDialogOpen]=useState(false);const dialog=useRef<HTMLDialogElement>(null);
  const [copied,setCopied]=useState(false);
  useEffect(()=>{const el=dialog.current;if(!el)return;if(dialogOpen&&!el.open)el.showModal();if(!dialogOpen&&el.open)el.close();},[dialogOpen]);
  const cancel=async()=>{if(working)return;setDialogOpen(false);setWorking(true);setCancelError('');try{await api(`/api/bookings/${token}/cancel`,{method:'POST'});retry();}catch(err){setCancelError((err as ApiProblem).status===409?'This booking has already started and cannot be cancelled.':'We couldn’t confirm the cancellation. The last confirmed status is still shown. Retry cancellation or refresh the booking status.');}finally{setWorking(false);}};
  if(loading)return <main className="shell"><Spinner label="Loading your private booking…"/></main>;
  if(error)return <main className="shell"><ReadError error={error} onRetry={retry}/></main>;
  if(!data)return <NotFound/>;
  const b=data.booking;const start=utcLocal(b.startsAt);const end=utcLocal(b.endsAt);
  const past=b.status==='confirmed'&&Date.parse(b.startsAt)<=Date.now();
  return <main className="shell confirmation"><Link className="back-link" to="/spaces">← Browse spaces</Link><div className="confirmation-card"><span className="eyebrow">Your reservation</span><h1>{b.status==='cancelled'?'Booking cancelled':'Booking confirmed'}</h1><p>{b.status==='cancelled'?'The slot has been released. Your details remain here for reference.':'Your space is reserved. Keep this private link to return to your booking.'}</p><div className="reference"><span>Booking reference</span><strong>{b.reference}</strong></div><div className="booking-facts"><div><span>Space</span><strong>{b.spaceName}</strong></div><div><span>Date</span><strong>{dateLabel(start.toISODate()!)}</strong></div><div><span>Time</span><strong>{start.toFormat('HH:mm')}–{end.toFormat('HH:mm')}</strong></div><div><span>Timezone</span><strong>{b.timezone}</strong></div><div><span>Duration</span><strong>{b.durationHours} {b.durationHours===1?'hour':'hours'}</strong></div><div><span>Rate</span><strong>{money(b.hourlyRate)} / hour</strong></div><div><span>Name</span><strong>{b.customerName}</strong></div><div><span>Email</span><strong>{b.customerEmail}</strong></div><div><span>Status</span><strong className="status">{b.status==='cancelled'?'Cancelled':past?'Confirmed · Past':'Confirmed'}</strong></div><div><span>Total</span><strong>{money(b.totalPrice)}</strong></div></div><div className="booking-actions"><button type="button" className="outline-btn" onClick={async()=>{try{await navigator.clipboard.writeText(b.confirmationUrl);setCopied(true);}catch{setCopied(false);setCancelError('Could not copy automatically. Copy the URL from your browser address bar.');}}}>{copied?'Link copied':'Copy private booking link'}</button>{b.status==='confirmed'&&!past&&<button type="button" className="danger-link" disabled={working} onClick={()=>setDialogOpen(true)}>{working?'Cancelling…':'Cancel booking'}</button>}</div>{cancelError&&<Alert>{cancelError} <button className="text-button" type="button" onClick={retry}>Refresh status</button>{b.status==='confirmed'&&!past&&<button className="text-button" type="button" disabled={working} onClick={cancel}>Retry cancellation</button>}</Alert>}</div><dialog ref={dialog} aria-labelledby="cancel-title" onClose={()=>setDialogOpen(false)}><div className="dialog-content"><h2 id="cancel-title">Cancel this booking?</h2><p>This releases your reserved time. You can’t undo the cancellation.</p><div className="dialog-actions"><button type="button" className="outline-btn" onClick={()=>setDialogOpen(false)}>Keep booking</button><button type="button" className="danger-btn" onClick={cancel}>Yes, cancel booking</button></div></div></dialog></main>;
}
function App(){return <BrowserRouter><Header/><Routes><Route path="/" element={<Navigate to="/spaces" replace/>}/><Route path="/spaces" element={<Browse/>}/><Route path="/spaces/:spaceId" element={<SpaceDetails/>}/><Route path="/bookings/:token" element={<BookingDetails/>}/><Route path="*" element={<NotFound/>}/></Routes></BrowserRouter>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
