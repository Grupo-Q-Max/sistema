import openpyxl
import json
import re
from datetime import datetime, date

def parse_date(val):
    if not val:
        return None
    if isinstance(val, (datetime, date)):
        return val.strftime('%Y-%m-%d')
    s = str(val).strip()
    if not s or s.upper() in ('NONE', 'NULL', 'N/A', '-'):
        return None
    # match DD/MM/YYYY
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', s)
    if m:
        d, mth, y = m.groups()
        return f'{int(y):04d}-{int(mth):02d}-{int(d):02d}'
    # match YYYY-MM-DD
    m2 = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', s)
    if m2:
        y, mth, d = m2.groups()
        return f'{int(y):04d}-{int(mth):02d}-{int(d):02d}'
    return None

def clean_str(val):
    if val is None:
        return None
    s = str(val).strip()
    if not s or s.upper() in ('NONE', 'NULL', 'N/A', '-', 'N/TEM', 'ISENTO'):
        if s.upper() in ('ISENTO', 'N/TEM'):
            return s.upper()
        return None
    return s

wb = openpyxl.load_workbook('cadastro_clientes_jettax_06_11_2026.xlsx', data_only=True)
ws = wb['clientes']
headers = [c for c in next(ws.iter_rows(values_only=True))]

rows = []
for r in ws.iter_rows(min_row=2, values_only=True):
    d = dict(zip(headers, r))
    raw_cnpj = re.sub(r'\D', '', str(d.get('*CNPJ') or ''))
    if not raw_cnpj:
        continue

    # Code in 'Integrações'
    code_raw = clean_str(d.get('Integrações'))
    code = None
    if code_raw:
        # e.g. "00197" or "197"
        code_digits = re.sub(r'\D', '', code_raw)
        if code_digits:
            code = code_digits.zfill(5)
        else:
            code = code_raw

    rows.append({
        'cnpj': raw_cnpj,
        'razao_social': clean_str(d.get('Razão Social')),
        'abertura': parse_date(d.get('Data de Abertura da Empresa')),
        'inicio_jettax': clean_str(d.get('*Início das Atividades na Jettax')),
        'estado': clean_str(d.get('Estado')),
        'ie': clean_str(d.get('Inscrição Estadual')),
        'im': clean_str(d.get('*Inscrição Municipal')),
        'cep': clean_str(d.get('CEP')),
        'tipo_logradouro': clean_str(d.get('Tipo de Logradouro')),
        'endereco': clean_str(d.get('Endereço')),
        'numero': clean_str(d.get('Numero')),
        'complemento': clean_str(d.get('Complemento')),
        'bairro': clean_str(d.get('Bairro')),
        'cert_vencimento': parse_date(d.get('Data de Vencimento do Certificado Digital')),
        'login_prefeitura': clean_str(d.get('Login Prefeitura')),
        'senha_prefeitura': clean_str(d.get('Senha Prefeitura')),
        'codigo_acesso_sn': clean_str(d.get('Código de Acesso Simples Nacional')),
        'cpf_sn': re.sub(r'\D', '', str(d.get('CPF do Responsavel do Simples Nacional') or '')) or None,
        'emissor_login': clean_str(d.get('Credencial (Emissor nacional)')),
        'emissor_senha': clean_str(d.get('Senha (Emissor nacional)')),
        'codigo_dominio': code
    })

with open('scripts/jettax_clean.json', 'w', encoding='utf-8') as f:
    json.dump(rows, f, ensure_ascii=False, indent=2)

print(f'Sucesso: {len(rows)} empresas limpas e extraídas com datas padronizadas.')

