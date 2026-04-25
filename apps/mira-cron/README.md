# mira-cron · service Easypanel separado

Container alpine + crond + curl que dispara os 11 cron route handlers da Mira.

## Por que existe

A versão do Easypanel em uso não expõe **Cron Jobs schedulaveis** nativamente
(só "Scripts" on-demand). Esta imagem cobre essa lacuna · roda como service
separado no mesmo project `clinicai`.

## Setup no Easypanel

```
Project: clinicai
Service: mira-cron
Type: App
Source: Git → AldenQuesada/clinicai-v2 @ main
Build: Dockerfile · path = apps/mira-cron/Dockerfile
Domains: nenhum (não expõe HTTP)
Env vars:
  MIRA_CRON_SECRET=<mesmo valor do service mira>
  MIRA_TARGET_BASE=http://mira:3006   (DNS interno · fallback abaixo)
```

`http://mira:3006` resolve via DNS interno do Docker network do Easypanel
(services do mesmo project se enxergam pelo nome). Se em algum ambiente
isso não funcionar, sobrescrever:

```
MIRA_TARGET_BASE=https://mira.miriandpaula.com.br
```

(usa domínio público · adiciona round-trip externo mas funciona em qualquer rede.)

## Validação

Logs do container devem mostrar a cada minuto:
```
[mira-cron] crontab montado · target=http://mira:3006
[mira-cron] crond iniciando em foreground · logs streaming
```

E os disparos:
```
* * * * *  → mira-state-cleanup (200 OK)
* * * * *  → mira-state-reminder-check (200 OK)
```

## Schedule

Timezone do container: `America/Sao_Paulo` (set no Dockerfile).

| Schedule | Job | Função |
|---|---|---|
| `* * * * *` | mira-state-cleanup | limpa states expirados |
| `* * * * *` | mira-state-reminder-check | reminder pré-expiry voucher |
| `0 10 * * 1-6` | mira-daily-digest | digest manhã admin |
| `0 23 * * 1-6` | mira-evening-digest | digest noite admin |
| `0 10 * * 1` | mira-weekly-roundup | roundup segunda |
| `*/5 11-23 * * 1-6` | mira-preconsult-alerts | alerta 30min antes consulta |
| `0 1 * * *` | mira-anomaly-check | detecção de anomalias |
| `0 10 * * *` | mira-birthday-alerts | aniversariantes do dia |
| `*/5 * * * *` | mira-task-reminders | tarefas vencidas |
| `0 12 * * *` | mira-followup-suggestions | suggestions Haiku |
| `0 21 * * 5` | mira-inactivity-radar | pacientes sem atividade |
