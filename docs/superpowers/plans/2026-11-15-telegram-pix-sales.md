# Plataforma de vendas no Telegram com PIX — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um bot Telegram vende um vídeo via PIX na KavroPay e um painel Next.js mostra funil, campanhas e financeiro a partir de eventos reais.

**Architecture:** NestJS guarda o domínio (dinheiro em centavos, confirmação idempotente, entrega, recuperação) e expõe a API do painel, o webhook e o bot. O worker BullMQ processa pagamento, entrega e recuperação. Next.js só lê e comanda a API. Postgres é a fonte dos números.

**Tech Stack:** Node.js, NestJS 10, Prisma 6, PostgreSQL 16, Redis 7, BullMQ 5, Next.js 15, React 19, Tailwind 3, Recharts 2, Jest 29.

**Spec:** `docs/superpowers/specs/2026-11-15-telegram-pix-sales-design.md`

## Global Constraints

- Dinheiro é inteiro em centavos. `amount` da KavroPay é string com duas casas na borda.
- Fuso dos filtros de calendário: `America/Sao_Paulo`.
- Cobrança sem CPF, sem e-mail e sem telefone. Nome vazio vira `Cliente Telegram`.
- Payload de `/start` inválido vira origem `direto`. Código válido: `[A-Za-z0-9_-]{1,64}`. Origem do usuário é a do primeiro `/start`.
- Etapa de vídeo no funil: evento `presentation_sent`, rótulo `Apresentação enviada`.
- Status de pedido: `criado`, `aguardando_pagamento`, `pago`, `expirado`, `cancelado`, `reembolsado`, `em_analise`.
- Taxa com valor: origem `gateway`. Taxa ausente: `null` e origem `nao_informada`. Nunca percentual inventado.
- HMAC: `timestamp + "." + corpo cru`, SHA-256, tolerância 300 segundos, comparação em tempo constante.
- `payment.paid` e `payment.confirmed` são o mesmo fato.
- Webhook de ambiente diferente da chave salva não liquida.
- Divergência de valor marca `em_analise` e não entrega.
- Um `delivery id` repetido não cria segundo pagamento nem segunda entrega.
- "Já paguei" com `waiting_payment` não entrega. Consulta no máximo a cada 15 segundos por pedido.
- Entrega: uma por pedido. Esperas de nova tentativa: 1 min, 5 min, 15 min, 1 h. A quarta falha deixa status `falha`.
- Recuperação: uma mensagem por etapa. Padrões: 60 min, 30 min, 24 h.
- Resultado operacional = líquido dos pagamentos que estão `pago` agora, menos despesas. Reembolso não é subtraído de novo.
- Papéis: `owner` e `operator`. Segredos AES-256-GCM. Tela mostra só os 4 últimos caracteres.
- Painel consulta de novo a cada 15 segundos.
- Vídeo até 50 MB.
- Backup diário, retenção 7 dias.
- Dashboard sem linhas de negócio mostra zero.

## Review Focus

- Webhook reenviado com o mesmo `X-Kavro-Delivery-Id` depois do pagamento já liquidado — a segunda vez não entrega de novo.
- Corpo com valor diferente do pedido — pedido vai para `em_analise` e a fila de entrega não recebe o pedido.
- Botão "Já paguei" enquanto a KavroPay ainda responde `waiting_payment` — o usuário só vê que segue aguardando.
- Evento `sandbox` com chave `kvk_live_` salva — o pedido não muda.
- Pagamento `reembolsado` e comando `/meuacesso` — nenhuma mídia é enviada.
- Cobrança paga sem campo `fee` — o financeiro não soma zero no lugar da taxa e o líquido dessa cobrança fica de fora do resultado.

---

## File structure

