import bcrypt from 'bcryptjs';
// Compatibilidade somente com o marcador dos usuários de demonstração.
// Contas com senha real continuam exigindo essa senha, inclusive em atalhos.
export function verifyLoginPassword(stored:unknown,supplied:unknown):boolean {
 if(typeof stored!=='string'||typeof supplied!=='string'||!supplied)return false;
 if(stored==='hashed_password_aqui')return supplied==='123456'||supplied==='admin';
 if(stored.startsWith('$2')){try{return bcrypt.compareSync(supplied,stored);}catch{return false;}}
 return stored===supplied;
}
export function normalizeLoginEmail(value:unknown):string {return typeof value==='string'?value.trim().toLowerCase():'';}
