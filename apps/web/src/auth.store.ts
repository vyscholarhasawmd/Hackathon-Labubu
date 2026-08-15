import { defineStore } from "pinia";
import type { UserDto } from "@resort/contracts";
import { authClient } from "./api";

export const useAuthStore=defineStore("auth",{
  state:()=>({user:null as UserDto|null,restored:false,busy:false}),
  getters:{authenticated:(state)=>Boolean(state.user)},
  actions:{
    async restore(){if(this.restored)return this.authenticated;try{this.user=(await authClient.restore()).user;}catch{this.user=null;}finally{this.restored=true;}return this.authenticated;},
    async login(username:string,password:string){this.busy=true;try{this.user=(await authClient.login(username,password)).user;this.restored=true;}finally{this.busy=false;}},
    async register(username:string,password:string){this.busy=true;try{this.user=(await authClient.register(username,password)).user;this.restored=true;}finally{this.busy=false;}},
    async logout(){this.busy=true;try{await authClient.logout();this.user=null;this.restored=true;}finally{this.busy=false;}},
  },
});