- `backend/src/domain/money.ts` — centavos e string da KavroPay.
- `backend/src/domain/finance.ts` — fórmulas do resultado.
- `backend/src/domain/kavro-signature.ts` — HMAC.
- `backend/src/domain/confirm-payment.ts` — decisão do webhook e da consulta.
- `backend/src/domain/attribution.ts` — payload do `/start`.
- `backend/src/domain/funnel.ts` — contagem de usuários únicos por etapa.
- `backend/src/domain/delivery.ts` — tentativas e reprocesso.
- `backend/src/domain/recovery.ts` — quem pode receber mensagem.
- `backend/src/domain/telegram-flow.ts` — o que o bot responde e quais efeitos dispara.
- `backend/src/domain/cipher.ts` — AES-256-GCM.
- `backend/src/domain/calendar.ts` — intervalos no fuso de São Paulo.
- `backend/prisma/schema.prisma` — tabelas da spec.
- `backend/src/infra/*` — Prisma, KavroPay HTTP, Telegram HTTP, BullMQ.
- `backend/src/api/*` — Nest: auth, recursos do painel, webhook, bot.
- `backend/src/worker.ts` — filas.
- `frontend/app/*` — telas do painel.
- `frontend/lib/finance-labels.ts` — rótulos e formatação BRL.
- `docker-compose.yml` — Postgres, Redis, API, worker, painel, backup.

## Interfaces

```ts
export type Cents = number
export type Environment = 'live' | 'sandbox'
export type OrderStatus = 'criado' | 'aguardando_pagamento' | 'pago' | 'expirado' | 'cancelado' | 'reembolsado' | 'em_analise'
export type FeeSource = 'gateway' | 'nao_informada'

export function toKavroAmount(cents: Cents): string
export function centsFromKavroAmount(amount: string | number): Cents

export type FinancePayment = {
  amountCents: Cents
  feeCents: Cents | null
  netCents: Cents | null
  feeSource: FeeSource
  status: 'pago' | 'reembolsado'
}
export function summarizeFinance(payments: FinancePayment[], expenseCents: Cents): {
  grossCents: Cents
  feeCents: Cents
  feesMissing: number
  netCents: Cents
  refundCents: Cents
  expenseCents: Cents
  resultCents: Cents
}

export function verifyKavroSignature(rawBody: string, signatureHeader: string, secret: string, nowEpochSeconds: number): boolean

export type ConfirmDecision =
  | { action: 'reject_signature' }
  | { action: 'duplicate' }
  | { action: 'reject_environment' }
  | { action: 'under_review' }
  | { action: 'mark_paid'; enqueueDelivery: true }
  | { action: 'mark_expired' }
  | { action: 'mark_refunded' }
  | { action: 'still_waiting' }
  | { action: 'noop' }

export function confirmPayment(input: {
  rawBody: string
  signatureHeader: string
  secret: string
  nowEpochSeconds: number
  deliveryId: string
  processedDeliveryIds: string[]
  expectedEnvironment: Environment
  eventEnvironment: Environment
  eventName: 'payment.paid' | 'payment.confirmed' | 'payment.expired' | 'payment.refunded' | 'other'
  orderStatus: OrderStatus
  orderAmountCents: Cents
  gatewayStatus: 'waiting_payment' | 'paid' | 'expired' | 'refunded' | 'other'
  gatewayAmount: string | number
  alreadyLiquidated: boolean
}): ConfirmDecision

export function parseStartPayload(payload: string | undefined): { origin: string; campaignCode: string }
export function customerName(firstName?: string, lastName?: string): string

export function funnelCounts(events: { userId: string; type: string }[]): {
  stage: string
  label: string
  users: number
  percentOfStart: number
  percentOfPrevious: number
  dropped: number
  dropPercent: number
}[]

export function nextDeliveryDelayMs(failedAttempts: number): number | null
export function canReprocess(orderStatus: OrderStatus): boolean

export type RecoveryStage = 'no_pix' | 'pix_unpaid' | 'pix_expired'
export function recoveryDue(input: {
  stage: RecoveryStage
  alreadySent: boolean
  paid: boolean
  blocked: boolean
  enabled: boolean
  elapsedMinutes: number
  delayMinutes: number
}): boolean

export type BotEffect =
  | { type: 'send_presentation' }
  | { type: 'send_pitch' }
  | { type: 'open_checkout' }
  | { type: 'send_existing_access' }
  | { type: 'check_status' }
  | { type: 'resend_access' }
  | { type: 'send_support' }
  | { type: 'cancel_flow' }
  | { type: 'copy_pix' }

export function reduceTelegram(input: {
  text: string
  callback: string | null
  hasPaidAccess: boolean
  hasWaitingCharge: boolean
}): { effects: BotEffect[]; reply: string }
```

