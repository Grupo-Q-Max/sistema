// Leitor de INSERTs de phpMyAdmin. Nenhum comando do dump é executado.
export type LegacyRow=Record<string,string|null>;
export function readLegacyDump(sql:string):Record<string,LegacyRow[]>{
 const tables:Record<string,LegacyRow[]>={};const pattern=/INSERT INTO\s+`(controle_fechamento|controle_meses)`\s*\(([^;]*?)\)\s*VALUES\s*/g;let match:RegExpExecArray|null;
 while((match=pattern.exec(sql))){const name=match[1],columns=[...match[2].matchAll(/`([^`]+)`/g)].map(item=>item[1]);const rows=tables[name]||(tables[name]=[]);let pos=pattern.lastIndex;
  const space=()=>{while(/\s/.test(sql[pos]||'')&&pos<sql.length)pos++;};
  function value():string|null {space();if(sql[pos]==="'"){pos++;let text='';while(pos<sql.length){const ch=sql[pos++];if(ch==='\\'){if(pos>=sql.length)throw Error('Escape incompleto no dump.');const escaped=sql[pos++];const map:Record<string,string>={'0':'\0',n:'\n',r:'\r',t:'\t',Z:'\x1a'};text+=map[escaped]??escaped;}else if(ch==="'"){if(sql[pos]==="'"){text+="'";pos++;}else return text;}else text+=ch;}throw Error('Texto incompleto no dump.');}
   const start=pos;while(pos<sql.length&&![')',','].includes(sql[pos]))pos++;const token=sql.slice(start,pos).trim();if(token==='NULL')return null;if(!/^-?\d+(?:\.\d+)?$/.test(token))throw Error('Expressão SQL não suportada no dump.');return token;
  }
  while(true){space();if(sql[pos]!=='(')throw Error(`INSERT ${name}: registro inválido.`);pos++;const row:LegacyRow={};for(let index=0;index<columns.length;index++){row[columns[index]]=value();space();const expected=index===columns.length-1?')':',';if(sql[pos]!==expected)throw Error(`INSERT ${name}: quantidade de campos divergente.`);pos++;}rows.push(row);space();if(sql[pos]===';'){pos++;break;}if(sql[pos]!==',')throw Error(`INSERT ${name}: bloco incompleto.`);pos++;}
  pattern.lastIndex=pos;
 }
 if(!tables.controle_fechamento?.length||!tables.controle_meses?.length)throw Error('O SQL deve incluir dados de controle_fechamento e controle_meses.');return tables;
}
