import type { User } from "firebase/auth";
const API_URL = import.meta.env.VITE_CPL_API_URL as string | undefined;
export type League = "A" | "B";
export type Team = {id:string;name:string;league:League;description:string;logo:string};
export type Season = {id:string;name:string};
export type Bootstrap = {season:Season;teams:Team[];fixtures:Array<Record<string,string>>;reports:Array<Record<string,string>>;news:Array<Record<string,string>>};
export type CplRole = "fan"|"player"|"coach"|"referee"|"chairman";
export type CplMe = {uid:string;email:string;displayName:string;activeRole:CplRole;isChairman:boolean;roles:Array<Record<string,string>>;roleRequests:Array<Record<string,string>>;follows:Array<Record<string,string>>;playerApplications:Array<Record<string,string>>;assignedTeams:Array<Record<string,string>>;assignedFixtures:Array<Record<string,string>>;pendingReports:Array<Record<string,string>>;privateFinance:Array<Record<string,string>>};
function jsonp<T>(params:Record<string,string>):Promise<T&{success:boolean;error?:string}>{
 return new Promise((resolve,reject)=>{if(!API_URL)return reject(new Error("CPL backend is not configured. Set VITE_CPL_API_URL."));
 const cb=`__cpl_${Date.now()}_${Math.floor(Math.random()*1e6)}`;const w=window as unknown as Record<string,unknown>;const script=document.createElement("script");
 const cleanup=()=>{delete w[cb];script.remove();};const timer=window.setTimeout(()=>{cleanup();reject(new Error("CPL service timed out."));},20000);
 w[cb]=(data:never)=>{window.clearTimeout(timer);cleanup();resolve(data);};script.onerror=()=>{window.clearTimeout(timer);cleanup();reject(new Error("Could not connect to CPL service."));};
 script.src=`${API_URL}?${new URLSearchParams({...params,callback:cb})}`;document.head.appendChild(script);});
}
async function read<T>(params:Record<string,string>):Promise<T>{const r=await jsonp<T>(params);if(!r.success)throw new Error(r.error||"CPL request failed.");return r;}
async function post<T>(user:User,payload:Record<string,unknown>):Promise<T>{
 if(!API_URL)throw new Error("CPL backend is not configured. Set VITE_CPL_API_URL.");
 const idToken=await user.getIdToken();const res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...payload,idToken})});
 const r=await res.json() as T&{success?:boolean;error?:string};if(!res.ok||r.success===false)throw new Error(r.error||"CPL request failed.");return r;
}
export const cplApi={
 bootstrap:()=>read<Bootstrap>({action:"bootstrap"}),
 me:(u:User)=>post<{me:CplMe}>(u,{action:"cpl_me"}).then(x=>x.me),
 action:(u:User,action:string,body:Record<string,unknown>={})=>post<Record<string,unknown>>(u,{action,...body})
};