---

### Task 1: Dinheiro

**Files:**
- Create: `backend/src/domain/money.ts`
- Test: `backend/src/domain/money.spec.ts`

**Interfaces:**
- Consumes: nada
- Produces: `toKavroAmount`, `centsFromKavroAmount`

- [ ] **Step 1: Write the failing test**

```ts
expect(toKavroAmount(14990)).toBe('149.90')
expect(toKavroAmount(50)).toBe('0.50')
expect(centsFromKavroAmount('149.90')).toBe(14990)
expect(centsFromKavroAmount(10)).toBe(1000)
expect(centsFromKavroAmount('10.00')).toBe(1000)
```

- [ ] **Step 2: Run** `npx jest src/domain/money.spec.ts` — FAIL, módulo ausente
- [ ] **Step 3: Implement** as duas funções. Parse de string pelo ponto decimal, sem `Number` intermediário para a string. Número solto: centavos = `Math.round(amount * 100)`.
- [ ] **Step 4: Run** o mesmo Jest — PASS

### Task 2: Financeiro

**Files:**
- Create: `backend/src/domain/finance.ts`
- Test: `backend/src/domain/finance.spec.ts`

**Interfaces:**
- Consumes: `Cents`
- Produces: `summarizeFinance`

- [ ] **Step 1: Test**

Pagamento pago 10000 / fee 100 / net 9900 e pagamento reembolsado 5000 / fee 50 / net 4950, despesa 1000:

- gross 15000
- fee 150
- feesMissing 0
- net 9900
- refund 5000
- result 8900

Pagamento pago sem fee: `feesMissing === 1`, `feeCents === 0`, `netCents` não inclui o líquido nulo.

- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement `summarizeFinance`**
- [ ] **Step 4: PASS**

### Task 3: Assinatura KavroPay

**Files:**
- Create: `backend/src/domain/kavro-signature.ts`
- Test: `backend/src/domain/kavro-signature.spec.ts`

**Interfaces:**
- Produces: `verifyKavroSignature(rawBody, signatureHeader, secret, nowEpochSeconds): boolean`

- [ ] **Step 1: Test** com HMAC conhecido de `1700000000.{"event":"payment.paid"}` e segredo `whsec_test`. Aceita no instante 1700000100. Rejeita aos 1700000401. Rejeita corpo com espaço a mais. Rejeita header sem `v1`.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement** como na doc: header `t=...,v1=...`, janela 300s, `timingSafeEqual`.
- [ ] **Step 4: PASS**

### Task 4: Confirmação de pagamento

**Files:**
- Create: `backend/src/domain/confirm-payment.ts`
- Test: `backend/src/domain/confirm-payment.spec.ts`

**Interfaces:**
- Consumes: `verifyKavroSignature`, `centsFromKavroAmount`
- Produces: `confirmPayment`

- [ ] **Step 1: Tests, um comportamento por `it`**

- assinatura inválida → `reject_signature`
- `deliveryId` já em `processedDeliveryIds` → `duplicate` (mesmo com evento `payment.paid`)
- `eventEnvironment` `sandbox` e `expectedEnvironment` `live` → `reject_environment`
- evento `payment.paid`, gateway `paid`, valor `"10.01"` contra pedido 1000 → `under_review`
- evento `payment.paid`, gateway `paid`, valor igual, pedido `aguardando_pagamento` → `mark_paid`
- evento `payment.confirmed` com `alreadyLiquidated` true → `noop`
- evento `payment.expired` e pedido aguardando → `mark_expired`
- evento `payment.refunded` e pedido `pago` → `mark_refunded`
- consulta com gateway `waiting_payment` → `still_waiting`
- evento `payment.paid` com gateway ainda `waiting_payment` → `still_waiting`

- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement** na ordem da spec: assinatura, delivery id, ambiente, releitura (o `gatewayStatus` já é a releitura), valor, liquidação prévia.
- [ ] **Step 4: PASS**

### Task 5: Atribuição, funil, entrega, recuperação, bot

