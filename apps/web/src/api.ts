import axios, { type InternalAxiosRequestConfig } from "axios";
import type { AuthResponse } from "@resort/contracts";

const API_BASE_URL=import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
interface RetryableRequestConfig extends InternalAxiosRequestConfig { resortAuthRetried?:boolean }

export const api=axios.create({baseURL:API_BASE_URL,timeout:90_000,withCredentials:true});
const authApi=axios.create({baseURL:API_BASE_URL,timeout:15_000,withCredentials:true});
let accessToken:string|null=null; let refreshPromise:Promise<AuthResponse>|null=null;

export function tokenIsCurrent(token:string):boolean { try{const encoded=token.split(".")[1];if(!encoded)return false;const base64=encoded.replaceAll("-","+").replaceAll("_","/");const payload=JSON.parse(atob(base64.padEnd(Math.ceil(base64.length/4)*4,"="))) as {exp?:number};return typeof payload.exp==="number"&&payload.exp*1000>Date.now()+30_000;}catch{return false;} }
export function setAccessToken(token:string|null):void{accessToken=token;}
export function getAccessToken():string|null{return accessToken;}

async function refreshSession():Promise<AuthResponse>{
  if(!refreshPromise) refreshPromise=authApi.post<AuthResponse>("/auth/refresh").then(({data})=>{setAccessToken(data.accessToken);return data;}).finally(()=>{refreshPromise=null;});
  return refreshPromise;
}

api.interceptors.request.use((config)=>{if(accessToken)config.headers.Authorization=`Bearer ${accessToken}`;return config;});
api.interceptors.response.use((response)=>response,async(cause:unknown)=>{
  if(!axios.isAxiosError(cause)||cause.response?.status!==401||!cause.config)return Promise.reject(cause);
  const config=cause.config as RetryableRequestConfig;
  if(config.resortAuthRetried||config.url?.startsWith("/auth/"))return Promise.reject(cause);
  config.resortAuthRetried=true;
  try{const session=await refreshSession();config.headers.Authorization=`Bearer ${session.accessToken}`;return api.request(config);}catch{setAccessToken(null);window.dispatchEvent(new CustomEvent("resort:session-expired"));return Promise.reject(cause);}
});

export const authClient={
  async login(username:string,password:string):Promise<AuthResponse>{const {data}=await authApi.post<AuthResponse>("/auth/login",{username,password});setAccessToken(data.accessToken);return data;},
  async register(username:string,password:string):Promise<AuthResponse>{const {data}=await authApi.post<AuthResponse>("/auth/register",{username,password});setAccessToken(data.accessToken);return data;},
  restore:refreshSession,
  async logout():Promise<void>{try{await authApi.post("/auth/logout");}catch{/* Local logout still completes if the API is temporarily unavailable. */}finally{setAccessToken(null);}},
};

export function apiErrorMessage(cause:unknown):string{
  if(!axios.isAxiosError(cause))return cause instanceof Error?cause.message:"Request failed.";
  if(cause.code==="ECONNABORTED")return "The request timed out. Please try again.";
  const body=cause.response?.data as {message?:string;code?:string}|undefined;
  if(body?.message)return body.message;
  if(!cause.response)return "Cannot reach the local API. Check that pnpm dev is running.";
  return `Request failed (HTTP ${cause.response.status}). Please try again.`;
}
export function isNetworkError(cause:unknown):boolean{return axios.isAxiosError(cause)&&!cause.response;}
