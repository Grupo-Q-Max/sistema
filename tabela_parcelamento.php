<?php
// tabela_parcelamento.php
session_start();
ini_set('display_errors', 1);
error_reporting(E_ALL);
require_once 'assets/backend/config.php';

$tipos_permitidos = ['admin', 'lider_fiscal', 'fiscal'];
if (!isset($_SESSION['usuario_id']) || !in_array($_SESSION['tipo_conta'], $tipos_permitidos)) {
    $_SESSION['mensagem'] = 'Acesso restrito à área de Parcelamentos.';
    header('Location: index.php');
    exit();
}

$usuario_id_logado = $_SESSION['usuario_id'];
$tipo_conta_logado = $_SESSION['tipo_conta'];

$pode_editar_celulas = in_array($tipo_conta_logado, ['admin', 'lider_fiscal', 'fiscal']);
$pode_editar_geral = $pode_editar_celulas;
$e_admin = ($tipo_conta_logado === 'admin');
$pode_excluir = in_array($tipo_conta_logado, ['admin', 'fiscal','lider_fiscal']);

// =======================================================================
// == FUNÇÃO DE FORMATAÇÃO DE DATA ==
// =======================================================================
function formatarDataBR($data)
{
    if (empty($data) || $data === '0000-00-00') {
        return '';
    }
    try {
        $dateObj = new DateTime($data);
        return $dateObj->format('d/m/Y');
    } catch (Exception $e) {
        return '';
    }
}

// LÓGICA DE FILTRO
$ano_padrao = date('Y');
$busca = trim($_GET['busca'] ?? '');
$status_filtro = $_GET['status'] ?? '';
$ano_selecionado = (int)($_GET['ano'] ?? $ano_padrao);
$ordenar_por = $_GET['ordenar_por'] ?? 'codigo_empresa';
$ordem = $_GET['ordem'] ?? 'ASC';

// Popula o dropdown de anos
$anos_disponiveis = [];
$result_anos = $conexao->query("SELECT DISTINCT ano FROM controle_meses ORDER BY ano DESC");
if ($result_anos) {
    while ($row = $result_anos->fetch_assoc()) {
        $anos_disponiveis[] = $row['ano'];
    }
}
if (!in_array(date('Y'), $anos_disponiveis)) array_unshift($anos_disponiveis, date('Y'));
$anos_disponiveis = array_unique($anos_disponiveis);
rsort($anos_disponiveis);

$sql_where_clausula = 'WHERE cm.ano = ?';
$params = [$ano_selecionado];
$types = 'i';


if (!empty($busca)) {
    $sql_where_clausula .= ' AND (p.nome_empresa LIKE ? OR p.codigo_empresa LIKE ? OR p.cnpj_empresa LIKE ?)';
    $busca_param = "%{$busca}%";
    array_push($params, $busca_param, $busca_param, $busca_param);
    $types .= 'sss';
}
if (!empty($status_filtro)) {
    $sql_where_clausula .= ' AND p.status = ?';
    $params[] = $status_filtro;
    $types .= 's';
}

$sql_parcelamentos = "
    SELECT
        MAX(p.id) as id,
        p.codigo_empresa,
        TRIM(p.parcelamento) as parcelamento,
        p.data_efetivacao,
        p.valor,
        MAX(p.nome_empresa) as nome_empresa,
        MAX(p.cnpj_empresa) as cnpj_empresa,
        MAX(p.qtde_parcelas) as qtde_parcelas,
        MAX(p.data_final) as data_final,
        MAX(p.status) as status,
        MAX(p.janeiro) as janeiro,
        MAX(p.fevereiro) as fevereiro,
        MAX(p.marco) as marco,
        MAX(p.abril) as abril,
        MAX(p.maio) as maio,
        MAX(p.junho) as junho,
        MAX(p.julho) as julho,
        MAX(p.agosto) as agosto,
        MAX(p.setembro) as setembro,
        MAX(p.outubro) as outubro,
        MAX(p.novembro) as novembro,
        MAX(p.dezembro) as dezembro
    FROM parcelamentos p
    JOIN controle_meses cm ON p.id_mes = cm.id
    {$sql_where_clausula}
    GROUP BY p.codigo_empresa, TRIM(p.parcelamento), p.data_efetivacao, p.valor, cm.ano
    ORDER BY {$ordenar_por} {$ordem}
";
$stmt = $conexao->prepare($sql_parcelamentos);
$stmt->bind_param($types, ...$params);
$stmt->execute();
$parcelamentos = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();

$sql_stats = "
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN s.status = 'ativo' THEN 1 ELSE 0 END) as ativos,
        SUM(CASE WHEN s.status = 'inativo' THEN 1 ELSE 0 END) as inativos,
        SUM(CASE WHEN s.status = 'quitado' THEN 1 ELSE 0 END) as quitados
    FROM (
        SELECT MAX(p.status) as status
        FROM parcelamentos p
        JOIN controle_meses cm ON p.id_mes = cm.id
        {$sql_where_clausula}
        GROUP BY p.codigo_empresa, TRIM(p.parcelamento), p.data_efetivacao, p.valor, cm.ano
    ) s
";
$stmt_stats = $conexao->prepare($sql_stats);
$stmt_stats->bind_param($types, ...$params);
$stmt_stats->execute();
$stats = $stmt_stats->get_result()->fetch_assoc();
$stmt_stats->close();

// =======================================================================
// == 2. LÓGICA DE VENCIMENTOS (Mantida) ==
// =======================================================================
$id_mes_aberto = null;
$result_mes_aberto = $conexao->query("SELECT id FROM controle_meses WHERE status = 'aberto' ORDER BY ano DESC, mes DESC LIMIT 1");
if ($result_mes_aberto && $result_mes_aberto->num_rows > 0) {
    $id_mes_aberto = (int)$result_mes_aberto->fetch_assoc()['id'];
} else {
    $result_mes_aberto = $conexao->query("SELECT id FROM controle_meses ORDER BY ano DESC, mes DESC LIMIT 1");
    if ($result_mes_aberto && $result_mes_aberto->num_rows > 0) {
        $id_mes_aberto = (int)$result_mes_aberto->fetch_assoc()['id'];
    }
}

$empresas_para_certificados = [];
if ($id_mes_aberto) {
    $params_cert = [$id_mes_aberto];
    $types_cert = 'i';
    $sql_empresas_cert = "SELECT DISTINCT cf.codigo, cf.empresa, cf.cnpj, cf.data_vencimento_certificado, cf.data_procuracao_target,
                                  cf.certificado_cliente, cf.tipo_certificado, cf.senha_certificado, cf.data_emissao_certificado
                           FROM controle_fechamento cf
                           WHERE cf.id_mes = ?"; // Removida a trava de p.id_usuario

    $stmt_cert = $conexao->prepare($sql_empresas_cert);
    if ($stmt_cert) {
        $stmt_cert->bind_param($types_cert, ...$params_cert);
        $stmt_cert->execute();
        $empresas_para_certificados = $stmt_cert->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt_cert->close();
    }
}

$certificados_a_vencer = 0;
$procuracoes_a_vencer = 0;
$empresas_certificados_vencendo = [];
$empresas_procuracoes_vencendo = [];
$hoje_venc = new DateTime();
$limite_vencimento_venc = (new DateTime())->modify('+30 days');