**Files:**
- Create: `backend/src/domain/attribution.ts`
- Create: `backend/src/domain/funnel.ts`
- Create: `backend/src/domain/delivery.ts`
- Create: `backend/src/domain/recovery.ts`
- Create: `backend/src/domain/telegram-flow.ts`
- Create: `backend/src/domain/calendar.ts`
- Create: `backend/src/domain/cipher.ts`
- Test: um `*.spec.ts` ao lado de cada arquivo

**Interfaces:**
- Produces: as assinaturas do bloco Interfaces acima, mais `periodRange(preset, now): { from: Date; to: Date }` e `encryptSettings` / `decryptSettings`.

- [ ] **Step 1: Tests**

- `parseStartPayload('campanha01')` → origin e campaign `campanha01`
- `parseStartPayload('instagram ads')` e `parseStartPayload(undefined)` → `direto`
- `customerName()` → `Cliente Telegram`; `customerName('Ana', 'Souza')` → `Ana Souza`
- funil com usuários A em todas as etapas e B só em `bot_started`: etapa 1 tem 2, etapa 6 tem 1, dropped da etapa 2 em diante usa a etapa anterior
- rótulo da segunda etapa é `Apresentação enviada`
- `nextDeliveryDelayMs(1|2|3|4)` → 60000, 300000, 900000, 3600000; `nextDeliveryDelayMs(5)` → `null`
- `canReprocess('pago')` true; `canReprocess('reembolsado')` false; `canReprocess('aguardando_pagamento')` false
- recovery: elapsed menor que o atraso → false; já enviada → false; paga → false; bloqueada → false; desligada → false; elegível → true
- `/start` sem acesso pago → efeitos `send_presentation` e `send_pitch`
- `/start` com acesso pago → inclui `send_existing_access`
- callback `buy` → `open_checkout`
- callback `paid` → `check_status`
- callback `copy` → `copy_pix`
- `/meuacesso` sem acesso → reply diz que não há compra paga; com acesso → `resend_access`
- `/cancelar` → `cancel_flow`
- `periodRange('hoje', instante dentro de 2026-11-15 em São Paulo)` começa às 00:00 e termina antes do dia 16, ambos em UTC equivalente a São Paulo
- roundtrip do cipher com chave de 32 bytes; texto cifrado diferente do original

- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement** cada função. Funil na ordem `bot_started`, `presentation_sent`, `purchase_clicked`, `pix_generated`, `payment_approved`, `delivery_completed`. Percentuais com uma casa, base zero quando o denominador é zero.
- [ ] **Step 4: PASS** `npx jest src/domain`

### Task 6: Persistência

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `docker-compose.yml` com `postgres:16` e `redis:7`
- Create: `backend/src/infra/prisma.service.ts`

**Interfaces:**
- Produces: modelos Prisma `User`, `Product`, `Order`, `Payment`, `PaymentFee`, `PaymentWebhook`, `Delivery`, `DeliveryAttempt`, `TrackingEvent`, `Campaign`, `RecoveryMessage`, `Expense`, `Refund`, `AdminUser`, `AuditLog`, `Setting`

- [ ] **Step 1:** Schema com as invariantes da spec: `User.telegramId` único; `Payment.orderId` único; `Payment.gatewayChargeId` único; `PaymentWebhook.deliveryId` único; `Delivery.orderId` único; `Refund.paymentId` único; `RecoveryMessage` único em `(userId, stage)`; `Product.active`; `Setting.key` único; `AdminUser.email` único.
- [ ] **Step 2:** `npx prisma validate` — sucesso.
- [ ] **Step 3:** `docker compose up -d postgres redis` e `npx prisma migrate dev --name init`.

### Task 7: API, webhook, bot e worker

**Files:**
- Create: `backend/src/main.ts`, `backend/src/worker.ts`, `backend/src/app.module.ts`
- Create: `backend/src/api/auth.controller.ts`
- Create: `backend/src/api/panel.controller.ts`
- Create: `backend/src/api/webhook.controller.ts`
- Create: `backend/src/api/telegram.controller.ts`
- Create: `backend/src/infra/kavro.client.ts`
- Create: `backend/src/infra/telegram.client.ts`
- Create: `backend/src/infra/queues.ts`
- Test: `backend/src/api/panel.finance.spec.ts` usando `summarizeFinance` via o serviço do painel com repositório em memória

**Interfaces:**
- Consumes: todas as funções de domínio
- Produces: HTTP

