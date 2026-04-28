# Flipbook Commerce — Deploy & Smoke Test

Funil de venda end-to-end: BookCarousel → BookPreviewModal → BuyModal → Asaas → Webhook → Grant → Lara WhatsApp → Token gate.

Fases 1-16 estão **commitadas e em produção (código)**. Esta nota cobre os passos
manuais que dependem de você (credenciais e config externas) pra ativar tudo.

---

## 1. Env vars (.env.local + Easypanel)

Adicionar em `apps/flipbook/.env.local` (dev) **E no painel Easypanel** (prod):

```bash
# ASAAS · gateway de pagamento
ASAAS_API_KEY=$aact_test_XXXXXXXXX...                # sandbox primeiro
ASAAS_API_BASE_URL=https://api-sandbox.asaas.com/v3  # prod: https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=<gerar_string_random_24+_chars>  # você define · Asaas vai mandar este token em cada webhook

# Flipbook public URL (pra montar access_link no WhatsApp)
FLIPBOOK_PUBLIC_BASE_URL=https://flipbook.aldenquesada.org   # ajustar pro domínio real
```

> Já existem (não mexer): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_MIRA_INSTANCE`.

Para a **edge function de dispatch**, adicionar via:
```bash
supabase secrets set ASAAS_WEBHOOK_TOKEN=<mesmo_valor> FLIPBOOK_PUBLIC_BASE_URL=https://flipbook.aldenquesada.org
```

---

## 2. Deploy das edge functions

```bash
cd C:/Users/Dr.Quesada/Documents/clinicai-v2
supabase functions deploy flipbook-dispatch-purchase --no-verify-jwt
supabase functions deploy flipbook-sequences-tick --no-verify-jwt
```

`--no-verify-jwt` pra que o webhook do Next.js consiga invocar com SERVICE_ROLE_KEY no header Authorization (não JWT do Supabase auth).

---

## 3. Cron para `flipbook-sequences-tick` (15min)

Roda 1x via Management API ou SQL Editor:

```sql
SELECT cron.schedule(
  'flipbook-sequences',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/flipbook-sequences-tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Conferir que rodou: `SELECT * FROM cron.job WHERE jobname = 'flipbook-sequences';`

Para parar: `SELECT cron.unschedule('flipbook-sequences');`

---

## 4. Configurar webhook no painel Asaas

1. https://www.asaas.com/config/webhooks (ou sandbox)
2. **Adicionar webhook**:
   - URL: `https://flipbook.aldenquesada.org/api/webhooks/asaas`
   - Token de autenticação: cole o valor de `ASAAS_WEBHOOK_TOKEN` exato
   - Eventos a habilitar:
     - `PAYMENT_CONFIRMED`
     - `PAYMENT_RECEIVED`
     - `PAYMENT_REFUNDED`
     - `PAYMENT_DELETED`
     - `SUBSCRIPTION_DELETED`

---

## 5. Criar produto + oferta de teste

1. Login no `/admin` (precisa email na `FLIPBOOK_ADMIN_EMAILS`)
2. Vai pra `/admin/products`
3. **Novo produto**:
   - Tipo: `Book`
   - Livro vinculado: O Fim da Diabetes Mellitus (ou qualquer publicado)
   - SKU: `book-fim-diabetes-test`
   - Nome: `O Fim da Diabetes (sandbox)`
4. Expande o produto → **Nova oferta**:
   - Nome: `Sandbox lançamento`
   - Preço: `9,90` (valor baixo pra testar PIX rápido)
   - Cobrança: `Vitalício`
   - Sem cupom
   - Prioridade: 100

---

## 6. Smoke test ponta-a-ponta (sandbox Asaas)

### 6.1 — Compra fake

1. Abre a home em janela anônima (não-logado): https://flipbook.aldenquesada.org
2. **Toca no cover** do livro com oferta no carousel
3. Modal preview abre · vai até o slide final · clica **"Comprar agora"**
4. BuyModal abre · preenche:
   - Nome: `Smoke Test`
   - WhatsApp: **seu número real** (vai receber)
   - CPF: `123.456.789-09` (CPF teste — qualquer CPF válido funciona em sandbox)
   - Email opcional
5. **"Continuar pra pagamento"** → redireciona pra hosted page Asaas sandbox
6. Asaas mostra PIX QR / boleto / cartão. Em sandbox:
   - **PIX**: clicar "Confirmar recebimento" no painel Asaas (sandbox simula o pagamento)
   - **Cartão**: usar cartão de teste `5184 4012 5346 1007` (qualquer CVV/data futura)

### 6.2 — Validar reconciliação

Imediatamente após "pagamento":

```sql
-- Buyer deve estar 'converted'
SELECT id, name, status, last_touch_at FROM flipbook_buyers
 WHERE name = 'Smoke Test' ORDER BY created_at DESC LIMIT 1;

-- Purchase deve estar 'confirmed' com paid_at
SELECT id, status, gateway_charge_id, paid_at FROM flipbook_purchases
 WHERE buyer_id = '<buyer_id>' ORDER BY created_at DESC LIMIT 1;

-- Access grant deve existir, vitalício (expires_at IS NULL), não revogado
SELECT id, access_token, flipbook_id, expires_at, revoked_at
  FROM flipbook_access_grants WHERE purchase_id = '<purchase_id>';

-- Dispatch enviado
SELECT id, status, sent_at, provider_id, error_text FROM flipbook_comm_dispatches
 WHERE buyer_id = '<buyer_id>' AND event_key = 'buyer_purchase_confirmed';
```

### 6.3 — WhatsApp recebido

Em alguns segundos, o número que você cadastrou recebe:

> _Olá Smoke, sua compra de **O Fim da Diabetes** foi confirmada ✨_
>
> _Abra seu livro aqui: https://flipbook.aldenquesada.org/o-fim-da-diabetes?t=Xy7bN3..._
>
> _Esse link é seu — não compartilha. Boa leitura!_

### 6.4 — Acesso liberado

Tocar no link → leitor abre direto, **sem PasswordGate** mesmo se o livro tiver senha.

Refresh sem o `?t=` → continua liberado (cookie `flipbook-grant:{slug}` foi setado por 90 dias).

---

## 7. Smoke test sequência de recuperação (lead_recovery)

Pra testar sem esperar 30min reais, ajustar temporariamente:

```sql
-- Diminui delay do step 1 da lead_recovery pra 1 minuto (TEMPORÁRIO!)
UPDATE flipbook_comm_sequence_steps
   SET delay_minutes = 1
 WHERE event_key = 'lead_recovery_30min';
```

1. Submete BuyModal (vai pra Asaas) **mas NÃO conclui o pagamento**
2. Buyer fica em `status='charge_created'`
3. Espera 1min · invoca a edge manualmente:
   ```bash
   curl -X POST https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/flipbook-sequences-tick \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
   ```
4. WhatsApp recebe a mensagem de recuperação
5. **Lembrar de reverter o delay**:
   ```sql
   UPDATE flipbook_comm_sequence_steps SET delay_minutes = 30
     WHERE event_key = 'lead_recovery_30min';
   ```

---

## 8. Diagnóstico de falhas comuns

| Sintoma | Causa provável | Como debugar |
|---|---|---|
| `BuyModal` mostra "Falha ao criar cobrança" | `ASAAS_API_KEY` não configurado ou inválido | Conferir env + token no painel Asaas |
| Webhook não chega | URL no painel Asaas errada ou app offline | Asaas dashboard → Webhooks → ver tentativas |
| Webhook 401 | `ASAAS_WEBHOOK_TOKEN` não bate | Conferir env é igual ao do painel Asaas |
| Purchase confirmed mas WhatsApp não chega | Edge dispatch falhou ou Evolution offline | `SELECT * FROM flipbook_comm_dispatches WHERE status='failed' ORDER BY created_at DESC LIMIT 5;` — ver `error_text` |
| Token gate não bypassa senha | RPC retornou null (token expirado/revogado/wrong flipbook) | Validar manualmente: `SELECT public.flipbook_resolve_access_token('<token>', '<book_id>');` |
| Sequence não dispara após 15min | Cron não criado ou edge auth errada | `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;` |

---

## 9. Rollback de emergência

Para desativar TODO o funil sem reverter código:

```sql
-- Desativa todas as ofertas (BuyModal não abre nada — botão "Comprar" some)
UPDATE flipbook_offers SET active = false;

-- Pausa as sequências de WhatsApp
UPDATE flipbook_comm_sequences SET is_active = false;

-- Pausa o cron (continua, mas vira no-op)
SELECT cron.unschedule('flipbook-sequences');
```

Reverter: setar `active=true` de novo + recriar cron.

---

## Status de progresso

| # | Fase | Status |
|---|---|---|
| 1 | Mig A · products + offers + buyers | ✅ aplicado |
| 2 | Mig B · purchases + subscriptions + access_grants | ✅ aplicado |
| 3 | Mig C · sequences + templates + seeds | ✅ aplicado |
| 4 | Admin: editor de produtos/ofertas | ✅ deployed |
| 5 | Admin: editor da Landing | ✅ deployed |
| 6 | BookCarousel | ✅ deployed |
| 7 | BookPreviewModal | ✅ deployed |
| 8 | BuyModal | ✅ deployed |
| 9 | Landing /livros/[slug] | ✅ deployed |
| 10 | Asaas client lib | ✅ deployed |
| 11 | Server action createLeadAndCharge | ✅ deployed |
| 12 | Webhook /api/webhooks/asaas | ✅ deployed |
| 13 | Edge flipbook-dispatch-purchase | ⏳ código pronto, deploy pendente |
| 14 | Edge flipbook-sequences-tick (cron) | ⏳ código pronto, deploy pendente |
| 15 | Token gate | ✅ deployed |
| 16 | Home + carousel hooked | ✅ deployed |
| 17 | Smoke test sandbox | ⏳ aguarda env Asaas + edges deployadas |

Ações tuas pra fechar 100%:

1. Setar env vars (ASAAS_*, FLIPBOOK_PUBLIC_BASE_URL)
2. `supabase functions deploy flipbook-dispatch-purchase --no-verify-jwt`
3. `supabase functions deploy flipbook-sequences-tick --no-verify-jwt`
4. Schedule do cron (SQL acima)
5. Cadastrar webhook no painel Asaas
6. Criar 1 produto + 1 oferta de teste
7. Comprar fake e validar (passos da seção 6)
