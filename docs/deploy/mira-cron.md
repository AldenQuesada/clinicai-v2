# Deploy · mira-cron (Easypanel)

Service que dispara os endpoints `/api/cron/*` do mira web em schedule fixo.
Rodando como container separado pra isolar falhas: se o web crashar, o
scheduler nao morre junto · e vice-versa.

## Por que existe

A versao do Easypanel em uso nao expoe **Cron Jobs schedulaveis nativamente**
(so "Scripts" on-demand). Resolvemos com um service dedicado que faz o papel
de scheduler:

```
GitHub Actions (fallback redundante · 1-3min lag)
        |                                       \
        v                                        v
                                            mira-cron service (Easypanel · este doc)
                                                 |
                                                 v
                                            mira web service (Next.js · porta 3006)
                                                 |
                                                 v
                                            handlers /api/cron/*
```

Ambos disparadores apontam pros mesmos endpoints. Os handlers sao
idempotentes (state cleanup checa expiry, dispatch usa `issueWithDedup`,
etc.) entao disparo duplicado nao causa side effects · so log noise.

## Arquitetura · 2 implementacoes coexistem

Ha duas formas de rodar este service · ambas presentes no repo:

### A) `apps/mira/Dockerfile.cron` (recomendado · canonico)

Node 20-alpine + node-cron. Compilacao via esbuild · bundle unico em
`dist/cron.js`. Logs estruturados em stdout. Mirror estrutural do
Dockerfile do mira web (mesma base, mesmo pnpm, mesmo turbo prune).

**Quando usar:** sempre · este e o padrao oficial.

### B) `apps/mira-cron/` (legado · alpine + crond + curl)

Container alpine puro com `crond` + `curl` + `envsubst`. Funciona
igualmente bem, sem dependencias Node. Ainda no repo como fallback de
infra (caso build Node falhe por algum motivo).

**Quando usar:** so se A falhar e for urgencia. Migrar de volta pra A
assim que possivel.

## Setup no Easypanel · opcao A (canonico)

```
Project: clinicai
Service: mira-cron
Type: App (background · sem domain mapping)
Source: Git → AldenQuesada/clinicai-v2 @ main
Build:
  Type: Dockerfile
  Path: apps/mira/Dockerfile.cron
  Build context: . (root do repo · turbo prune precisa do workspace inteiro)
Domains: nenhum (nao expoe HTTP)
Resources: 256MB RAM / 0.25 vCPU (suficiente · processo so faz fetch)
Restart policy: always
```

### Env vars obrigatorias

```
MIRA_CRON_SECRET=<mesmo valor do service mira>
MIRA_INTERNAL_URL=http://mira:3006
```

`http://mira:3006` resolve via DNS interno do Docker network do Easypanel
(services do mesmo project se enxergam pelo nome). Se em algum ambiente
isso nao funcionar (network policy, project diferente), sobrescrever:

```
MIRA_INTERNAL_URL=https://mira.miriandpaula.com.br
```

(usa dominio publico · adiciona round-trip externo mas funciona em qualquer
rede.)

### Env vars opcionais

```
MIRA_CRON_TZ=America/Sao_Paulo   # default · alinha com horarios humanos
MIRA_CRON_TIMEOUT_MS=60000       # default 60s · timeout fetch por endpoint
```

## Verificar saude

Logs do container devem mostrar no boot:

```
[cron] startup · base=http://mira:3006 tz=America/Sao_Paulo timeout=60000ms
[cron] agendado · "* * * * *" · cada-minuto · state cleanup + reminder + ...
[cron] agendado · "0 10 * * 1-6" · daily-digest · 10h SP seg-sab
[cron] agendado · "0 23 * * 1-6" · evening-digest · 23h SP seg-sab
... (11 jobs no total)
[cron] ready · 11 jobs ativos · aguardando schedule
```

E a cada disparo:

```
[cron] 14:23:00 mira-state-cleanup -> 200 · {"ok":true,"deleted":3}
[cron] 14:23:00 mira-state-reminder-check -> 200 · {"ok":true,"sent":0}
[cron] 14:23:00 b2b-voucher-dispatch-worker -> 200 · {"ok":true,"processed":0}
[cron] 14:23:00 webhook-processing-worker -> 200 · {"ok":true,"processed":0}
```

### Sinais de problema

| Sintoma | Causa provavel | Fix |
|---|---|---|
| `[cron] ... -> 401` | MIRA_CRON_SECRET diferente entre cron e web | Conferir env vars dos dois services |
| `[cron] ... -> ERROR fetch failed` | DNS interno nao resolvendo `mira:3006` | Trocar pra URL publica HTTPS |
| `[cron] ... -> 503` | mira web down ou em deploy | Aguardar deploy · cron tenta de novo |
| `[cron] FATAL · env MIRA_CRON_SECRET nao setada` | Env nao injetada no service | Adicionar env var + redeploy |
| Container reinicia em loop | Healthcheck falhando · pgrep nao encontra processo | Verificar se `dist/cron.js` foi gerado no build |

## Schedule canonico

Timezone: `America/Sao_Paulo` (set via `TZ` no Dockerfile + node-cron timezone).

| Schedule | Endpoints | Funcao |
|---|---|---|
| `* * * * *` | mira-state-cleanup, mira-state-reminder-check, b2b-voucher-dispatch-worker, webhook-processing-worker | maintenance + queues |
| `*/5 * * * *` | mira-task-reminders | tarefas vencidas |
| `*/5 11-23 * * 1-6` | mira-preconsult-alerts | alerta 30min antes consulta |
| `0 1 * * *` | mira-anomaly-check | deteccao de anomalias |
| `0 10 * * *` | mira-birthday-alerts | aniversariantes do dia |
| `0 12 * * *` | mira-followup-suggestions | suggestions Haiku |
| `0 10 * * 1-6` | mira-daily-digest | digest manha admin |
| `0 23 * * 1-6` | mira-evening-digest | digest noite admin |
| `0 10 * * 1` | mira-weekly-roundup | roundup segunda |
| `0 21 * * 5` | mira-inactivity-radar | pacientes sem atividade |
| `0 * * * *` | lara-voucher-followup | voucher follow-up Lara |

Total: 11 schedules · 14 endpoints distintos.

## Fallback redundante · GitHub Actions

`.github/workflows/mira-crons.yml` mantem o **mesmo schedule** chamando
os mesmos endpoints. Nao desativar · serve como fallback se o service
mira-cron cair entre deploys ou tiver bug:

- GitHub Actions: 1-3min lag tipico, sem custo, logs auditaveis em
  `github.com/AldenQuesada/clinicai-v2/actions`.
- mira-cron service: lag ~0s, mas depende do container estar UP.

Os handlers sao idempotentes · disparo duplicado e seguro.

Se um dia for desejavel desativar o GitHub Actions (ex: pra reduzir
ruido em logs), comentar a `schedule:` no workflow mas manter o
`workflow_dispatch:` pra trigger manual em emergencia.

## Build local (debug)

```bash
# Compila o bundle
pnpm --filter @clinicai/mira build:cron

# Roda local com web em :3006
MIRA_CRON_SECRET=dev-secret \
MIRA_INTERNAL_URL=http://localhost:3006 \
pnpm --filter @clinicai/mira cron
```

## Deploy

Alden faz manualmente via Easypanel · este doc nao automatiza deploy.
Apos push em main, Easypanel detecta o novo commit e rebuilda o service
mira-cron automaticamente (se configurado com auto-deploy).

Se for o primeiro deploy do service:

1. Easypanel UI → Project `clinicai` → New Service → App
2. Source: Git · branch `main` · Dockerfile path = `apps/mira/Dockerfile.cron`
3. Adicionar env vars (MIRA_CRON_SECRET + MIRA_INTERNAL_URL)
4. Sem domain (nao expoe HTTP)
5. Deploy · acompanhar logs do build (~3-5min · turbo prune + pnpm install)
6. Quando subir, verificar logs do container · esperar ver `[cron] ready`
