import os
import time
import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

load_dotenv()

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5173/api/automation")
ROBOT_TOKEN = os.getenv("ROBOT_API_SECRET", "qmax-secret-robot-token-2026")

HEADERS = {
    "Authorization": f"Bearer {ROBOT_TOKEN}",
    "Content-Type": "application/json"
}

def poll_for_task():
    print("Buscando novas tarefas (Certifique-se que o Node.js está rodando!)...")
    try:
        response = requests.post(
            f"{API_BASE_URL}/tasks/poll",
            json={"taskTypes": ["DOWNLOAD_DAS"]},
            headers=HEADERS
        )
        response.raise_for_status()
        return response.json().get("task")
    except Exception as e:
        print(f"Servidor Node.js não respondeu. Tentando novamente em breve...")
        return None

def process_download_das(task):
    cnpj = task['company']['cnpj']
    print(f"🚀 Iniciando Automação do Simples Nacional para o CNPJ: {cnpj}")
    
    # Obs: Em produção, vamos baixar o .pfx da API e instalar via subprocess aqui.
    # Por enquanto, vamos automatizar a navegação pura do navegador!
    
    with sync_playwright() as p:
        # Iniciamos o Chrome (headless=False para você VER a mágica acontecer na sua tela)
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        print("Acessando o Portal do e-CAC...")
        page.goto("https://cav.receita.fazenda.gov.br/autenticacao/login")
        
        # Clica no botão Entrar com GOV.BR
        print("Clicando no login GOV.BR...")
        # Espera o botão de GOV.BR carregar e clica
        page.locator('xpath=//img[@alt="Acesso Gov BR"]').click(timeout=10000)
        
        # Na tela do Gov.br, clicaria no Certificado Digital
        # page.locator("text=Seu certificado digital").click()
        
        print("Navegação feita com sucesso! Pausando por 5 segundos para você ver a tela...")
        time.sleep(5)
        
        # Fecha o navegador
        browser.close()
        
    return {"status": "Teste de navegação Playwright concluído!"}

def complete_task(task_id, result):
    try:
        requests.post(f"{API_BASE_URL}/tasks/{task_id}/complete", json={"result": result}, headers=HEADERS)
        print(f"✅ Tarefa {task_id} concluída na API!")
    except: pass

def fail_task(task_id, error_message):
    try:
        requests.post(f"{API_BASE_URL}/tasks/{task_id}/fail", json={"errorMessage": error_message}, headers=HEADERS)
        print(f"❌ Tarefa {task_id} falhou!")
    except: pass

def main():
    print("🤖 Robô do Simples Nacional (Playwright) Iniciado!")
    while True:
        task = poll_for_task()
        if not task:
            time.sleep(10)
            continue
            
        try:
            if task["taskType"] == "DOWNLOAD_DAS":
                result = process_download_das(task)
                complete_task(task["id"], result)
        except Exception as e:
            fail_task(task["id"], str(e))
            
        time.sleep(2)

if __name__ == "__main__":
    main()