Rotas:

- `POST /api/auth/login` `{ email, password }` → cookie `admin_session` httpOnly
- `POST /api/auth/logout`
- `GET /api/dashboard?preset=`
- `GET /api/funnel?preset=`
- `GET /api/users?q=`
- `GET /api/campaigns?preset=`
- `GET /api/recovery`
- `GET /api/orders?preset=&status=`
- `GET /api/orders/:id`
- `POST /api/orders/:id/reconcile` owner e operator
- `GET /api/deliveries`
- `POST /api/deliveries/:id/reprocess`
- `GET /api/finance/transactions`
- `GET /api/finance/summary`
- `POST /api/expenses` owner
- `PATCH /api/expenses/:id` owner
- `DELETE /api/expenses/:id` owner
- `GET /api/exports/:resource.csv` e `.xlsx`
- `GET /api/settings` segredos mascarados
- `PUT /api/settings` owner
- `POST /api/webhooks/kavro` corpo cru
- `POST /api/telegram/webhook`

Kavro client: `createCharge`, `getCharge`. Telegram client: `sendMessage`, `sendPhoto`, `sendVideo`, `answerCallbackQuery`. Worker: filas `payment`, `delivery`, `recovery`.

- [ ] **Step 1: Test** do serviço de resumo: lista vazia devolve zeros e `feesMissing: 0`.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement** os controllers usando o domínio. Webhook persiste o raw e enfileira. O worker chama `confirmPayment` e só então grava pagamento e entrega. Bot em long polling no processo da API quando `TELEGRAM_MODE` não é `webhook`.
- [ ] **Step 4: PASS** `npx jest`

### Task 8: Painel

**Files:**
- Create: `frontend/` Next.js App Router, Tailwind, Recharts
- Telas: `app/login/page.tsx`, `app/(panel)/dashboard/page.tsx`, `funnel`, `users`, `campaigns`, `recovery`, `orders`, `orders/[id]`, `deliveries`, `finance`, `settings`
- Create: `frontend/lib/format.ts`
- Test: `frontend/lib/format.spec.ts`

**Interfaces:**
- Consumes: o JSON das rotas da Task 7. Campos do dashboard: `usersStarted`, `uniqueUsers`, `presentationSent`, `purchaseClicks`, `pixGenerated`, `pixPending`, `pixExpired`, `paymentsApproved`, `paymentsRefunded`, `deliveriesCompleted`, `deliveriesFailed`, `conversionPercent`, e o objeto de `summarizeFinance` em camelCase inglês no JSON.

- [ ] **Step 1: Test** `formatBRL(9900)` → `R$\u00a099,00` e `formatPercent(0)` → `0%`.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement** as telas. Vazio mostra zero. Atualiza a cada 15s. Filtros da spec. Configurações nunca renderizam o segredo inteiro. Exportação aponta para as rotas CSV e XLSX.
- [ ] **Step 4: PASS** o teste de formato. `npm run build` no frontend sem erro.

### Task 9: Subida

**Files:**
- Modify: `docker-compose.yml` com serviços `api`, `worker`, `web`, `backup`
- Create: `backend/Dockerfile`, `frontend/Dockerfile`, `.env.example`, `README.md`
- Create: `backend/src/infra/backup.ts` — dump diário, apaga arquivos com mais de 7 dias

- [ ] **Step 1:** `.env.example` lista `DATABASE_URL`, `REDIS_URL`, `SETTINGS_ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PUBLIC_BASE_URL`, `TELEGRAM_MODE`.
- [ ] **Step 2:** README com os comandos de subida e a ordem: migrar, abrir o painel, salvar token e chave KavroPay, apontar o webhook.
- [ ] **Step 3:** `docker compose config` valida o arquivo.

---

## Self-review

- Spec coberta: bot (task 5 e 7), checkout e webhook (4 e 7), entrega (5 e 7), recuperação (5 e 7), funil e campanhas (5 e 7), financeiro e despesas (2 e 7), painel e exportação (8), cifra e papéis (5 e 7), backup (9).
- Fora do escopo permanece fora: CPF, paylink, saque, subconta, split, MED como módulo próprio, catálogo.
- Review Focus: os seis casos estão nos testes das tasks 2, 4 e 5.
