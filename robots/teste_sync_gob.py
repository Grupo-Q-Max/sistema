import csv
import requests
import os
from dotenv import load_dotenv

load_dotenv()
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5173/api/automation")
ROBOT_TOKEN = os.getenv("ROBOT_API_SECRET", "qmax-secret-robot-token-2026")

HEADERS = {
    "Authorization": f"Bearer {ROBOT_TOKEN}",
    "Content-Type": "application/json"
}

def simular_sync_gob_lote():
    """
    Testa a rota da API enviando dados em lote lidos de um arquivo CSV,
    simulando exatamente o que o Domínio exporta.
    """
    print("🚀 Testando Sincronização em Lote (GOB -> Q-Max API)")
    
    arquivo_csv = "exportacao_gob_teste.csv"
    competencia_atual = "09/2026"
    
    import csv
    try:
        with open(arquivo_csv, mode='r', encoding='utf-8') as file:
            reader = csv.DictReader(file, delimiter=';')
            
            for row in reader:
                cnpj = row.get('CNPJ')
                nome = row.get('Nome')
                regime = row.get('Regime')
                obrigacao = row.get('Obrigacao') # Mapeado para nossas colunas: impostos, sped_fiscal, reinf, etc.
                status_gob = row.get('Status')
                
                if status_gob in ['Gerado', 'Entregue']:
                    payload = {
                        "cnpj": cnpj,
                        "name": nome,
                        "regime": regime,
                        "competencia": competencia_atual,
                        "obrigacao": obrigacao,
                        "status": "CONCLUIDO"
                    }
                    
                    print(f"Enviando {obrigacao.upper()} da empresa {nome}...")
                    
                    try:
                        response = requests.post(f"{API_BASE_URL}/sync-gob", json=payload, headers=HEADERS)
                        response.raise_for_status()
                        print(f"✅ SUCESSO: {nome} - {obrigacao}")
                    except requests.exceptions.RequestException as e:
                        print(f"❌ Erro de conexão ao enviar {nome}: {e}")
                        
        print("\n-> Sincronização em lote finalizada! Vá no painel e veja as 3 empresas e suas colunas verdes!")
                    
    except FileNotFoundError:
        print(f"❌ Arquivo {arquivo_csv} não encontrado.")

if __name__ == "__main__":
    simular_sync_gob_lote()
