import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Request} from 'express';
import {assertSameOrigin,AuthError} from '../auth.js';

const request=(origin:string|undefined,method='POST')=>({method,headers:{origin}} as Request);
const invalidOrigin=(error:unknown)=>error instanceof AuthError&&error.status===403&&error.code==='INVALID_ORIGIN';

test('configured origins are accepted in every environment',()=>{
  for(const mode of ['development','test','production']){
    assert.doesNotThrow(()=>assertSameOrigin(request('https://spaces.example'),{mode,origin:'https://spaces.example'}));
  }
});

test('development accepts loopback aliases in either direction on the configured protocol and port',()=>{
  for(const configured of ['localhost','127.0.0.1','[::1]']){
    for(const actual of ['localhost','127.0.0.1','[::1]']){
      assert.doesNotThrow(()=>assertSameOrigin(request(`http://${actual}:5173`),{mode:'development',origin:`http://${configured}:5173`}));
    }
  }
});

test('development rejects missing, malformed, external, and mismatched origins',()=>{
  const settings={mode:'development',origin:'http://localhost:5173'};
  for(const origin of [undefined,'null','invalid','https://evil.example','http://localhost.evil.example:5173',
    'http://127.0.0.1:5174','https://127.0.0.1:5173','http://0.0.0.0:5173','http://127.0.0.2:5173',
    'http://127.0.0.1:5173/path','http://user@127.0.0.1:5173']){
    assert.throws(()=>assertSameOrigin(request(origin),settings),invalidOrigin,`Rejected ${origin}`);
  }
  assert.throws(()=>assertSameOrigin(request('http://127.0.0.1:5173'),{mode:'development',origin:'http://spaces.example:5173'}),invalidOrigin);
});

test('local, test and production require an exact match even for loopback addresses',()=>{
  for(const mode of ['local','test','production']){
    assert.throws(()=>assertSameOrigin(request('http://127.0.0.1:5173'),{mode,origin:'http://localhost:5173'}),invalidOrigin);
  }
});

test('all mutation methods check origins and read requests need no Origin header',()=>{
  const settings={mode:'development',origin:'http://localhost:5173'};
  for(const method of ['POST','PUT','PATCH','DELETE']){
    assert.throws(()=>assertSameOrigin(request(undefined,method),settings),invalidOrigin);
  }
  assert.doesNotThrow(()=>assertSameOrigin(request(undefined,'GET'),settings));
});
