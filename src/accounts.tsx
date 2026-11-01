import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {DateTime} from 'luxon';
import {MIN_PASSWORD_LENGTH,signinSchema,signupSchema,TIMEZONE,type Booking,type User} from '../shared/contracts.js';
import {api,ApiProblem,useRead,type FieldErrors} from './http.js';

type AuthValue={user:User|null;loading:boolean;error:boolean;refresh:()=>Promise<void>;setUser:(user:User|null)=>void};
const AuthContext=createContext<AuthValue|null>(null);
export function useAuth(){const context=useContext(AuthContext);if(!context)throw new Error('Auth provider missing');return context;}
export function AuthProvider({children}:{children:React.ReactNode}){
  const [user,setUserState]=useState<User|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const generation=useRef(0);
  const setUser=(next:User|null)=>{generation.current++;setUserState(next);setError(false);setLoading(false);};
  const refresh=async()=>{
    const requestId=++generation.current;
    setLoading(true);setError(false);
    try {const data=await api<{user:User}>('/api/auth/me');if(generation.current===requestId)setUserState(data.user);}
    catch(e){if(generation.current===requestId){const p=e as ApiProblem;setUserState(null);if(p.status!==401)setError(true);}}
    finally{if(generation.current===requestId)setLoading(false);}
  };
  useEffect(()=>{void refresh();},[]);
  return <AuthContext.Provider value={{user,loading,error,refresh,setUser}}>{children}</AuthContext.Provider>;
}
export function AccountMenu(){
  const {user,error,refresh,setUser}=useAuth();
  const navigate=useNavigate();
  const location=useLocation();
  const returnTo=safeReturn(location.pathname==='/auth'
    ?new URLSearchParams(location.search).get('returnTo')
    :location.pathname+location.search);
  const [signingOut,setSigningOut]=useState(false);
  const [message,setMessage]=useState('');
  const signout=async()=>{
    if(signingOut)return;
    setSigningOut(true);setMessage('');
    try{await api('/api/auth/signout',{method:'POST'});setUser(null);navigate('/spaces',{replace:true});}
    catch{setMessage('Could not confirm sign out. Please try again.');}
    finally{setSigningOut(false);}
  };
  return <div className="account-access">
    {user?<details className="account-menu"><summary aria-label="Account menu"><span aria-hidden="true">◉</span><span>{user.fullName}</span></summary>
      <nav aria-label="Account">
        <Link to="/my-bookings" onClick={event=>{const menu=event.currentTarget.closest('details');if(menu)menu.open=false;}}>My Bookings</Link><button type="button" disabled={signingOut} onClick={()=>void signout()}>{signingOut?'Signing out…':'Sign out'}</button>
      </nav>
    </details>:<Link className="account-trigger" aria-label="Account" title="Sign in or create an account" to={`/auth?mode=signin&returnTo=${encodeURIComponent(returnTo)}`}><span aria-hidden="true">◉</span><span>Account</span></Link>}
    {error&&<p role="alert" className="account-message">Could not check your session. <button type="button" onClick={()=>void refresh()}>Retry session check</button></p>}
    {message&&<p role="alert" className="account-message">{message}</p>}
  </div>;
}
export function safeReturn(raw:string|null):string{
  if(!raw||!raw.startsWith('/')||raw.startsWith('//')||raw.includes('\\')||/[\u0000-\u001f]/.test(raw)||raw.startsWith('/auth'))return '/spaces';
  return raw;
}
export function AuthPage(){
  const navigate=useNavigate();const location=useLocation();const {setUser,user}=useAuth();
  const params=new URLSearchParams(location.search);
  const mode=params.get('mode')==='signup'?'signup':'signin';
  const returnTo=safeReturn(params.get('returnTo'));
  const [name,setName]=useState('');const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');
  const [visible,setVisible]=useState(false);const [busy,setBusy]=useState(false);
  const [errors,setErrors]=useState<FieldErrors>({});const [message,setMessage]=useState('');
  const switchUrl=(m:string)=>`/auth?mode=${m}&returnTo=${encodeURIComponent(returnTo)}`;
  useEffect(()=>{setPassword('');setConfirm('');setErrors({});setMessage('');},[mode]);
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();if(busy)return;
    const payload=mode==='signup'?{fullName:name,email,password}:{email,password};
    const parsed=(mode==='signup'?signupSchema:signinSchema).safeParse(payload);
    const fieldErrors:FieldErrors={};
    if(!parsed.success)for(const issue of parsed.error.issues){const field=String(issue.path[0]);if(!fieldErrors[field])fieldErrors[field]=issue.message;}
    if(mode==='signup'&&confirm!==password)fieldErrors.confirmPassword='Passwords must match.';
    if(Object.keys(fieldErrors).length){setErrors(fieldErrors);setMessage('Correct the highlighted fields.');
      requestAnimationFrame(()=>document.getElementById(['fullName','email','password','confirmPassword'].find(f=>fieldErrors[f])||'email')?.focus());return;}
    setErrors({});setMessage('');setBusy(true);
    try{
      const result=await api<{user:User}>(`/api/auth/${mode==='signup'?'signup':'signin'}`,{method:'POST',body:JSON.stringify(payload)});
      setUser(result.user);navigate(returnTo,{replace:true});
    }catch(e){const problem=e as ApiProblem;setErrors(problem.fields);
      setMessage(problem.status===0||problem.status===500?'We could not verify this request. Please retry; if you signed up, try signing in before registering again.':problem.message);
      const first=['fullName','email','password'].find(f=>problem.fields[f]);if(first)requestAnimationFrame(()=>document.getElementById(first)?.focus());
    }finally{setBusy(false);}
  };
  return <main className="shell auth-page"><section className="auth-card" aria-labelledby="auth-title">
    <span className="eyebrow">Your creative space awaits</span><h1 id="auth-title">{mode==='signin'?'Welcome back.':'Create your account.'}</h1>
    <p>{mode==='signin'?'Sign in to manage your bookings.':'Sign up to reserve studios and manage your bookings.'}</p>
    {user&&<p className="auth-hint">You are already signed in. <Link to={returnTo}>Continue</Link>.</p>}
    <div className="auth-switch" aria-label="Choose authentication form"><Link className={mode==='signin'?'selected':''} to={switchUrl('signin')}>Sign in</Link><Link className={mode==='signup'?'selected':''} to={switchUrl('signup')}>Sign up</Link></div>
    <form className={'auth-form'+(mode==='signup'?' auth-form-signup':'')} noValidate onSubmit={e=>void submit(e)}>
      {mode==='signup'&&<div className="field"><label htmlFor="fullName">Full name</label><input id="fullName" autoComplete="name" value={name} maxLength={100} disabled={busy} aria-invalid={!!errors.fullName} aria-describedby={errors.fullName?'fullName-error':undefined} onChange={e=>setName(e.target.value)}/>{errors.fullName&&<p className="field-error" id="fullName-error">{errors.fullName}</p>}</div>}
      <div className="field"><label htmlFor="email">Email address</label><input id="email" autoComplete="email" type="email" maxLength={254} disabled={busy} value={email} aria-invalid={!!errors.email} aria-describedby={errors.email?'email-error':undefined} onChange={e=>setEmail(e.target.value)}/>{errors.email&&<p id="email-error" className="field-error">{errors.email}</p>}</div>
      <div className="field"><label htmlFor="password">Password</label><div className="password-input"><input id="password" type={visible?'text':'password'} autoComplete={mode==='signup'?'new-password':'current-password'} disabled={busy} value={password} aria-invalid={!!errors.password} aria-describedby={errors.password?'password-error':undefined} onChange={e=>setPassword(e.target.value)}/><button type="button" onClick={()=>setVisible(!visible)} aria-label={visible?'Hide password':'Show password'}>{visible?'Hide':'Show'}</button></div>{errors.password&&<p className="field-error" id="password-error">{errors.password}</p>}{mode==='signup'&&<small className="muted">Use at least {MIN_PASSWORD_LENGTH} characters.</small>}</div>
      {mode==='signup'&&<div className="field"><label htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" type={visible?'text':'password'} autoComplete="new-password" disabled={busy} value={confirm} aria-invalid={!!errors.confirmPassword} aria-describedby={errors.confirmPassword?'confirmPassword-error':undefined} onChange={e=>setConfirm(e.target.value)}/>{errors.confirmPassword&&<p id="confirmPassword-error" className="field-error">{errors.confirmPassword}</p>}</div>}
      {message&&<div className="alert" role="alert">{message}</div>}
      <button className="primary-btn confirm" type="submit" disabled={busy}>{busy?'Please wait…':mode==='signup'?'Create account':'Sign in'}</button>
    </form><p className="auth-hint">{mode==='signin'?<>New here? <Link to={switchUrl('signup')}>Create an account</Link></>:<>Already registered? <Link to={switchUrl('signin')}>Sign in</Link></>}</p>
    <p className="muted auth-footnote">No email verification or password recovery is available in this demo release.</p>
  </section></main>;
}
const money=(cents:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(cents/100);
const local=(iso:string)=>DateTime.fromISO(iso,{zone:'utc'}).setZone(TIMEZONE);
export function MyBookings(){
  const {user,loading:authLoading,error:authError,refresh}=useAuth();
  const {data,loading,error,retry}=useRead<{bookings:Booking[]}>(user?'/api/me/bookings':null);
  useEffect(()=>{if(error?.status===401)void refresh();},[error?.status]);
  const [pending,setPending]=useState<string|null>(null);
  const [selected,setSelected]=useState<Booking|null>(null);
  const [notice,setNotice]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=dialog.current;if(!el)return;if(selected&&!el.open)el.showModal();if(!selected&&el.open)el.close();},[selected]);
  const cancel=async()=>{
    if(!selected||pending)return;
    const token=new URL(selected.confirmationUrl).pathname.split('/').pop();
    setPending(selected.id);setNotice('');setSelected(null);
    try{await api(`/api/bookings/${token}/cancel`,{method:'POST'});retry();}
    catch(e){setNotice((e as ApiProblem).status===409?'This booking has already started and cannot be cancelled.':'Cancellation could not be verified. Refresh the list or retry cancellation.');}
    finally{setPending(null);}
  };
  if(authLoading)return <main className="shell"><p role="status">Checking your session…</p></main>;
  if(authError)return <main className="shell read-error" role="alert"><h1>Could not check your session</h1><button className="outline-btn" onClick={()=>void refresh()}>Retry</button></main>;
  if(!user)return <main className="shell missing"><h1>Sign in to see your bookings.</h1><Link className="primary-btn link-btn" to="/auth?mode=signin&returnTo=%2Fmy-bookings">Sign in</Link></main>;
  const bookings=data?.bookings??[];
  const now=Date.now();
  const groups=[
    {name:'Upcoming',items:bookings.filter(b=>b.status==='confirmed'&&Date.parse(b.startsAt)>now).sort((a,b)=>a.startsAt.localeCompare(b.startsAt))},
    {name:'Past',items:bookings.filter(b=>b.status==='confirmed'&&Date.parse(b.startsAt)<=now).sort((a,b)=>b.startsAt.localeCompare(a.startsAt))},
    {name:'Cancelled',items:bookings.filter(b=>b.status==='cancelled').sort((a,b)=>(b.cancelledAt??'').localeCompare(a.cancelledAt??''))}
  ];
  return <main className="shell bookings-page"><span className="eyebrow">Your account</span><h1>My Bookings</h1><p>View and manage reservations for {user.fullName}.</p>
    {notice&&<div role="alert" className="alert">{notice} <button className="text-button" onClick={retry}>Refresh bookings</button></div>}
    <section aria-label="Your bookings" aria-busy={loading}>
    {loading&&!data?<p role="status">Loading bookings…</p>:error?<div className="read-error" role="alert"><h2>{error.status===401?'Your session expired.':'Could not load bookings.'}</h2>{error.status===401?<Link to="/auth?mode=signin&returnTo=%2Fmy-bookings">Sign in again</Link>:<button className="outline-btn" onClick={retry}>Retry</button>}</div>:!bookings.length?<div className="empty"><h2>No bookings yet.</h2><p>Find a creative space and make your first reservation.</p><Link className="primary-btn link-btn" to="/spaces">Browse spaces</Link></div>:groups.map(group=><section className="booking-group" key={group.name}><h2>{group.name} <span className="muted">({group.items.length})</span></h2>{group.items.length?<div className="booking-list">{group.items.map(b=><article key={b.id} className="booking-row"><div><h3>{b.spaceName}</h3><p>{local(b.startsAt).toFormat('dd LLL yyyy · HH:mm')}–{local(b.endsAt).toFormat('HH:mm')} · {TIMEZONE}</p><p>Ref: {b.reference} · {money(b.totalPrice)} · <strong>{b.status==='cancelled'?'Cancelled':'Confirmed'}</strong></p></div><div className="booking-row-actions"><Link className="outline-btn link-btn" to={new URL(b.confirmationUrl).pathname}>View</Link>{b.status==='confirmed'&&Date.parse(b.startsAt)>now&&<button type="button" className="danger-link" disabled={!!pending||loading} onClick={()=>setSelected(b)}>{pending===b.id?'Cancelling…':'Cancel'}</button>}</div></article>)}</div>:<p className="muted">No {group.name.toLowerCase()} bookings.</p>}</section>)}
    </section>
    <dialog ref={dialog} aria-labelledby="my-cancel-title" onClose={()=>setSelected(null)}><div className="dialog-content"><h2 id="my-cancel-title">Cancel this booking?</h2><p>This releases the reserved slot. It cannot be undone.</p><div className="dialog-actions"><button type="button" className="outline-btn" onClick={()=>setSelected(null)}>Keep booking</button><button type="button" className="danger-btn" onClick={()=>void cancel()}>Yes, cancel booking</button></div></div></dialog>
  </main>;
}
