export function exportToCsv(filename: string, columns: { header: string; key: string }[], data: any[]) {
  // BOM for UTF-8 Excel support
  const BOM = '\uFEFF';
  
  // Header row
  const headerRow = columns.map(col => escapeCsv(col.header)).join(';');
  
  // Data rows
  const dataRows = data.map(row => {
    return columns.map(col => escapeCsv(row[col.key])).join(';');
  });
  
  const csvContent = [headerRow, ...dataRows].join('\n');
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

function escapeCsv(value: any): string {
  if (value === null || value === undefined) return '';
  let str = String(value).trim();
  // Neutraliza CSV / Excel Formula Injection (DDE) caso o valor comece com =, +, -, @
  if (/^[=\+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Se contiver ponto-e-vírgula, aspas, quebra de linha ou for um número longo (como CNPJ que o Excel pode estragar), colocar entre aspas.
  // Para forçar o Excel a tratar como texto e não estragar zeros à esquerda (ex: 00006, 00434-B) ou notação científica (ex: CNPJ), adicionamos ="valor"
  if (/^0\d+(?:-[A-Za-z0-9]+)?$/.test(str) || (/^[\d.\-\/]+$/.test(str) && (str.length > 11))) {
    return `="${str}"`;
  }
  
  if (str.includes(';') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
