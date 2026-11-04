# 📘 FECHAMENTO PRO - DOSSIÊ DE CONTEXTO & HANDOVER TÉCNICO

> **Documento de Continuidade e Passagem de Bastão**  
> **Data:** Novembro / 2026  
> **Organização:** Grupo Q-MAX / Virtus Contabilidade  
> **Repositório Oficial:** `https://github.com/Grupo-Q-Max/sistema.git` (`branch: main`)

---

## 1. 🎯 VISÃO GERAL DO SISTEMA

O **Fechamento Pro** é o sistema web corporativo de gestão de fechamentos mensais contábeis, fiscais, de departamento pessoal (folha), parcelamentos e entidades Cushman (condomínios/associações).

### Stack Tecnológica:
- **Frontend:** React 19, TypeScript, Vite, Lucide Icons, CSS Modular customizado (Dark Mode).
- **Backend:** Node.js, Express, TypeScript, esbuild (bundle em `dist-server/index.js`).
- **Banco de Dados:** MariaDB em nuvem gerenciada na **Microsoft Azure** (Porta 3306), acessado via Prisma ORM 7 com adapter nativo `@prisma/adapter-mariadb`.
- **Criptografia:** AES-256-CBC para senhas municipais (Ginfess, Giss, SD) e certificados.

---

## 2. 🗄️ REGRAS DE NEGÓCIO CRÍTICAS & AJUSTES RECENTES

### A. Responsáveis Contábeis (Base Histórica Restaurada)
- 327 empresas ativas foram restauradas com os analistas contábeis legítimos da base histórica de 07/10/2026.
- Distribuição contábil real:
  - **Fernando:** 97 empresas
  - **Luiz:** 76 empresas
  - **Ingrid:** 58 empresas
  - **Alexandre:** 42 empresas
  - **Stefani:** 42 empresas
  - Outros: 12 empresas