foreach ($empresas_para_certificados as $empresa) {
    if (!empty($empresa['data_vencimento_certificado'])) {
        try {
            $data_vencimento_cert = new DateTime($empresa['data_vencimento_certificado']);
            if ($data_vencimento_cert >= $hoje_venc && $data_vencimento_cert <= $limite_vencimento_venc) {
                $certificados_a_vencer++;
                $intervalo_cert = $hoje_venc->diff($data_vencimento_cert);
                $dias_restantes_cert = $intervalo_cert->days + ($intervalo_cert->invert ? 0 : 1);
                $empresas_certificados_vencendo[] = [
                    'empresa' => $empresa['empresa'],
                    'cnpj' => $empresa['cnpj'],
                    'data_vencimento' => formatarDataBR($empresa['data_vencimento_certificado']),
                    'dias_restantes' => $dias_restantes_cert
                ];
            }
        } catch (Exception $e) {
        }
    }
    if (!empty($empresa['data_procuracao_target'])) {
        try {
            $data_vencimento_proc = new DateTime($empresa['data_procuracao_target']);
            if ($data_vencimento_proc >= $hoje_venc && $data_vencimento_proc <= $limite_vencimento_venc) {
                $procuracoes_a_vencer++;
                $intervalo_proc = $hoje_venc->diff($data_vencimento_proc);
                $dias_restantes_proc = $intervalo_proc->days + ($intervalo_proc->invert ? 0 : 1);
                $empresas_procuracoes_vencendo[] = [
                    'empresa' => $empresa['empresa'],
                    'cnpj' => $empresa['cnpj'],
                    'data_vencimento' => formatarDataBR($empresa['data_procuracao_target']),
                    'dias_restantes' => $dias_restantes_proc
                ];
            }
        } catch (Exception $e) {
        }
    }
}

// =======================================================================
// == 3. LÓGICA DE STATUS DETALHADO MENSAL (NOVA) ==
// =======================================================================
$meses = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
$meses_labels = ['janeiro' => 'Jan', 'fevereiro' => 'Fev', 'marco' => 'Mar', 'abril' => 'Abr', 'maio' => 'Mai', 'junho' => 'Jun', 'julho' => 'Jul', 'agosto' => 'Ago', 'setembro' => 'Set', 'outubro' => 'Out', 'novembro' => 'Nov', 'dezembro' => 'Dez'];

$stats_mensais = [];
foreach ($meses as $m) {
    $stats_mensais[$m] = [
        'label' => $meses_labels[$m],
        'total' => 0,  // Quantos parcelamentos DEVEM ter esse mês preenchido
        'feitos' => 0  // Quantos JÁ TÊM esse mês preenchido
    ];
}

$total_campos_uteis = 0;
$total_campos_preenchidos = 0;

foreach ($parcelamentos as $p) {
    // Datas para determinar se o mês é N/A
    $ano_inicio = (int)date('Y', strtotime($p['data_efetivacao']));
    $mes_inicio = (int)date('n', strtotime($p['data_efetivacao']));
    $ano_fim = $p['data_final'] ? (int)date('Y', strtotime($p['data_final'])) : 9999;
    $mes_fim = $p['data_final'] ? (int)date('n', strtotime($p['data_final'])) : 12;

    // Ignora status que não exigem acompanhamento (opcional, mas recomendado)
    if ($p['status'] !== 'ativo' && $p['status'] !== 'quitado') continue;

    foreach ($meses as $index => $mes_nome) {
        $mes_num = $index + 1;
        $eh_aplicavel = true;

        // Mesma lógica de N/A da tabela visual
        if ($ano_selecionado < $ano_inicio || ($ano_selecionado == $ano_inicio && $mes_num < $mes_inicio)) {
            $eh_aplicavel = false;
        }
        if ($p['data_final'] && ($ano_selecionado > $ano_fim || ($ano_selecionado == $ano_fim && $mes_num > $mes_fim))) {
            $eh_aplicavel = false;
        }
        if ($p['status'] == 'quitado' && ($ano_selecionado > $ano_fim || ($ano_selecionado == $ano_fim && $mes_num > $mes_fim))) {
            $eh_aplicavel = false;
        }

        if ($eh_aplicavel) {
            $stats_mensais[$mes_nome]['total']++;
            $total_campos_uteis++;

            $valor = trim($p[$mes_nome] ?? '');
            if (!empty($valor)) {
                $stats_mensais[$mes_nome]['feitos']++;
                $total_campos_preenchidos++;
            }
        }
    }
}

$progresso_geral_percentual = ($total_campos_uteis > 0) ? round(($total_campos_preenchidos / $total_campos_uteis) * 100) : 0;
// =======================================================================

