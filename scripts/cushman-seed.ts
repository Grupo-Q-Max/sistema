import {CUSHMAN_COLUMNS,LEGACY_CUSHMAN_COLUMNS,resolveCushmanKey,CUSHMAN_LEGACY_VALUES,cushmanTextValue} from '../src/config/cushmanColumns';
import {calculateColumnProgress,isColumnActive,defaultVisibility} from '../src/config/columnVisibility';
export async function configureCushman(tx:any){
 const original=await tx.departmentColumn.findMany({where:{department:'CUSHMAN'}});const map=new Map<string,any>();
 for(const template of CUSHMAN_COLUMNS){const matches=original.filter((column:any)=>resolveCushmanKey(column)===template.key);if(matches.length>1)throw new Error(`Coluna Cushman duplicada: ${template.name}`);map.set(template.key,matches[0]);}
 let created=0,adapted=0,hidden=0,migrated=0;
 for(let index=0;index<CUSHMAN_COLUMNS.length;index++){
  const template=CUSHMAN_COLUMNS[index],existing=map.get(template.key);const obligation=template.key!=='cush_observacao';
  if(!obligation&&existing?.columnKey===template.key)continue;
  const data:any={department:'CUSHMAN',columnKey:template.key,name:template.name,inputType:template.inputType,countsProgress:existing?.countsProgress??template.countsProgress,replicates:existing?.replicates??template.replicates,isEditable:true,isActive:true,orderIndex:index+1,fieldConfig:existing?.fieldConfig||{version:1,placeholder:obligation?'Digite a informação da competência':'Observações da competência',options:[]},...(obligation?{visibilityConfig:defaultVisibility()}:{})};
  if(existing){const changed=Object.entries(data).some(([key,value])=>JSON.stringify(existing[key])!==JSON.stringify(value));if(changed){await tx.departmentColumn.update({where:{id:existing.id},data});adapted++;}}
  else{await tx.departmentColumn.create({data});created++;}
 }
 for(const column of original)if(LEGACY_CUSHMAN_COLUMNS.includes(column.name)&&column.isActive!==false){await tx.departmentColumn.update({where:{id:column.id},data:{isActive:false}});hidden++;}
 const columns=await tx.departmentColumn.findMany({where:{department:'CUSHMAN'}});
 for(const closing of await tx.closing.findMany({where:{type:'CUSHMAN'}})){
  const data={...(closing.columnsData||{})};let changed=false;const archive={...(data[CUSHMAN_LEGACY_VALUES]||{})};
  for(const template of CUSHMAN_COLUMNS){
   const previous=map.get(template.key);if(data[template.key]===undefined&&previous){const old=data[previous.id]??data[previous.name];if(old!==undefined){data[template.key]=old;changed=true;}}
   const value=data[template.key];if(template.inputType==='TEXT'&&value!==undefined&&value!==null&&typeof value!=='string'){
    if(archive[template.key]===undefined)archive[template.key]=structuredClone(value);
    data[template.key]=cushmanTextValue(value,previous);changed=true;
   }
  }
  if(Object.keys(archive).length)data[CUSHMAN_LEGACY_VALUES]=archive;
  const progress=calculateColumnProgress(columns.filter((column:any)=>column.countsProgress&&isColumnActive(column,new Date(closing.referencePeriod))),data,column=>resolveCushmanKey(column)||column.id);
  if(changed||closing.status!==progress.calculatedStatus){await tx.closing.update({where:{id:closing.id},data:{columnsData:data,status:progress.calculatedStatus}});migrated++;}
 }
 return {created,adapted,hidden,migrated};
}