- Script de segurança persistido: [`scripts/restore-legacy-contabil-responsibles.ts`](file:///c:/Users/RodrigoSantePenhalve/Desktop/fechamento/scripts/restore-legacy-contabil-responsibles.ts).

### B. Blindagem da Aba Cushman (Condomínios & Associações)
- A aba **Cushman** é restrita **exclusivamente a 133 entidades legítimas** (94 Condomínios e 39 Associações).
- 44 empresas indevidas do Simples Nacional e grupo Q-MAX foram removidas do escopo Cushman.
- 392 fechamentos vazios indevidos foram deletados do banco.
- Blindagens aplicadas no código: [`src/config/cushmanColumns.ts`](file:///c:/Users/RodrigoSantePenhalve/Desktop/fechamento/src/config/cushmanColumns.ts) e [`server/cushman.ts`](file:///c:/Users/RodrigoSantePenhalve/Desktop/fechamento/server/cushman.ts).

### C. Novos Papéis no Sistema (`enum Role`)
- `CADASTRO`: Permissão para criar e editar empresas, visualizar senhas SD/municipais, sem acesso irrestrito aos módulos gerenciais.
- `CUSHMAN`: Acesso focado na gestão das entidades de condomínio/associação.

---

## 3. 🚀 NOVOS MÓDULOS DE ALTA PERFORMANCE (ENTREGUES HOJE)

### 1. Termômetro de Risco & Predição de Atraso
- **Arquivo Servidor:** [`server/riskRadar.ts`](file:///c:/Users/RodrigoSantePenhalve/Desktop/fechamento/server/riskRadar.ts) (`GET /api/dashboard/risk-radar`)
- **Arquivo Frontend:** [`src/components/RiskRadarWidget.tsx`](file:///c:/Users/RodrigoSantePenhalve/Desktop/fechamento/src/components/RiskRadarWidget.tsx)
- **O que faz:** Cruza em tempo real:
  - Prazos legais iminentes (dia 07 para FGTS/DP, dia 15 para DCTFWeb/Reinf, dia 20 para Simples Nacional/PGDAS);
  - Certificados A1 expirados ou vencendo em até 15 dias;
  - Procurações RFB e FGTS vencidas;
  - Anotações de cobrança documental ativa (*"COBRANÇA DOC"*, *"DOC. REDE"*);
  - Sobrecarga de analistas (responsáveis com muitas pendências acumuladas).
- **Recursos:** Medidor geral de risco, micro-KPIs, filtros interativos, botão para copiar alerta pronto de WhatsApp e modal de Raio-X.

### 2. Busca Global Spotlight (`Ctrl + K` Bloqueando Navegador)
- **Arquivo Frontend:** [`src/components/SpotlightSearch.tsx`](file:///c:/Users/RodrigoSantePenhalve/Desktop/fechamento/src/components/SpotlightSearch.tsx)
- **Arquivo Servidor:** [`server/workloadAndHistory.ts`](file:///c:/Users/RodrigoSantePenhalve/Desktop/fechamento/server/workloadAndHistory.ts) (`GET /api/spotlight`)
- **O que faz:**
  - Pressionar `Ctrl + K` (ou `Cmd + K`) em qualquer tela intercepta o evento com `e.preventDefault()`, impedindo o navegador Chrome/Edge de abrir a barra de endereços.
  - Abre modal estilo macOS Spotlight com busca instantânea por Código, Razão Social, CNPJ ou Cidade.
  - Permite atalhos rápidos de teclado (`↑`, `↓`, `Enter`) e botões para ir direto ao Fiscal, DP, Contábil, Cadastro ou enviar mensagem de WhatsApp.

### 3. Raio-X Histórico Anual 360° da Empresa
- **Arquivo Frontend:** [`src/components/Company360Modal.tsx`](file:///c:/Users/RodrigoSantePenhalve/Desktop/fechamento/src/components/Company360Modal.tsx)
- **Arquivo Servidor:** [`server/workloadAndHistory.ts`](file:///c:/Users/RodrigoSantePenhalve/Desktop/fechamento/server/workloadAndHistory.ts) (`GET /api/companies/:id/history-360`)
- **O que faz:** Exibe a linha do tempo completa dos 12 meses do ano da empresa, com status de entrega do Fiscal, DP (com contagem de vidas/funcionários declarados) e Contábil, além do índice de conformidade anual.

### 4. Balanceador Visual de Carga da Equipe (Workload Balancer)
- **Arquivo Frontend:** [`src/components/WorkloadBalancerModal.tsx`](file:///c:/Users/RodrigoSantePenhalve/Desktop/fechamento/src/components/WorkloadBalancerModal.tsx)
- **Arquivo Servidor:** [`server/workloadAndHistory.ts`](file:///c:/Users/RodrigoSantePenhalve/Desktop/fechamento/server/workloadAndHistory.ts) (`GET /api/workload/balance` e `POST /api/workload/transfer-batch`)
- **O que faz:** Permite aos administradores e sócios visualizar cards comparativos de carga por analista (com breakdown de Simples Nacional, Lucro Presumido, Real e Condomínios) e realizar rebalanceamento ou transferência em lote com 1 clique.

---

## 4. 🗄️ PROJETO DE AUTOMAÇÃO COM O SISTEMA DOMÍNIO (THOMSON REUTERS)

### O Arquivo de Backup:
- **Exemplo Real:** `D:\automacao\50110_20261101_1900C.dom` (5,10 GB compactado)
- **Formato:** Arquivo ZIP padrão contendo:
  - `contabil.db` (19,61 GB descompactado - Banco **Sybase SQL Anywhere**);
  - `contabil.log` (433 MB - Log de transações).
- **Cobertura Mapeada:** Mais de **90% das colunas** do Fechamento Pro (Fiscal, DP e Contábil) existem nativamente dentro do banco do Domínio:
  - **Fiscal:** Apuração de DAS/Simples, Faturamento das notas fiscais, ISS, REINF, SPED Fiscal e Contribuições;
  - **DP:** Contagem exata de vidas/funcionários ativos no mês, data do cálculo da folha, eSocial S-1299, DCTFWeb, FGTS Digital e Dissídio;
  - **Contábil:** Fechamento dos meses 01 a 12, balancetes, DEFIS, DASN, ECD e ECF.

### Arquitetura do Robô de Automação para a Máquina Virtual (VM):
1. **Robô de Download (RPA):** Roda toda madrugada (ex: 04h00), acessa o portal web da Domínio com credenciais seguras, baixa o backup mais recente (`.dom`) para o disco `D:\automacao` e limpa backups antigos.
2. **Processador e Extrator:** Abre o arquivo `.dom`, consulta os fechamentos da competência via ODBC / driver Sybase SQL Anywhere.
3. **Sincronizador Fechamento Pro:** Executa `upsert` no MariaDB da Azure, atualizando o fechamento de todas as empresas automaticamente.

---

## 5. 💻 GUIA DE INSTALAÇÃO & EXECUÇÃO NA MÁQUINA VIRTUAL (VM)

Para rodar o Fechamento Pro e as automações na Máquina Virtual:

### Passo 1: Pré-Requisitos na VM
- **Sistema Operacional:** Windows 10/11 ou Windows Server (ou Linux);
- **Node.js:** Versão 20 LTS ou 22 LTS instalada;
- **Git:** Instalado e configurado com acesso ao GitHub;
- **Espaço em Disco:** Recomendado no mínimo 50 GB livres em uma unidade dedicada (ex: `D:\`) para armazenamento dos backups do Domínio.

### Passo 2: Clonar o Repositório
```bash
git clone https://github.com/Grupo-Q-Max/sistema.git
cd sistema
npm install
```

### Passo 3: Configurar o Arquivo `.env`
Crie o arquivo `.env` na raiz do projeto na VM (os mesmos valores da máquina atual):
```env
DATABASE_URL="mysql://<usuario>:<senha>@<host-azure>:3306/<database>?sslaccept=strict"
ENCRYPTION_KEY="fechamento-target-super-secret-key-32b!"
PORT=3000
```

### Passo 4: Rodar a Aplicação
```bash
# Compilar frontend e backend
npm run build

# Iniciar servidor
npm run start
# OU em modo desenvolvimento:
npm run dev:all
```

---

## 6. 🧠 COMO INICIAR O ANTIGRAVITY NA VM
Ao abrir o Antigravity na Máquina Virtual, basta instruir o agente com a seguinte mensagem:

> *"Olá! Clonei o repositório do Fechamento Pro nesta VM. Por favor, leia o arquivo `CONTEXT_HANDOVER.md` na raiz do projeto para carregar 100% do histórico e do contexto. Estamos prontos para continuar a automação do Sistema Domínio."*

Com isso, o agente terá **conhecimento completo e imediato** de toda a história do projeto!