?>
<!DOCTYPE html>
<html lang="pt-br">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tabela de Parcelamentos - Ano <?= $ano_selecionado ?></title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="assets/css/contabil.css">

    <style>
        /* --- ESTILOS DO DETALHAMENTO MENSAL (NOVO) --- */
        .detail-card {
            background: var(--card-bg, #fff);
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
            margin-bottom: 25px;
            border: 1px solid var(--border-color, #eee);
        }

        .detail-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--border-color, #eee);
            padding-bottom: 15px;
            flex-wrap: wrap;
            gap: 10px;
        }

        .detail-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            /* Colunas mais estreitas para caber 12 meses */
            gap: 10px;
        }

        .detail-item {
            background: var(--background-color, #f8f9fa);
            padding: 10px;
            border-radius: 6px;
            border: 1px solid var(--border-color, #e9ecef);
            text-align: center;
        }

        .detail-title {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--text-color, #555);
            margin-bottom: 5px;
            display: flex;
            justify-content: space-between;
        }

        .mini-progress {
            height: 6px;
            background: #e0e0e0;
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 5px;
        }

        .mini-fill {
            height: 100%;
            transition: width 0.5s ease;
        }

        /* Cores das barras */
        .fill-red {
            background-color: #dc3545;
        }

        .fill-yellow {
            background-color: #ffc107;
        }

        .fill-green {
            background-color: #198754;
        }

        .progress {
            background-color: #e9ecef;
            border-radius: 0.25rem;
            height: 10px;
            overflow: hidden;
        }

        .progress-bar {
            height: 100%;
            transition: width .6s ease;
        }

        .bg-danger {
            background-color: #dc3545 !important;
        }

        .bg-warning {
            background-color: #ffc107 !important;
        }

        .bg-success {
            background-color: #198754 !important;
        }

        /* --- FIM DOS ESTILOS DO DETALHAMENTO --- */

        /* --- Estilos de Célula (do seu script original) --- */
        .data-table thead th {
            white-space: nowrap;
        }

        .celula-salvando {
            background-color: #fef0c7 !important;
        }

        .celula-sucesso {
            background-color: #d1e7dd !important;
            transition: background-color 0.5s;
        }

        .celula-erro {
            background-color: #f8d7da !important;
            transition: background-color 0.5s;
        }

        .celula-na {
            background-color: #f8f9fa;
            font-style: italic;
            color: #6c757d;
        }

        .celula-editavel {
            cursor: cell;
            background-color: #eef5ff;
            transition: background-color 0.2s ease-in-out;
        }

        .celula-editavel:hover,
        .celula-editavel:focus {
            background-color: #dbeaff;
            outline: 1px solid #9ec5fe;
        }

        .celula-readonly {
            background-color: #fff;
        }

        .btn-excluir-disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .actions-cell {
            white-space: nowrap;
        }

        /* --- Estilos dos Cards de Vencimento --- */
        .stats-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }

        .stats-box {
            background-color: var(--card-bg, #fff);
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
            position: relative;
        }

        .stats-box h3 {
            font-size: 1rem;
            color: var(--text-muted, #6c757d);
            margin-bottom: 5px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .stats-box .stats-numbers {
            font-size: 1.75rem;
            font-weight: 700;
            color: var(--text-color, #212529);
        }

        .stats-box p {
            font-size: 0.9rem;
            color: var(--text-muted, #6c757d);
            margin: 0;
        }

        .stats-box.alert {
            background-color: #fff3cd;
            color: #664d03;
            border: 1px solid #ffecb5;
        }

        .stats-box.alert h3,
        .stats-box.alert .stats-numbers,
        .stats-box.alert p {
            color: #664d03;
        }

        .btn-exportar-dp {
            position: absolute;
            bottom: 10px;
            right: 15px;
            background-color: #1D6F42;
            color: white;
            border: none;
            border-radius: 50%;
            width: 35px;
            height: 35px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-decoration: none;
            font-size: 1rem;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
            transition: all 0.2s ease-in-out;
        }

        .btn-exportar-dp:hover {
            background-color: #165934;
            color: white;
            transform: scale(1.1);
        }

        /* --- Estilos dos Filtros de Coluna (Thead) --- */
        .column-filter-icon {
            cursor: pointer;
            font-size: 0.8em;
            color: #b0c4de;
            margin-left: 5px;
            transition: color 0.3s;
        }

        .column-filter-icon:hover,
        .filter-active {
            color: #ffffff !important;
        }

        #column-filter-dropdown {
            display: none;
            position: absolute;
            background-color: var(--card-bg, #fff);
            border: 1px solid var(--border-color, #ddd);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1050;
            max-height: 300px;
            overflow-y: auto;
            border-radius: 4px;
            padding: 0;
        }

        .filter-menu-list {
            list-style: none;
            padding: 5px;
            margin: 0;
        }

        .filter-menu-list li {
            padding: 4px 8px;
        }

        .filter-menu-list label {
            display: block;
            white-space: nowrap;
            font-weight: normal;
        }

        .filter-menu-buttons {
            display: flex;
            justify-content: space-between;
            padding: 8px;
            border-top: 1px solid var(--border-color, #eee);
        }

        .filter-menu-buttons button {
            font-size: 0.8em;
            padding: 4px 8px;
        }

        /* --- Estilos das Colunas Fixas (Sticky) --- */
        .table-container {
            overflow: auto;
            max-height: 75vh;
            position: relative;
        }

        .data-table {
            border-collapse: separate;
            border-spacing: 0;
        }

        .data-table thead th {
            position: sticky;
            top: 0;
            z-index: 20;
            background-color: var(--primary-color);
        }

        .data-table th.col-sticky,
        .data-table td.col-sticky {
            position: sticky;
            z-index: 15;
            background-color: var(--card-bg, #fff);
        }

        .data-table thead th.col-sticky {
            z-index: 30;
            background-color: var(--primary-color);
        }

        .data-table thead th.ultima-coluna-fixa,
        .data-table tbody td.ultima-coluna-fixa {
            border-right: 2px solid var(--border-color, #ddd);
        }

        .data-table tr:hover td.col-sticky {
            background-color: var(--hover-bg-color, #f5f5f5) !important;
        }

        /* --- LARGURAS DAS COLUNAS --- */
        .col-acoes {
            min-width: 100px;
            width: 100px;
        }

        .col-codigo {
            min-width: 80px;
            width: 80px;
        }

        .col-empresa {
            min-width: 200px;
            max-width: 300px;
            width: 250px;
            white-space: normal;
            word-break: break-word;
        }

        .col-cnpj {
            min-width: 160px;
            width: 160px;
        }

        .col-parcelamento {
            min-width: 150px;
            max-width: 250px;
            width: 200px;
            white-space: normal;
            word-break: break-word;
        }

        .col-valor {
            min-width: 120px;
            width: 120px;
            text-align: right;
        }

        .col-status {
            min-width: 100px;
            width: 100px;
            text-align: center;
        }

        .col-qtde {
            min-width: 60px;
            width: 60px;
            text-align: center;
        }

        .col-inicio,
        .col-fim {
            min-width: 100px;
            width: 100px;
        }

        .col-mes {
            min-width: 100px;
            width: 100px;
        }

        /* Estilos dos Modais */
        .modal-overlay {
            visibility: hidden;
            opacity: 0;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            z-index: 1000;
            display: flex;
            justify-content: center;
            align-items: center;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        }

        .modal-overlay.active {
            visibility: visible;
            opacity: 1;
        }

        .modal-container {
            background: var(--card-bg, #fff);
            color: var(--text-color, #000);
            padding: 20px;
            border-radius: 8px;
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            transform: scale(0.9);
            transition: transform 0.3s ease;
        }

        .modal-overlay.active .modal-container {
            transform: scale(1);
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border-color, #ddd);
            padding-bottom: 10px;
            margin-bottom: 15px;
        }

        .modal-title {
            margin: 0;
            font-size: 1.25rem;
        }

        .modal-close {
            background: none;
            border: none;
            font-size: 1.75rem;
            cursor: pointer;
            color: var(--text-color, #000);
        }

        .modal-body .empty-message {
            text-align: center;
            padding: 20px;
            color: var(--text-muted, #666);
        }

        .modal-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9em;
        }

        .modal-table th,
        .modal-table td {
            padding: 8px 12px;
            border-bottom: 1px solid var(--border-color, #eee);
            text-align: left;
        }

        .modal-table th {
            background-color: var(--background-color, #f9f9f9);
        }

        .badge {
            display: inline-block;
            padding: 0.35em 0.65em;
            font-size: .75em;
            font-weight: 700;
            line-height: 1;
            color: #fff;
            text-align: center;
            white-space: nowrap;
            vertical-align: baseline;
            border-radius: 0.25rem;
        }

        .bg-danger {
            background-color: #dc3545;
        }

        .bg-warning {
            background-color: #ffc107;
            color: #000;
        }

        .bg-success {
            background-color: #198754;
        }

        .text-white {
            color: #fff !important;
        }

        .text-dark {
            color: #000 !important;
        }
    </style>
</head>

<body>
    <div id="modalCertificados" class="modal-overlay">
        <div class="modal-container" style="max-width: 90vw; width: 1200px;">
            <div class="modal-header">
                <h3 class="modal-title"><i class="fas fa-id-card"></i> Informações de Certificados</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="search-box-modal" style="margin-bottom: 15px; position: relative;">
                    <i class="fas fa-search" style="position: absolute; left: 10px; top: 10px; color: #aaa;"></i>
                    <input type="text" id="searchCertificadosInput" placeholder="Pesquisar por empresa, CNPJ, tipo de certificado..." style="width: 100%; padding: 8px 8px 8px 35px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                </div>
                <?php if (!empty($empresas_para_certificados)): ?>
                    <table class="modal-table" id="tableCertificados">
                        <thead>
                            <tr>
                                <th>Empresa</th>
                                <th>CNPJ</th>
                                <th>Cert. Cliente</th>
                                <th>Tipo Cert.</th>
                                <th>Senha Cert.</th>
                                <th>Emissão Cert.</th>
                                <th>Venc. Cert.</th>
                                <th>Proc. Target</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($empresas_para_certificados as $empresa): ?>
                                <tr>
                                    <td><?= htmlspecialchars($empresa['empresa']) ?></td>
                                    <td><?= htmlspecialchars($empresa['cnpj']) ?></td>
                                    <td><?= htmlspecialchars($empresa['certificado_cliente'] ?? '') ?></td>
                                    <td><?= htmlspecialchars($empresa['tipo_certificado'] ?? '') ?></td>
                                    <td><?= htmlspecialchars($empresa['senha_certificado'] ?? '') ?></td>
                                    <td><?= htmlspecialchars(formatarDataBR($empresa['data_emissao_certificado'] ?? '')) ?></td>
                                    <td><?= htmlspecialchars(formatarDataBR($empresa['data_vencimento_certificado'] ?? '')) ?></td>
                                    <td><?= htmlspecialchars(formatarDataBR($empresa['data_procuracao_target'] ?? '')) ?></td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php else: ?>
                    <div class="empty-message"><i class="fas fa-building"></i>
                        <p>Nenhuma empresa encontrada.</p>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
    <div id="modalCertificadosVencendo" class="modal-overlay">
        <div class="modal-container">
            <div class="modal-header">
                <h3 class="modal-title"><i class="fas fa-exclamation-triangle"></i> Certificados Vencendo (Próximos 30 dias)</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <?php if (!empty($empresas_certificados_vencendo)): ?>
                    <table class="modal-table">
                        <thead>
                            <tr>
                                <th>Empresa</th>
                                <th>CNPJ</th>
                                <th>Data Vencimento</th>
                                <th>Dias Restantes</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($empresas_certificados_vencendo as $item): ?>
                                <tr>
                                    <td><?= htmlspecialchars($item['empresa']) ?></td>
                                    <td><?= htmlspecialchars($item['cnpj']) ?></td>
                                    <td><?= htmlspecialchars($item['data_vencimento']) ?></td>
                                    <td>
                                        <?php
                                        $badge_class = 'bg-success text-white';
                                        if ($item['dias_restantes'] <= 7) $badge_class = 'bg-danger text-white';
                                        elseif ($item['dias_restantes'] <= 15) $badge_class = 'bg-warning text-dark';
                                        ?>
                                        <span class="badge <?= $badge_class ?>"> <?= $item['dias_restantes'] ?> dia(s) </span>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php else: ?>
                    <div class="empty-message"><i class="fas fa-check-circle"></i>
                        <p>Nenhum certificado vencendo nos próximos 30 dias.</p>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
    <div id="modalProcuracoesVencendo" class="modal-overlay">
        <div class="modal-container">
            <div class="modal-header">
                <h3 class="modal-title"><i class="fas fa-user-clock"></i> Procurações Vencendo (Próximos 30 dias)</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <?php if (!empty($empresas_procuracoes_vencendo)): ?>
                    <table class="modal-table">
                        <thead>
                            <tr>
                                <th>Empresa</th>
                                <th>CNPJ</th>
                                <th>Data Vencimento</th>
                                <th>Dias Restantes</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($empresas_procuracoes_vencendo as $item): ?>
                                <tr>
                                    <td><?= htmlspecialchars($item['empresa']) ?></td>
                                    <td><?= htmlspecialchars($item['cnpj']) ?></td>
                                    <td><?= htmlspecialchars($item['data_vencimento']) ?></td>
                                    <td>
                                        <?php
                                        $badge_class = 'bg-success text-white';
                                        if ($item['dias_restantes'] <= 7) $badge_class = 'bg-danger text-white';
                                        elseif ($item['dias_restantes'] <= 15) $badge_class = 'bg-warning text-dark';
                                        ?>
                                        <span class="badge <?= $badge_class ?>"> <?= $item['dias_restantes'] ?> dia(s) </span>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php else: ?>
                    <div class="empty-message"><i class="fas fa-check-circle"></i>
                        <p>Nenhuma procuração vencendo nos próximos 30 dias.</p>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
    <header class="header">
        <h1><i class="fas fa-file-invoice-dollar"></i> Tabela de Parcelamentos</h1>
        <a href="fiscal.php" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> Voltar</a>
    </header>

    <div class="main-content">
        <?php
        if (isset($_SESSION['mensagem_sucesso'])) {
            echo '<div class="alert alert-success">' . htmlspecialchars($_SESSION['mensagem_sucesso']) . '</div>';
            unset($_SESSION['mensagem_sucesso']);
        }
        if (isset($_SESSION['mensagem_erro'])) {
            echo '<div class="alert alert-danger">' . htmlspecialchars($_SESSION['mensagem_erro']) . '</div>';
            unset($_SESSION['mensagem_erro']);
        }
        ?>

        <div class="detail-card">
            <div class="detail-header">
                <div>
                    <h5 style="margin:0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-tasks"></i> Status Detalhado (Pagamentos do Ano)
                    </h5>
                    <small style="color: var(--text-muted, #6c757d);">
                        Progresso Geral: <strong><?= $progresso_geral_percentual ?>%</strong>
                        (<?= $total_campos_preenchidos ?> de <?= $total_campos_uteis ?> parcelas ativas)
                    </small>
                </div>

                <div style="width: 250px; max-width: 100%;">
                    <div class="progress">
                        <?php
                        $cor_geral = 'bg-danger';
                        if ($progresso_geral_percentual >= 50) $cor_geral = 'bg-warning';
                        if ($progresso_geral_percentual >= 90) $cor_geral = 'bg-success';
                        ?>
                        <div class="progress-bar <?= $cor_geral ?>" role="progressbar" style="width: <?= $progresso_geral_percentual ?>%"></div>
                    </div>
                </div>
            </div>

            <div class="detail-grid">
                <?php foreach ($stats_mensais as $key => $stat):
                    $total = $stat['total'];
                    $feitos = $stat['feitos'];
                    $perc = ($total > 0) ? round(($feitos / $total) * 100) : 0;

                    // Cor da mini barra
                    $mini_cor = 'fill-red';
                    if ($perc >= 50) $mini_cor = 'fill-yellow';
                    if ($perc >= 90) $mini_cor = 'fill-green';
                ?>
                    <div class="detail-item">
                        <div class="detail-title">
                            <span><?= htmlspecialchars($stat['label']) ?></span>
                            <span style="font-size: 0.8rem;"><?= $perc ?>%</span>
                        </div>

                        <div class="mini-progress">
                            <div class="mini-fill <?= $mini_cor ?>" style="width: <?= $perc ?>%;"></div>
                        </div>

                        <div style="font-size: 0.75rem; color: var(--text-muted, #6c757d); text-align: right;">
                            <strong><?= $feitos ?></strong> / <?= $total ?>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
        <div class="stats-container">
            <div class="stats-box <?= ($certificados_a_vencer > 0) ? 'alert' : '' ?>" id="btnCertificadosVencendo" style="position: relative; cursor: pointer;">
                <h3><i class="fas fa-exclamation-triangle"></i> Certificados a Vencer</h3>
                <div class="stats-numbers"><?= $certificados_a_vencer ?> certificados</div>
                <p>Nos próximos 30 dias</p>
                <?php if ($certificados_a_vencer > 0): ?>
                    <a href="exportar_certificados.php" class="btn-exportar-dp" title="Exportar lista para Excel">
                        <i class="fas fa-file-excel"></i>
                    </a>
                <?php endif; ?>
            </div>
            <div class="stats-box <?= ($procuracoes_a_vencer > 0) ? 'alert' : '' ?>" id="btnProcuracoesVencendo" style="position: relative; cursor: pointer;">
                <h3><i class="fas fa-user-clock"></i> Procurações a Vencer</h3>
                <div class="stats-numbers"><?= $procuracoes_a_vencer ?> procurações</div>
                <p>Nos próximos 30 dias</p>
            </div>
        </div>
        <div class="card mb-4">
            <div class="card-body">
                <div class="row">
                    <div class="col-lg-12 mb-3">
                        <div class="row">
                            <div class="col-6 col-md-3 col-lg-2 mb-2">
                                <div class="stat-card">
                                    <h5>Total (Ano)</h5><span><?= $stats['total'] ?? 0 ?></span>
                                </div>
                            </div>
                            <div class="col-6 col-md-3 col-lg-2 mb-2">
                                <div class="stat-card text-success">
                                    <h5>Ativos</h5><span><?= $stats['ativos'] ?? 0 ?></span>
                                </div>
                            </div>
                            <div class="col-6 col-md-3 col-lg-2 mb-2">
                                <div class="stat-card text-danger">
                                    <h5>Inativos</h5><span><?= $stats['inativos'] ?? 0 ?></span>
                                </div>
                            </div>
                            <div class="col-6 col-md-3 col-lg-2 mb-2">
                                <div class="stat-card text-primary">
                                    <h5>Quitados</h5><span><?= $stats['quitados'] ?? 0 ?></span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-12">
                        <form method="GET" class="row g-3 align-items-end">
    <input type="hidden" name="mes" value="<?= date('n') ?>"> 
    
    <div class="col-md-5">
        <label for="busca" class="form-label">Busca</label>
        <input type="text" id="busca" name="busca" class="form-control" placeholder="Empresa, código ou CNPJ..." value="<?= htmlspecialchars($busca) ?>">
    </div>
                            <div class="col-md-2"><label for="ano" class="form-label">Ano Exibido</label><select name="ano" id="ano" class="form-select"><?php foreach ($anos_disponiveis as $ano): ?><option value="<?= $ano ?>" <?= $ano_selecionado == $ano ? 'selected' : '' ?>><?= $ano ?></option><?php endforeach; ?></select></div>
                            <div class="col-md-2"><label for="status" class="form-label">Status</label><select id="status" name="status" class="form-select">
                                    <option value="">Todos</option>
                                    <option value="ativo" <?= $status_filtro == 'ativo' ? 'selected' : '' ?>>Ativo</option>
                                    <option value="inativo" <?= $status_filtro == 'inativo' ? 'selected' : '' ?>>Inativo</option>
                                    <option value="quitado" <?= $status_filtro == 'quitado' ? 'selected' : '' ?>>Quitado</option>
                                </select></div>

                            <div class="col-md-3 d-flex gap-2 flex-wrap">
                                <button class="btn btn-primary" type="submit">
                                    <i class="fas fa-search"></i> Filtrar
                                </button>

                                <button class="btn btn-success" type="submit" formaction="exportar_parcelamentos_csv.php">
                                    <i class="fas fa-file-excel"></i> Excel
                                </button>

                                <a href="tabela_parcelamento.php" class="btn btn-outline-secondary" title="Limpar Filtros">
                                    <i class="fas fa-times"></i>
                                </a>

                                <button type="button" class="btn btn-info" id="btnAbrirModalCertificados" style="background-color: #6c757d; color: white; border:none;" title="Info Certificados">
                                    <i class="fas fa-id-card"></i>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        <div id="column-filter-dropdown"></div>

        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <?php $col_idx = 0;
                        if ($pode_editar_geral): ?><th class="col-acoes col-sticky col-idx-<?= $col_idx++ ?>">Ações</th><?php endif; ?>
                        <th class="sortable col-codigo col-sticky col-idx-<?= $col_idx++ ?>" data-coluna="codigo_empresa">Código <i class="fas fa-sort"></i><i class="fas fa-filter column-filter-icon"></i></th>
                        <th class="sortable col-empresa col-sticky col-idx-<?= $col_idx++ ?>" data-coluna="nome_empresa">Empresa <i class="fas fa-sort"></i><i class="fas fa-filter column-filter-icon"></i></th>
                        <th class="col-cnpj col-sticky col-idx-<?= $col_idx++ ?>">CNPJ <i class="fas fa-filter column-filter-icon"></i></th>
                        <th class="col-parcelamento col-sticky col-idx-<?= $col_idx++ ?>">Parcelamento <i class="fas fa-filter column-filter-icon"></i></th>
                        <th class="sortable col-valor col-sticky col-idx-<?= $col_idx++ ?>" data-coluna="valor">Valor <i class="fas fa-sort"></i><i class="fas fa-filter column-filter-icon"></i></th>
                        <th class="sortable col-status col-sticky col-idx-<?= $col_idx++ ?> ultima-coluna-fixa" data-coluna="status">Status <i class="fas fa-sort"></i><i class="fas fa-filter column-filter-icon"></i></th>

                        <th class="col-qtde">Qtde. <i class="fas fa-filter column-filter-icon"></i></th>
                        <th class="col-inicio">Início <i class="fas fa-filter column-filter-icon"></i></th>
                        <th class="col-fim">Fim <i class="fas fa-filter column-filter-icon"></i></th>
                        <th class="col-detalhes text-center">Parcelas</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($parcelamentos)): ?>
                        <tr>
                            <td colspan="<?= $pode_editar_geral ? 22 : 21 ?>" class="text-center p-4">Nenhum parcelamento encontrado para o ano de <?= $ano_selecionado ?>.</td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($parcelamentos as $p): ?>
                            <?php
                            $ano_inicio = (int)date('Y', strtotime($p['data_efetivacao']));
                            $mes_inicio = (int)date('n', strtotime($p['data_efetivacao']));
                            $ano_fim = $p['data_final'] ? (int)date('Y', strtotime($p['data_final'])) : 9999;
                            $mes_fim = $p['data_final'] ? (int)date('n', strtotime($p['data_final'])) : 12;
                            ?>
                            <tr>
                                <?php $col_idx = 0;
                                if ($pode_editar_geral): ?>
                                    <td class="actions-cell col-acoes col-sticky col-idx-<?= $col_idx++ ?>">
                                        <a href="editar_parcelamento.php?id=<?= $p['id'] ?>" class="btn btn-sm btn-warning" title="Editar"><i class="fas fa-edit"></i></a>
                                        <a href="#" class="btn btn-sm btn-danger <?= $pode_excluir ? 'btn-excluir' : 'btn-excluir-disabled' ?>"
                                            title="<?= $pode_excluir ? 'Excluir Parcelamento' : 'Exclusão não permitida' ?>"
                                            data-id="<?= $p['id'] ?>"
                                            data-codigo="<?= htmlspecialchars($p['codigo_empresa']) ?>"
                                            data-parcelamento="<?= htmlspecialchars($p['parcelamento']) ?>">
                                            <i class="fas fa-trash-alt"></i>
                                        </a>
                                    </td>
                                <?php endif; ?>
                                <td class="col-codigo col-sticky col-idx-<?= $col_idx++ ?>"><?= htmlspecialchars($p['codigo_empresa']) ?></td>
                                <td class="col-empresa col-sticky col-idx-<?= $col_idx++ ?>"><?= htmlspecialchars($p['nome_empresa']) ?></td>
                                <td class="col-cnpj col-sticky col-idx-<?= $col_idx++ ?>"><?= htmlspecialchars($p['cnpj_empresa']) ?></td>
                                <td class="col-parcelamento col-sticky col-idx-<?= $col_idx++ ?>"><?= htmlspecialchars($p['parcelamento']) ?></td>
                                <td class="col-valor col-sticky col-idx-<?= $col_idx++ ?>">R$ <?= number_format($p['valor'], 2, ',', '.') ?></td>
                                <td class="col-status col-sticky col-idx-<?= $col_idx++ ?> ultima-coluna-fixa"><span class="badge bg-<?= $p['status'] == 'ativo' ? 'success' : ($p['status'] == 'quitado' ? 'primary' : 'secondary') ?>"><?= ucfirst($p['status']) ?></span></td>

                                <td class="col-qtde"><?= htmlspecialchars($p['qtde_parcelas']) ?></td>
                                <td class="col-inicio"><?= date('d/m/y', strtotime($p['data_efetivacao'])) ?></td>
                                <td class="col-fim"><?= $p['data_final'] ? date('d/m/y', strtotime($p['data_final'])) : 'Indefinido' ?></td>

                                <td class="col-detalhes text-center">
                                    <button class="btn btn-primary btn-sm btn-ver-meses" 
                                            data-empresa="<?= htmlspecialchars($p['nome_empresa']) ?>" 
                                            type="button">
                                            <i class="fas fa-list"></i> Ver Meses
                                    </button>
                                    <div class="meses-container d-none">
                                        <div class="list-group">
                                        <?php foreach ($meses as $index => $mes): ?>
                                            <?php
                                            $mes_num = $index + 1;
                                            $is_na = false;
                                            if ($ano_selecionado < $ano_inicio || ($ano_selecionado == $ano_inicio && $mes_num < $mes_inicio)) $is_na = true;
                                            if ($p['data_final'] && ($ano_selecionado > $ano_fim || ($ano_selecionado == $ano_fim && $mes_num > $mes_fim))) $is_na = true;
                                            if ($p['status'] != 'ativo' && $p['status'] != 'quitado') $is_na = true;
                                            elseif ($p['status'] == 'quitado' && ($ano_selecionado > $ano_fim || ($ano_selecionado == $ano_fim && $mes_num > $mes_fim))) $is_na = true;
                                            ?>
                                            <div class="list-group-item d-flex justify-content-between align-items-center p-2">
                                                <strong><?= ucfirst($mes) ?></strong>
                                                <?php
                                                if ($is_na) {
                                                    echo '<span class="badge bg-secondary">N/A</span>';
                                                } elseif ($pode_editar_celulas) {
                                                    $val = htmlspecialchars($p[$mes] ?? '');
                                                    $valLC = strtolower(trim($val));
                                                    
                                                    $isPendente = ($valLC === 'pendente');
                                                    $isAtrasado = ($valLC === 'atrasado');
                                                    $isEntregue = (strpos($valLC, 'entregue') === 0 || strpos($valLC, 'pago') === 0);
                                                    
                                                    $displayEntregue = 'Entregue';
                                                    if ($isEntregue) {
                                                        $displayEntregue = str_ireplace('pago', 'Entregue', $val);
                                                    }
                                                    
                                                    $selPendente = $isPendente ? 'selected' : '';
                                                    $selEntregue = $isEntregue ? 'selected' : '';
                                                    $selAtrasado = $isAtrasado ? 'selected' : '';
                                                    $selOutro = (!$isPendente && !$isEntregue && !$isAtrasado && $val !== '') ? 'selected' : '';
                                                    
                                                    echo '<div class="celula-editavel-modal" data-id="' . $p['id'] . '" data-coluna="' . $mes . '" style="transition: background-color 0.3s; padding: 2px; border-radius: 4px;">';
                                                    echo '<select class="form-select select-parcelamento-modal form-select-sm" style="min-width: 130px; cursor: pointer; margin-bottom: 5px;">';
                                                    echo '<option value="" ' . ($val === '' ? 'selected' : '') . '></option>';
                                                    echo '<option value="Pendente" ' . $selPendente . '>Pendente</option>';
                                                    echo '<option value="Entregue" ' . $selEntregue . '>' . ($isEntregue ? $displayEntregue : 'Entregue') . '</option>';
                                                    echo '<option value="Atrasado" ' . $selAtrasado . '>Atrasado</option>';
                                                    if ($selOutro) {
                                                        echo '<option value="' . $val . '" selected>' . $val . '</option>';
                                                    }
                                                    echo '</select>';
                                                    echo '<input type="date" class="form-control date-entregue-modal form-control-sm d-none" style="min-width: 130px;">';
                                                    echo '</div>';
                                                } else {
                                                    $val = htmlspecialchars($p[$mes] ?? '');
                                                    $displayVal = str_ireplace('pago', 'Entregue', $val);
                                                    echo '<span>' . $displayVal . '</span>';
                                                }
                                                ?>
                                            </div>
                                        <?php endforeach; ?>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>

    <div id="customModal" class="modal-overlay">
        <div class="modal-container">
            <div class="modal-header">
                <h5 class="modal-title" id="modalTitle">Atenção</h5>
                <button type="button" class="modal-close" id="modalClose">&times;</button>
            </div>
            <div class="modal-body">
                <p id="modalMessage">Mensagem aqui.</p>
            </div>
            <div class="modal-footer" style="padding: 1rem; border-top: 1px solid var(--border-color); text-align: right;">
                <button type="button" class="btn btn-secondary" id="modalCancel">Cancelar</button>
                <button type="button" class="btn btn-danger" id="modalConfirm">Confirmar</button>
            </div>
        </div>
    </div>

    <!-- NOVO MODAL VERTICAL DE MESES -->
    <div id="modalMeses" class="modal-overlay">
        <div class="modal-container" style="max-width: 450px;">
            <div class="modal-header">
                <h5 class="modal-title">Parcelas - <span id="modalMesesEmpresa"></span></h5>
                <button type="button" class="modal-close" id="modalMesesClose">&times;</button>
            </div>
            <div class="modal-body" id="modalMesesBody" style="max-height: 60vh; overflow-y: auto; padding: 1rem;">
            </div>
            <div class="modal-footer" style="padding: 1rem; border-top: 1px solid var(--border-color); text-align: right;">
                <button type="button" class="btn btn-secondary" id="modalMesesBtnClose">Fechar</button>
            </div>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {

            // --- 1. SETUP DOS NOVOS MODAIS (CERTIFICADOS) ---
            setupNovosModais();
            setupModalSearchBars();

            // --- 2. SETUP DOS MODAIS ORIGINAIS (EXCLUSÃO) ---
            setupModalExclusao();

            // --- 3. SETUP DAS COLUNAS FIXAS ---
            setupFixedColumns();
            window.addEventListener('resize', setupFixedColumns); // Recalcula no resize
            document.querySelector('.table-container').addEventListener('scroll', setupFixedColumns); // Recalcula no scroll

            // --- 4. SETUP DOS FILTROS DE CABEÇALHO ---
            setupTableFiltering();

            // --- 5. LÓGICA DE ORDENAÇÃO (Seu original) ---
            const urlParams = new URLSearchParams(window.location.search);
            const ordenarPorAtual = urlParams.get('ordenar_por') || 'codigo_empresa';
            const ordemAtual = urlParams.get('ordem') || 'ASC';
            document.querySelectorAll('.sortable').forEach(header => {
                const coluna = header.dataset.coluna;
                if (coluna === ordenarPorAtual) {
                    const icon = document.createElement('i');
                    icon.className = `fas fa-chevron-${ordemAtual.toLowerCase() === 'asc' ? 'up' : 'down'}`;
                    icon.style.marginLeft = '5px';
                    header.appendChild(icon);
                }
                header.addEventListener('click', function(e) {
                    if (e.target.classList.contains('column-filter-icon')) return; // Não ordena no filtro
                    let novaOrdem = 'ASC';
                    if (coluna === ordenarPorAtual && ordemAtual === 'ASC') novaOrdem = 'DESC';
                    urlParams.set('ordenar_por', coluna);
                    urlParams.set('ordem', novaOrdem);
                    window.location.search = urlParams.toString();
                });
            });

            // =======================================================
            // == DELEGAÇÃO DE EVENTOS PARA MODAL DE MESES ==
            // =======================================================

            let currentMesesContainer = null;
            document.addEventListener('click', function(e) {
                const btn = e.target.closest('.btn-ver-meses');
                if (btn) {
                    const container = btn.nextElementSibling; // div.meses-container
                    currentMesesContainer = container;
                    const empresa = btn.dataset.empresa;
                    document.getElementById('modalMesesEmpresa').innerText = empresa;
                    
                    const modalBody = document.getElementById('modalMesesBody');
                    modalBody.innerHTML = '';
                    if(container.firstElementChild) {
                        modalBody.appendChild(container.firstElementChild); 
                    }
                    
                    const modal = document.getElementById('modalMeses');
                    modal.classList.add('active');
                    document.body.style.overflow = 'hidden';
                }
            });

            function closeMesesModal() {
                const modal = document.getElementById('modalMeses');
                modal.classList.remove('active');
                document.body.style.overflow = '';
                if (currentMesesContainer) {
                    const modalBody = document.getElementById('modalMesesBody');
                    if (modalBody.firstElementChild) {
                        currentMesesContainer.appendChild(modalBody.firstElementChild);
                    }
                    currentMesesContainer = null;
                }
            }

            document.querySelectorAll('#modalMesesClose, #modalMesesBtnClose').forEach(btn => {
                btn.addEventListener('click', closeMesesModal);
            });

            // Lida com a escolha do Dropdown
            document.addEventListener('change', function(e) {
                if (e.target.matches('.select-parcelamento-modal')) {
                    const selectElement = e.target;
                    const wrapper = selectElement.closest('.celula-editavel-modal');
                    const dateInput = wrapper.querySelector('.date-entregue-modal');
                    
                    let valor = selectElement.value;
                    
                    // Se escolheu Entregue, mostra o campo de data e não salva ainda
                    if (valor === 'Entregue') {
                        dateInput.classList.remove('d-none');
                        // Preenche com data de hoje se estiver vazio
                        if (!dateInput.value) {
                            const hoje = new Date();
                            const yyyy = hoje.getFullYear();
                            const mm = String(hoje.getMonth() + 1).padStart(2, '0');
                            const dd = String(hoje.getDate()).padStart(2, '0');
                            dateInput.value = `${yyyy}-${mm}-${dd}`;
                        }
                        dateInput.focus();
                        return; // Só salva quando confirmar a data
                    } else {
                        dateInput.classList.add('d-none');
                    }
                    
                    salvarParcela(wrapper, valor);
                }
                
                // Lida com a escolha da Data
                if (e.target.matches('.date-entregue-modal')) {
                    const dateInput = e.target;
                    const wrapper = dateInput.closest('.celula-editavel-modal');
                    const selectElement = wrapper.querySelector('.select-parcelamento-modal');
                    
                    if (dateInput.value) {
                        // Formata a data de YYYY-MM-DD para DD/MM
                        const parts = dateInput.value.split('-');
                        const dataFormatada = `${parts[2]}/${parts[1]}`;
                        const valorFinal = `Entregue (${dataFormatada})`;
                        
                        // Atualiza a opção no select para mostrar a data
                        const optionEntregue = Array.from(selectElement.options).find(opt => opt.value === 'Entregue' || opt.value.startsWith('Entregue'));
                        if (optionEntregue) {
                            optionEntregue.text = valorFinal;
                            optionEntregue.value = valorFinal;
                        }
                        
                        salvarParcela(wrapper, valorFinal);
                    }
                }
            });

            function salvarParcela(wrapper, valor) {
                const id = wrapper.dataset.id;
                const coluna = wrapper.dataset.coluna;
                
                const originalBg = wrapper.style.backgroundColor;
                wrapper.style.backgroundColor = '#fff3cd'; // amarelo salvando
                
                const formData = new FormData();
                formData.append('id', id);
                formData.append('coluna', coluna);
                formData.append('valor', valor);
                
                fetch('salvar_parcela.php', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            wrapper.style.backgroundColor = '#d1e7dd'; // verde sucesso
                            setTimeout(() => wrapper.style.backgroundColor = originalBg, 2000);
                        } else {
                            alert('Erro ao salvar: ' + data.message);
                            wrapper.style.backgroundColor = '#f8d7da'; // vermelho erro
                        }
                    }).catch(error => {
                        alert('Erro de conexão ao salvar.');
                        wrapper.style.backgroundColor = '#f8d7da'; 
                    });
            }


            // =======================================================
            // == FUNÇÕES HELPERS (DEFINIDAS DENTRO DO DOMContentLoaded) ==
            // =======================================================

            function setupModalSearchBars() {
                const searchInput = document.getElementById('searchCertificadosInput');
                const table = document.getElementById('tableCertificados');
                if (!searchInput || !table) return;
                const rows = table.querySelectorAll('tbody tr');

                searchInput.addEventListener('keyup', function() {
                    const termo = this.value.toLowerCase();
                    rows.forEach(row => {
                        const textoLinha = row.textContent.toLowerCase();
                        row.style.display = textoLinha.includes(termo) ? '' : 'none';
                    });
                });
            }

            function setupNovosModais() {
                const modais = {
                    'btnCertificadosVencendo': 'modalCertificadosVencendo',
                    'btnProcuracoesVencendo': 'modalProcuracoesVencendo',
                    'btnAbrirModalCertificados': 'modalCertificados'
                };
                Object.keys(modais).forEach(botaoId => {
                    const botao = document.getElementById(botaoId);
                    if (botao) {
                        botao.addEventListener('click', () => {
                            const modal = document.getElementById(modais[botaoId]);
                            if (modal) {
                                modal.classList.add('active');
                                document.body.style.overflow = 'hidden';
                            }
                        });
                    }
                });
                // Listeners de fechar SÓ para os novos modais
                document.querySelectorAll('#modalCertificados .modal-close, #modalCertificadosVencendo .modal-close, #modalProcuracoesVencendo .modal-close').forEach(btn => {
                    btn.addEventListener('click', function() {
                        this.closest('.modal-overlay').classList.remove('active');
                        if (!document.querySelector('.modal-overlay.active')) {
                            document.body.style.overflow = '';
                        }
                    });
                });
                document.querySelectorAll('#modalCertificados, #modalCertificadosVencendo, #modalProcuracoesVencendo').forEach(modal => {
                    modal.addEventListener('click', function(e) {
                        if (e.target === this) {
                            this.classList.remove('active');
                            if (!document.querySelector('.modal-overlay.active')) {
                                document.body.style.overflow = '';
                            }
                        }
                    });
                });
            }

            function setupModalExclusao() {
                const modal = document.getElementById('customModal');
                if (!modal) return;
                const modalTitle = document.getElementById('modalTitle');
                const modalMessage = document.getElementById('modalMessage');
                const modalConfirm = document.getElementById('modalConfirm');
                const modalCancel = document.getElementById('modalCancel');
                const modalClose = document.getElementById('modalClose');

                function closeModal() {
                    modal.classList.remove('active');
                    if (!document.querySelector('.modal-overlay.active')) {
                        document.body.style.overflow = '';
                    }
                }

                document.addEventListener('click', function(e) {
                    const target = e.target.closest('.btn-excluir, .btn-excluir-disabled');
                    if (!target) return;
                    e.preventDefault();

                    if (target.classList.contains('btn-excluir-disabled')) {
                        modalTitle.innerText = 'Acesso Negado';
                        modalMessage.innerText = 'Você não tem permissão para excluir parcelamentos.';
                        modalConfirm.style.display = 'none';
                        modalCancel.innerText = 'Fechar';
                        modal.classList.add('active');
                        document.body.style.overflow = 'hidden';
                        return;
                    }
                    if (target.classList.contains('btn-excluir')) {
                        const id = target.dataset.id;
                        const codigo = target.dataset.codigo;
                        const parcelamento = target.dataset.parcelamento;
                        modalTitle.innerText = 'Confirmar Exclusão';
                        modalMessage.innerHTML = `Tem certeza que deseja excluir <strong>TODOS</strong> os registros deste parcelamento?<br><small>${parcelamento} - Cód: ${codigo}</small>`;
                        modalConfirm.style.display = 'inline-block';
                        modalCancel.innerText = 'Cancelar';
                        modal.classList.add('active');
                        document.body.style.overflow = 'hidden';
                        modalConfirm.onclick = function() {
                            window.location.href = `excluir_parcelamento.php?id=${id}`;
                        };
                    }
                });
                modalCancel.addEventListener('click', closeModal);
                modalClose.addEventListener('click', closeModal);
                modal.addEventListener('click', function(e) {
                    if (e.target === this) {
                        closeModal();
                    }
                });
            }

            // Função para calcular e aplicar colunas fixas
            function setupFixedColumns() {
                const table = document.querySelector('.data-table');
                if (!table) return;

                const rows = table.querySelectorAll('tr');
                // ATUALIZADO: Trava 7 colunas se Ações existe, 6 se não.
                // (Ações, Código, Empresa, CNPJ, Parcelamento, Valor, Status)
                const numColunasFixas = <?php echo $pode_editar_geral ? 7 : 6; ?>;

                rows.forEach(row => {
                    let offsetLeft = 0;
                    const cells = row.children;

                    for (let i = 0; i < cells.length; i++) {
                        const cell = cells[i];
                        if (i < numColunasFixas) {
                            cell.classList.add('col-sticky');
                            cell.style.left = `${offsetLeft}px`;

                            // Adiciona a borda apenas na última coluna fixa
                            if (i === numColunasFixas - 1) {
                                cell.classList.add('ultima-coluna-fixa');
                            } else {
                                cell.classList.remove('ultima-coluna-fixa');
                            }
                            offsetLeft += cell.offsetWidth; // Acumula a largura
                        } else {
                            // Garante que colunas não-fixas não tenham as classes
                            cell.classList.remove('col-sticky');
                            cell.classList.remove('ultima-coluna-fixa');
                            cell.style.left = '';
                        }
                    }
                });
            }

            // Função para os filtros do cabeçalho
            function setupTableFiltering() {
                const table = document.querySelector('.data-table');
                if (!table) return;
                const headers = table.querySelectorAll('thead th');
                const tbody = table.querySelector('tbody');
                let activeFilterMenu = null;
                const activeFilters = {};

                headers.forEach((header, colIndex) => {
                    const filterIcon = header.querySelector('.column-filter-icon');
                    if (!filterIcon) return;
                    activeFilters[colIndex] = new Set();

                    filterIcon.addEventListener('click', (event) => {
                        event.stopPropagation();
                        if (activeFilterMenu) activeFilterMenu.remove();

                        const filterMenu = createFilterMenu(colIndex, tbody, headers, activeFilters);
                        const iconRect = filterIcon.getBoundingClientRect();
                        let leftPosition = iconRect.left + window.scrollX;
                        if (leftPosition + 200 > window.innerWidth) { // 200px = largura menu
                            leftPosition = iconRect.right + window.scrollX - 200;
                        }
                        filterMenu.style.left = `${leftPosition}px`;
                        filterMenu.style.top = `${iconRect.bottom + window.scrollY + 5}px`;

                        document.body.appendChild(filterMenu);
                        filterMenu.style.display = 'block';
                        activeFilterMenu = filterMenu;
                    });
                });

                document.addEventListener('click', () => {
                    if (activeFilterMenu) {
                        activeFilterMenu.remove();
                        activeFilterMenu = null;
                    }
                });

                function createFilterMenu(colIndex, tbody, headers, activeFilters) {
                    const menu = document.createElement('div');
                    menu.id = 'column-filter-dropdown';
                    menu.addEventListener('click', e => e.stopPropagation());

                    const uniqueValues = new Set();
                    Array.from(tbody.querySelectorAll('tr')).forEach(row => {
                        if (row.style.display === 'none') return;

                        const cell = row.querySelector(`td:nth-child(${colIndex + 1})`);
                        if (cell) {
                            const cellValue = cell.textContent.trim();
                            if (cellValue === "") uniqueValues.add('(Vazias)');
                            else if (cellValue) uniqueValues.add(cellValue);
                        }
                    });

                    const sortedValues = Array.from(uniqueValues).sort((a, b) => a.localeCompare(b, 'pt-BR'));
                    let optionsHTML = '<ul class="filter-menu-list">';
                    sortedValues.forEach(value => {
                        const isChecked = activeFilters[colIndex].size === 0 || activeFilters[colIndex].has(value);
                        const escapedValue = value.replace(/"/g, '&quot;');
                        optionsHTML += `<li><label><input type="checkbox" class="filter-option" value="${escapedValue}" ${isChecked ? 'checked' : ''}> ${value || '(Vazio)'}</label></li>`;
                    });
                    optionsHTML += '</ul>';
                    const buttonsHTML = `<div class="filter-menu-buttons"><button class="btn btn-primary btn-sm apply-btn">Aplicar</button><button class="btn btn-secondary btn-sm clear-btn">Limpar</button></div>`;
                    menu.innerHTML = optionsHTML + buttonsHTML;

                    menu.querySelector('.apply-btn').addEventListener('click', () => {
                        const selectedValues = new Set();
                        menu.querySelectorAll('.filter-option:checked').forEach(cb => selectedValues.add(cb.value));
                        if (selectedValues.size === sortedValues.length || selectedValues.size === 0) {
                            activeFilters[colIndex].clear();
                            headers[colIndex].querySelector('.column-filter-icon').classList.remove('filter-active');
                        } else {
                            activeFilters[colIndex] = selectedValues;
                            headers[colIndex].querySelector('.column-filter-icon').classList.add('filter-active');
                        }
                        applyAllFilters(tbody, activeFilters);
                        menu.remove();
                        activeFilterMenu = null;
                    });
                    menu.querySelector('.clear-btn').addEventListener('click', () => {
                        activeFilters[colIndex].clear();
                        headers[colIndex].querySelector('.column-filter-icon').classList.remove('filter-active');
                        applyAllFilters(tbody, activeFilters);
                        menu.remove();
                        activeFilterMenu = null;
                    });
                    return menu;
                }

                function applyAllFilters(tbody, activeFilters) {
                    Array.from(tbody.querySelectorAll('tr')).forEach(row => {
                        let isVisible = true;
                        for (const colIndex in activeFilters) {
                            const allowedValues = activeFilters[colIndex];
                            if (allowedValues.size === 0) continue;

                            const cell = row.querySelector(`td:nth-child(${parseInt(colIndex) + 1})`);
                            let cellValue = cell ? cell.textContent.trim() : '';
                            if (cellValue === '') cellValue = '(Vazias)';

                            if (!allowedValues.has(cellValue)) {
                                isVisible = false;
                                break;
                            }
                        }
                        row.style.display = isVisible ? '' : 'none';
                    });
                    setupFixedColumns(); // Recalcula colunas
                }
            } // Fim de setupTableFiltering

        }); // --- FIM DO DOMContentLoaded ---
    </script>
</body>

</html>