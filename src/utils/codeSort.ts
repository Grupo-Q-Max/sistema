/**
 * Utilitário de ordenação natural para códigos de empresas.
 * Trata códigos como números (ex: "0006" é 6, ficando entre 5 e 7).
 * Garante que:
 * 1. Códigos numéricos fiquem ordenados por valor matemático (1, 2, ..., 6, 0006, 10, 100).
 * 2. Empresas sem código fiquem sempre no final da lista.
 * 3. Não haja bugs com códigos de 4 dígitos ou zeros à esquerda.
 */
export function compareCodes(
  aCode?: string | number | null,
  bCode?: string | number | null,
  asc: boolean = true
): number {
  const strA = (aCode !== undefined && aCode !== null ? String(aCode) : '').trim();
  const strB = (bCode !== undefined && bCode !== null ? String(bCode) : '').trim();

  // Se ambos vazios, são equivalentes
  if (!strA && !strB) return 0;
  // Empresas sem código vão sempre para o final da listagem
  if (!strA) return 1;
  if (!strB) return -1;

  // Extrai a parte numérica inicial se houver (ex: "0006" -> 6, "12-A" -> 12)
  const matchA = strA.match(/^(\d+)/);
  const matchB = strB.match(/^(\d+)/);

  const numA = matchA ? parseInt(matchA[1], 10) : NaN;
  const numB = matchB ? parseInt(matchB[1], 10) : NaN;

  const hasNumA = !isNaN(numA);
  const hasNumB = !isNaN(numB);

  let result = 0;
  if (hasNumA && hasNumB) {
    if (numA !== numB) {
      result = numA - numB;
    } else {
      // Se o valor numérico for idêntico (ex: "0006" e "6", ou "0006" e "0006-A")
      result = strA.localeCompare(strB, 'pt-BR', { numeric: true });
    }
  } else if (hasNumA) {
    result = -1; // Números vêm antes de códigos puramente textuais
  } else if (hasNumB) {
    result = 1;
  } else {
    result = strA.localeCompare(strB, 'pt-BR', { numeric: true });
  }

  return asc ? result : -result;
}

