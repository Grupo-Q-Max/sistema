// SQL value parser helper
export function parseSqlValues(valuesStr) {
  const rows = [];
  let i = 0;
  const n = valuesStr.length;

  while (i < n) {
    // Find next '(' that starts a row
    while (i < n && valuesStr[i] !== '(') i++;
    if (i >= n) break;
    i++; // skip '('

    const row = [];
    let currentVal = '';
    let inString = false;
    let isEscaped = false;
    let wasQuoted = false;

    while (i < n) {
      const char = valuesStr[i];

      if (inString) {
        if (isEscaped) {
          currentVal += char;
          isEscaped = false;
        } else if (char === '\\') {
          isEscaped = true;
        } else if (char === "'") {
          // Check for '' escape in SQL
          if (i + 1 < n && valuesStr[i + 1] === "'") {
            currentVal += "'";
            i++; // skip second '
          } else {
            inString = false;
          }
        } else {
          currentVal += char;
        }
      } else {
        if (char === "'") {
          inString = true;
          wasQuoted = true;
          currentVal = ''; // Reset whitespace before the quote
        } else if (char === ',' || char === ')') {
          const trimmed = currentVal.trim();
          if (trimmed === 'NULL') {
            row.push(null);
          } else if (wasQuoted) {
            row.push(currentVal.trim());
          } else if (trimmed === '') {
            row.push(null);
          } else if (/^-?\d+$/.test(trimmed)) {
            row.push(trimmed);
          } else if (/^-?\d+\.\d+$/.test(trimmed)) {
            row.push(parseFloat(trimmed));
          } else {
            row.push(trimmed);
          }
          currentVal = '';
          wasQuoted = false;
          if (char === ')') {
            i++; // skip ')'
            break;
          }
        } else {
          currentVal += char;
        }
      }
      i++;
    }

    if (row.length > 0) {
      rows.push(row);
    }
  }

  return rows;
}
