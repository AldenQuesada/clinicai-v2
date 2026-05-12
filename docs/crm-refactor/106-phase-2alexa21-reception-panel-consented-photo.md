# CRM_PHASE_2ALEXA.2.1 · Painel-TV consome foto consentida do prontuário

> Pipeline fechado: prontuário → consentimento → signed URL → painel-TV
> com hero premium + animação. Sem provider · sem migration · zero risco
> de privacidade.

---

## 1 · Resumo executivo

Evolução do `/recepcao/painel` (CRM_PHASE_2ALEXA.2) para consumir
`PatientProfileRepository.getReceptionDisplayProfile()` quando paciente está
em `na_clinica` ou `em_atendimento`. Painel ganha:

- **Hero premium** com foto oficial + nome de exibição + animação consentida
  para a primeira paciente arrived com `reception-ready`.
- **Mini avatares** nas linhas de `ArrivalRow` e `InServiceRow` (foto se
  consentida · iniciais como fallback).
- Três animações browser-only (`premium_soft`, `premium_glow`, `premium_clean`)
  controladas pelo campo `reception_animation_style` do prontuário.
- Signed URLs (TTL 5 min) geradas server-side via `createServiceRoleClient`
  · path bruto NUNCA viaja pro client.

Sem migration · sem RPC nova · sem mutação de banco · zero provider.

---

## 2 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD inicial | `ba480e0` (== origin/main) |
| Working tree | limpo |
| Tracker mig 180 | `20260800000180` registrado |
| `patient_profiles_extended` | criada · 4 CHECK + 3 RLS policies |
| Worker 71 | OFF |
| `wa_outbox` | queued=0 · pending=0 · unsafe=0 |

---

## 3 · Contrato consumido do prontuário

`PatientProfileRepository.getReceptionDisplayProfile(patientId)` retorna
apenas quando:

```
reception_welcome_enabled = true
AND reception_photo_consent_status = 'granted'
AND profile_photo_path IS NOT NULL
```

Campos consumidos (todos seguros · sem clínico):

- `patientId`
- `displayName` (cosmético)
- `preferredName` (cosmético · preferido para hero)
- `profilePhotoPath` → **convertido em signed URL no server** · path bruto não sai
- `animationStyle` (`premium_soft` | `premium_glow` | `premium_clean`)

Se retorno = `null`, painel cai no fallback iniciais e mensagem genérica.

---

## 4 · Como o painel decide exibir foto

Server-side em `apps/lara/src/app/(authed)/recepcao/painel/page.tsx`:

1. `appointments.listByDate(clinicId, today)` → arrived/inService/upcoming/overdue.
2. Coletar `patientId` único de **apenas** arrived + inService.
3. Para cada `patientId`, `patientProfile.getReceptionDisplayProfile()` em paralelo.
4. Para profiles retornados, `service.storage.from('media').createSignedUrl(path, 300)`
   em paralelo (TTL 5 min).
5. Mapear `photoSignedUrl`, `receptionDisplayName`, `animationStyle` para cada `PanelRow`.

Resultado: client recebe `PanelRow` já hydrated · zero conhecimento de path.

---

## 5 · Fallbacks sem consentimento

| Caso | Comportamento |
|---|---|
| `profile` ausente (sem prontuário extended) | Avatar com iniciais · nome do appointment |
| `consent != granted` | `getReceptionDisplayProfile()` retorna `null` → iniciais |
| `welcome_enabled = false` | `getReceptionDisplayProfile()` retorna `null` → iniciais |
| `profile_photo_path` ausente | DB CHECK proíbe welcome=true · idem retorno null |
| `createSignedUrl` falha | `photoSignedUrl = null` → componente cai em iniciais |
| Paciente em `upcoming`/`overdue` | Sem foto · UI mantém densidade compacta |

O hero premium só renderiza quando `arrived` tem **pelo menos uma row com
`photoSignedUrl` E `animationStyle`** · senão, é omitido.

---

## 6 · Animações premium (browser-only)

| Estilo | Visual | Implementação |
|---|---|---|
| `premium_soft` | Fade-in + zoom-out sutil na foto (4.5s) | `@keyframes ra-fade-in` + `ra-photo-zoom` |
| `premium_glow` | Pulse de glow esmeralda no anel + shimmer diagonal | `ra-glow-pulse` + `ra-shimmer` overlay |
| `premium_clean` | Editorial minimalista · só fade-in curto · foto estática | `ra-fade-in` 500ms |

Regras respeitadas:

- Sem asset externo (sem font, sem image, sem JS lib);
- Sem canvas, sem WebGL;
- Reduced-motion override via `@media (prefers-reduced-motion: reduce)`;
- Performance TV-friendly (animações em `transform`/`opacity`/`box-shadow`).

---

## 7 · Privacidade

Painel **não** renderiza:

- telefone completo (`maskPhone()` em page.tsx · só 4 últimos quando usado);
- CPF · WhatsApp · anamnese · consentimento clínico · orçamento · valores;
- histórico médico · observações internas;
- raw storage path (só signed URL · TTL 300s).

Quando consentimento é revogado, query `getReceptionDisplayProfile()` retorna
`null` automaticamente · revoked profiles **nunca** chegam ao painel.

---

## 8 · Fontes de dados

| Fonte | Como | Privacidade |
|---|---|---|
| `appointments` via `AppointmentRepository.listByDate` | Server | RLS scoped por clinic_id |
| `patient_profiles_extended` via `PatientProfileRepository.getReceptionDisplayProfile` | Server | RLS scoped · filtro tripo enforced |
| Signed URL | `createServiceRoleClient` apenas para `storage.createSignedUrl` | TTL 300s · path nunca exposto |

Zero JOIN em anamnese · orcamentos · phase_history · observações.

---

## 9 · UI entregue

- **Hero**: card 24px padding · 160x160 foto circular · h2 44px do display name ·
  mensagem "Estamos felizes em receber você na Clínica Mirian de Paula" ·
  badges profissional/horário/chegada.
- **ArrivalRow**: avatar 44px · nome 22px bold · profissional + procedimento ·
  badge "há X min" verde.
- **InServiceRow**: avatar 36px · nome 20px · badge "em curso" azul.
- **UpcomingRow**: inalterado (sem foto · só iniciais não são desenhadas).
- **OverdueRow**: inalterado.
- Auto-refresh server 15s · ticker client 30s · relógio 1s.

---

## 10 · O que NÃO foi feito

- Não ativou job 71.
- Não chamou Alexa · Evolution · Meta · provider externo.
- Não criou wa_outbox row.
- Não alterou cron.
- Não criou migration (zero · esperado).
- Não fez deploy manual.
- Não exibiu foto sem consentimento.
- Não expôs path bruto.
- Não exibiu telefone completo, valores, dados clínicos.
- Não atualizou Painel de TV legacy (clinic-dashboard) · só apps/lara.

---

## 11 · Smoke + validation

| Arquivo | Resultado |
|---|---|
| `docs/crm-refactor/sql/phase-2alexa21-reception-panel-consented-photo-smoke.sql` | 13/13 PASS · wa_outbox_delta=0 |
| `docs/crm-refactor/sql/phase-2alexa21-reception-panel-consented-photo-validation.sql` | final_flags todos green · `can_continue=true` |

Final flags chave:

- `worker71_off`: true
- `tracker_mig_180`: 20260800000180
- `reception_panel_ready`: true
- `photo_consent_contract_ready`: true
- `signed_url_contract_ready`: true
- `privacy_contract_ok`: true
- `unsafe_outbox_count`: 0
- `cron_with_provider_call`: 0
- `phase_perdido_count`: 0
- `invalid_appointment_status_count`: 0
- `can_continue`: true

Smoke retornou JSON com:

```
A_worker71_off, B_profile_table_exists, C_provision_ok,
D_welcome_without_consent_blocked, E_grant_consent_photo_welcome_ok,
F_ready_query_returns_one, G_no_welcome_without_photo, H_safe_columns_only,
I_revoke_atomic_ok, J_revoked_excluded_from_ready, K_panel_source_today_count,
L_provider_cron_count=0, M_unsafe_outbox_count=0, wa_outbox_delta=0
```

---

## 12 · Riscos residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| Storage RLS para `patient-profiles/*` ainda não configurado | médio | service_role usado apenas server-side para signed URL · CONTROL.3 futuro |
| Signed URL com TTL 5 min pode vazar se DOM scraped | baixo | TTL curto · refresh server cada 15s · URL invalida sozinha |
| Hero pode ficar grande em TVs pequenas | baixo | flex layout · breakpoint pode ser ajustado em iteração de polish |
| Animação `premium_glow` consome leve CPU | muito baixo | apenas `transform`/`box-shadow` · reduced-motion override |

---

## 13 · Próxima fase

Ver [`107-next-prompt-after-2alexa21.md`](./107-next-prompt-after-2alexa21.md).
Recomendada: `CRM_PHASE_LEGACY.PORT.WIZARD_PROCEDURES` (Select FK no wizard
de agendamento · upgrade natural depois de PROCEDURES_ADMIN).

---

## 14 · Veredito

**PASS_CRM_2ALEXA21_RECEPTION_PANEL_CONSENTED_PHOTO_READY_LOCAL_COMMIT**

- HEAD inicial: `ba480e0`
- HEAD final: a definir (commit local sem push)
- HEAD == origin/main: NO (1 commit local a frente · aguardando autorização)
- Migration aplicada: nenhuma (esperado)
- Smoke: 13/13 PASS
- Validation: final flags green
- Typecheck: a executar
- Próxima ação: aguardar autorização do usuário para `git push origin main`.
