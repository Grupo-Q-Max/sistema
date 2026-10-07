import { isColumnActive, isColumnComplete } from '../src/config/columnVisibility';
import { PAYROLL_COLUMNS, LEGACY_DP_DEFAULTS, resolveColumnKey } from '../src/config/payrollColumns';
export async function configurePayroll(tx:any,protectPassword:(value:unknown)=>string) {
    const original=await tx.departmentColumn.findMany({where:{department:'DP'}});
    const alreadyConfigured=PAYROLL_COLUMNS.every(template=>original.some((column:any)=>column.columnKey===template.key));
    const map=new Map<string,any>();
    for(const template of PAYROLL_COLUMNS) {
      const matches=original.filter((column:any)=>resolveColumnKey(column)===template.key);
      if(matches.length>1)throw new Error(`Há mais de uma coluna DP para ${template.name}. Resolva a duplicidade antes de continuar.`);
      const existing=matches[0];map.set(template.key,existing);
    }
    let created=0,adapted=0,hidden=0;
    for(let index=0;index<PAYROLL_COLUMNS.length;index++) {
      const template=PAYROLL_COLUMNS[index];const existing=map.get(template.key);
      if(existing?.columnKey===template.key)continue;
      const data={department:'DP',columnKey:template.key,name:template.name,inputType:template.inputType,isActive:true,isEditable:template.isEditable,replicates:template.replicates,countsProgress:template.countsProgress,orderIndex:index+1,fieldConfig:{version:1,placeholder:'',options:template.options}};
      if(existing){await tx.departmentColumn.update({where:{id:existing.id},data});adapted++;}
      else {await tx.departmentColumn.create({data});created++;}
    }
    if(!alreadyConfigured)for(const column of original) {
      if(LEGACY_DP_DEFAULTS.includes(column.name)&&!PAYROLL_COLUMNS.some(t=>t.key===resolveColumnKey(column))) {
        await tx.departmentColumn.update({where:{id:column.id},data:{isActive:false}});hidden++;
      }
    }
    const configuredColumns=await tx.departmentColumn.findMany({where:{department:'DP'}});
    const closings=await tx.closing.findMany({where:{type:'DP'}});let migrated=0;
    for(const closing of closings) {
      const data={...(closing.columnsData||{})};let changed=false;
      for(const template of PAYROLL_COLUMNS) {
        const previous=map.get(template.key);
        if(data[template.key]===undefined&&previous) {
          const old=data[previous.id]??data[previous.name];
          if(old!==undefined){data[template.key]=old;changed=true;}
        }
      }
      if(data.dp_qtde_funcionarios===undefined&&closing.dashboardMetrics?.employees!==undefined){data.dp_qtde_funcionarios=closing.dashboardMetrics.employees;changed=true;}
      const employees=data.dp_qtde_funcionarios;
      if(employees!==undefined&&employees!==null&&employees!==''&&Number.isInteger(Number(employees))&&Number(employees)>=0&&typeof employees!=='number'){data.dp_qtde_funcionarios=Number(employees);changed=true;}
      if(data.dp_sd_senha&&typeof data.dp_sd_senha==='string'){const protectedValue=protectPassword(data.dp_sd_senha);if(protectedValue!==data.dp_sd_senha){data.dp_sd_senha=protectedValue;changed=true;}}
      const sdColumn=map.get('dp_sd_senha');
      if(sdColumn)for(const oldKey of [sdColumn.id,sdColumn.name])if(typeof data[oldKey]==='string'&&data[oldKey]){const protectedValue=protectPassword(data[oldKey]);if(protectedValue!==data[oldKey]){data[oldKey]=protectedValue;changed=true;}}
      const progressColumns=configuredColumns.filter((column:any)=>column.countsProgress&&column.inputType!=='READONLY'&&isColumnActive(column,new Date(closing.referencePeriod)));
      const done=progressColumns.filter((column:any)=>isColumnComplete(column,data[resolveColumnKey(column)||column.id])).length;
      const nextStatus=progressColumns.length&&done===progressColumns.length?'COMPLETED':done>0?'IN_PROGRESS':'PENDING';
      const statusChanged=closing.status!=='NOT_APPLICABLE'&&closing.status!==nextStatus;
      if(typeof data.dp_qtde_funcionarios==='number'&&closing.dashboardMetrics?.employees!==data.dp_qtde_funcionarios)changed=true;
      if(changed||statusChanged){await tx.closing.update({where:{id:closing.id},data:{columnsData:data,...(statusChanged?{status:nextStatus}:{}),...(typeof data.dp_qtde_funcionarios==='number'?{dashboardMetrics:{...(closing.dashboardMetrics||{}),employees:data.dp_qtde_funcionarios}}:{})}});migrated++;}
    }
    return {created,adapted,hidden,migrated};
}
