import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Database } from './db.js';
import { config } from './config.js';

const COOKIE = 'sb_session';
const TTL_SECONDS = 7 * 24 * 60 * 60;
const RATE_WINDOW = 15 * 60;
const MAX_ATTEMPTS = 10;
const hash = (text:string) => createHash('sha256').update(text).digest('hex');

export type User = { id:string; fullName:string; email:string; createdAt:string };
type UserRow = { id:string; full_name:string; email:string; created_at:string; password_hash:string };
export class AuthError extends Error {
  constructor(public status:number, public code:string, message:string) { super(message); }
}
function asUser(row:UserRow):User { return {id:row.id,fullName:row.full_name,email:row.email,createdAt:row.created_at}; }
export function hashPassword(password:string):string {
  const salt=randomBytes(16).toString('hex');
  const result=scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');
  return `scrypt$16384$${salt}$${result}`;
}
export function checkPassword(password:string,encoded:string):boolean {
  const [algorithm,cost,salt,digest]=encoded.split('$');
  if(algorithm!=='scrypt'||cost!=='16384'||!salt||!digest||!/^[0-9a-f]{128}$/.test(digest))return false;
  const actual=scryptSync(password,salt,64,{N:16384,r:8,p:1});
  return timingSafeEqual(actual,Buffer.from(digest,'hex'));
}
// Deliberately run the KDF for missing accounts too, so lookup misses are not an instant reply.
const dummyPasswordHash=hashPassword('dummy-verification-not-a-real-account');
export function verifyCredentials(db:Database,email:string,password:string):User|null {
  const row=db.prepare('SELECT * FROM users WHERE email=?').get(email) as UserRow|undefined;
  const valid=checkPassword(password,row?.password_hash ?? dummyPasswordHash);
  return row&&valid?asUser(row):null;
}
export function createUser(db:Database,name:string,email:string,password:string):User {
  const id=randomUUID(), createdAt=new Date().toISOString();
  db.prepare('INSERT INTO users(id,full_name,email,password_hash,created_at) VALUES (?,?,?,?,?)')
    .run(id,name,email,hashPassword(password),createdAt);
  return {id,fullName:name,email,createdAt};
}
function cookieValue(req:Request):string|null {
  const cookie=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`));
  if(!cookie)return null;
  const value=cookie.slice(COOKIE.length+1);
  return /^[A-Za-z0-9_-]{43}$/.test(value)?value:null;
}
function cookieOptions():string {
  return `Path=/; HttpOnly; SameSite=Lax${config.origin.startsWith('https://')?'; Secure':''}`;
}
export function setSession(db:Database,req:Request,res:Response,userId:string):void {
  const old=cookieValue(req);
  if(old)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(old));
  const token=randomBytes(32).toString('base64url');
  const now=Date.now();
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)')
    .run(hash(token),userId,new Date(now).toISOString(),new Date(now+TTL_SECONDS*1000).toISOString());
  res.setHeader('Set-Cookie',`${COOKIE}=${token}; Max-Age=${TTL_SECONDS}; ${cookieOptions()}`);
}
export function clearSession(db:Database,req:Request,res:Response):void {
  const token=cookieValue(req);
  if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));
  res.setHeader('Set-Cookie',`${COOKIE}=; Max-Age=0; ${cookieOptions()}`);
}
export function currentUser(db:Database,req:Request):User|null {
  const token=cookieValue(req);
  if(!token)return null;
  const row=db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(hash(token),new Date().toISOString()) as UserRow|undefined;
  return row?asUser(row):null;
}
export function requireUser(db:Database,req:Request):User {
  const user=currentUser(db,req);
  if(!user)throw new AuthError(401,'AUTHENTICATION_REQUIRED','Sign in to continue.');
  return user;
}
export function assertSameOrigin(req:Request,settings:Pick<typeof config,'origin'|'mode'>=config):void {
  if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return;
  const origin=req.headers.origin;
  if(origin===settings.origin)return;
  // Vite can be opened through either loopback address during local development.
  if(settings.mode==='development'&&origin){
    try {
      const actual=new URL(origin),expected=new URL(settings.origin);
      const loopback=new Set(['localhost','127.0.0.1','[::1]']);
      if(actual.origin===origin&&expected.origin===settings.origin&&
        loopback.has(actual.hostname)&&loopback.has(expected.hostname)&&
        actual.protocol===expected.protocol&&actual.port===expected.port)return;
    }catch{/* Reject malformed origins below. */}
  }
  throw new AuthError(403,'INVALID_ORIGIN','This request could not be verified. Refresh the page and retry.');
}
export function rateLimit(db:Database,req:Request,action:'signin'|'signup',email:string):void {
  // No raw email/IP retained in the throttling table.
  const fingerprint=hash(`${action}|${email}|${req.ip||'unknown'}`);
  const now=Math.floor(Date.now()/1000);
  const existing=db.prepare('SELECT attempts,window_start FROM auth_throttle WHERE fingerprint=?')
    .get(fingerprint) as {attempts:number;window_start:number}|undefined;
  const attempts=existing && now-existing.window_start<RATE_WINDOW?existing.attempts:0;
  if(attempts>=MAX_ATTEMPTS)throw new AuthError(429,'RATE_LIMITED','Too many attempts. Please try again in 15 minutes.');
  db.prepare(`INSERT INTO auth_throttle(fingerprint,attempts,window_start) VALUES(?,?,?)
    ON CONFLICT(fingerprint) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start`)
    .run(fingerprint,attempts+1,attempts===0?now:existing!.window_start);
}
export function resetLimit(db:Database,req:Request,action:'signin'|'signup',email:string):void {
  db.prepare('DELETE FROM auth_throttle WHERE fingerprint=?')
    .run(hash(`${action}|${email}|${req.ip||'unknown'}`));
}
