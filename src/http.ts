import {useEffect,useRef,useState} from 'react';

export type FieldErrors=Record<string,string>;
export class ApiProblem extends Error {
  constructor(public status:number,public code:string,message:string,public fields:FieldErrors={}){super(message);}
}
export async function api<T>(url:string,options:RequestInit={}):Promise<T>{
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),10000);
  try {
    const response=await fetch(url,{...options,credentials:'same-origin',signal:controller.signal,
      headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
    if(!response.ok){
      let p:{error?:{code?:string;message?:string;fieldErrors?:FieldErrors}}={};
      try {p=await response.json() as typeof p;}catch{/* non-JSON upstream */}
      throw new ApiProblem(response.status,p.error?.code||'REQUEST_FAILED',p.error?.message||'The request could not be completed.',p.error?.fieldErrors);
    }
    return response.status===204?undefined as T:await response.json() as T;
  }catch(error){
    if(error instanceof ApiProblem)throw error;
    throw new ApiProblem(0,'CONNECTION_ERROR','The server could not be reached or the request timed out.');
  }finally{window.clearTimeout(timeout);}
}
export function useRead<T>(url:string|null,keepPreviousData=false){
  const previousUrl=useRef(url);
  const [reloadId,setReloadId]=useState(0);
  const [state,setState]=useState<{data:T|null;loading:boolean;error:ApiProblem|null}>({data:null,loading:true,error:null});
  useEffect(()=>{
    if(!url){setState({data:null,loading:false,error:null});return;}
    let active=true;
    const preserveData=keepPreviousData||previousUrl.current===url;
    previousUrl.current=url;
    setState(previous=>({data:preserveData?previous.data:null,loading:true,error:null}));
    api<T>(url).then(data=>{if(active)setState({data,loading:false,error:null});})
      .catch((error:ApiProblem)=>{if(active)setState({data:null,loading:false,error});});
    return ()=>{active=false;};
  },[url,reloadId,keepPreviousData]);
  return {...state,retry:()=>setReloadId(id=>id+1)};
}
