import { ACCOUNTING_COLUMNS, LEGACY_ACCOUNTING_COLUMNS, resolveAccountingKey } from '../src/config/accountingColumns';
export async function configureAccounting(tx:any) {
  const original=await tx.departmentColumn.findMany({where:{department:'CONTABIL'}});
  const complete=ACCOUNTING_COLUMNS.every(template=>original.some((column:any)=>column.columnKey===template.key));
  let created=0,adapted=0,hidden=0,migrated=0;
  const mappings:any[]=[];
  for(let index=0;index<ACCOUNTING_COLUMNS.length;index++){
    const template=ACCOUNTING_COLUMNS[index];const matches=original.filter((column:any)=>resolveAccountingKey(column)===template.key);
    if(matches.length>1)throw new Error(`Colunas duplicadas para ${template.name}.`);
    const existing=matches[0];if(existing){mappings.push({existing,key:template.key});if(existing.columnKey===template.key)continue;}
    const data={department:'CONTABIL',columnKey:template.key,name:template.name,inputType:template.inputType,isActive:true,isEditable:true,replicates:false,countsProgress:template.countsProgress,orderIndex:index+1,fieldConfig:{version:1,placeholder:'',options:template.options}};
    if(existing){await tx.departmentColumn.update({where:{id:existing.id},data});adapted++;}else{await tx.departmentColumn.create({data});created++;}
  }
  if(!complete)for(const column of original)if(LEGACY_ACCOUNTING_COLUMNS.includes(column.name)&&!resolveAccountingKey(column)){await tx.departmentColumn.update({where:{id:column.id},data:{isActive:false}});hidden++;}
  // Não apaga nem agrega fechamentos mensais antigos: preserva cada registro de origem.
  for(const closing of await tx.closing.findMany({where:{type:'CONTABIL'}})){
    const data={...(closing.columnsData||{})};let changed=false;
    for(const {existing,key} of mappings)if(data[key]===undefined){const value=data[existing.id]??data[existing.name];if(value!==undefined){data[key]=value;changed=true;}}
    if(changed){await tx.closing.update({where:{id:closing.id},data:{columnsData:data}});migrated++;}
  }
  return {created,adapted,hidden,migrated};
}
