# Plataforma de vendas no Telegram com PIX

Data: 2026-11-15

## Intenção

Uma pessoa chega ao Telegram por um link de campanha, vê a apresentação, gera um PIX e recebe um vídeo digital só depois que a KavroPay confirma o pagamento. Quem opera acompanha, num painel web, quantas pessoas entraram, onde abandonaram, quanto entrou, quanto foi taxa, quanto foi reembolso e qual o resultado depois das despesas.

Os números do painel saem de eventos e transações gravados pelo sistema. Zero no banco aparece como zero. Taxa que a KavroPay não mandou aparece como não informada.

## O que já foi decidido

- A plataforma inteira entra no primeiro corte: bot, checkout, webhook, entrega, recuperação, funil, campanhas, pedidos, entregas, financeiro, despesas, relatórios e configurações.
- O gateway é a KavroPay. A cobrança nasce no bot com `POST /v1/charges`. A página hospedada da KavroPay não é o checkout.
- A cobrança vai sem CPF, sem e-mail e sem telefone. O nome enviado é o nome do Telegram. Se o Telegram não tiver nome, o nome enviado é `Cliente Telegram`.
- O stack é NestJS, Telegraf (ou a Bot API equivalente no Nest), PostgreSQL, Prisma, Redis, BullMQ, Next.js, React, Tailwind e Recharts.
- O repositório é a raiz deste projeto (`backend/`, `frontend/`, `docker-compose.yml`). Não há uma pasta extra em volta.

## Abordagens

1. **Plataforma inteira nesta estrutura.** Backend NestJS, painel Next.js, Postgres, Redis e filas para confirmação, entrega e recuperação. Escolhida. O funil, a taxa e a entrega dependem dos mesmos eventos; separar isso em fases refaria o miolo.
2. **A mesma estrutura em duas etapas.** Primeiro só o caminho do dinheiro e um painel mínimo. Descartada: a operação pediu o sistema completo de uma vez.
3. **Um único app Next.js, sem Nest nem fila.** Descartada: a especificação pede webhook idempotente, retentativa de entrega e worker de recuperação. Fila e processo separado existem para isso.

## Objetivos

- Vender um conteúdo digital pelo Telegram, do `/start` até o vídeo entregue, sem ação manual no pagamento.
- Confirmar pagamento só com webhook assinado e nova consulta à KavroPay.
- Medir o funil e a origem por eventos append-only.
- Mostrar o financeiro a partir de pagamentos, taxas, reembolsos e despesas reais.
- Reprocessar entrega que falhou, com histórico de tentativas.
- Recuperar abandono com no máximo uma mensagem por etapa, em intervalo configurável.

## Fora do escopo

- Catálogo com vários produtos à venda ao mesmo tempo. O bot vende o único produto ativo.
- Coleta ou geração de CPF, e-mail ou telefone.
- Saque, saldo da carteira KavroPay, subconta e split.
- Checkout pela página pública da KavroPay.
- Afirmar que a pessoa assistiu ao vídeo. O Telegram não confirma reprodução.
- Aprovar pagamento à mão, sem a KavroPay dizer que está pago.
- Cadastro público de administrador.

## O que faria o sistema falhar mesmo funcionando

- Entregar o vídeo no clique em "Já paguei" sem a KavroPay confirmar.
- Contar duas vezes o mesmo webhook.
- Mostrar taxa estimada como taxa confirmada.
- Encher o painel com números de demonstração.
- Mandar recuperação em loop para a mesma pessoa.

## Restrições

- Dinheiro é inteiro em centavos no banco. A conversão para a string de reais da KavroPay acontece na borda.
- Fuso dos filtros "hoje", "ontem", "este mês" e "mês anterior": `America/Sao_Paulo`.
- Vídeo enviado pelo bot: até 50 MB, guardado como `file_id` do Telegram. Acima disso o envio não é prometido.
- O bot não escreve na área de transferência do celular. O botão "Copiar PIX" reenvia o código em bloco monoespaçado, que o Telegram deixa copiar com um toque.
- Webhook da KavroPay precisa de HTTPS público. Sem URL pública, o bot ainda sobe em long polling e a cobrança ainda é criada; a confirmação automática espera a URL.
- Chave `kvk_test_` e chave `kvk_live_` não se misturam. Evento de um ambiente não liquida pedido do outro.
- Rate limit da KavroPay: 120 requisições por minuto por chave. "Já paguei" não consulta em loop.

## Bot

Usuário é único por Telegram ID. O primeiro `/start` cria o cadastro e grava a origem. Um `/start` posterior atualiza o último acesso e não troca a origem. Cada visita grava um evento `bot_started` com o payload daquela visita. O relatório de campanha usa a origem do primeiro acesso.

O payload de `/start` é o código da campanha (`instagram`, `campanha01`). Só entram letras, números, `_` e `-`, até 64 caracteres. Payload vazio ou inválido vira origem `direto`, e a pessoa segue o fluxo normal.

`/start` faz, nesta ordem: identifica, registra o primeiro acesso se for o caso, grava a origem, verifica se já existe compra paga e não reembolsada, envia o vídeo de apresentação, envia o texto comercial configurado e mostra `QUERO COMPRAR AGORA`. Quem já pagou e não foi reembolsado também recebe o atalho para o conteúdo.

A etapa do funil correspondente ao vídeo é `presentation_sent`, disparada quando o Telegram aceita o envio. O painel chama essa etapa de "Apresentação enviada". Não existe etapa "assistiu".

Comandos:

| Comando | Efeito |
|---|---|
| `/start` | Fluxo de entrada |
| `/comprar` | Abre o checkout |
| `/status` | Consulta a cobrança pendente mais recente na KavroPay e mostra o status |
| `/meuacesso` | Reenvia o conteúdo se a compra está paga e não reembolsada |
| `/suporte` | Envia o texto de suporte configurado, com link opcional |
| `/cancelar` | Abandona o fluxo local |

`/cancelar` antes da cobrança marca o pedido como cancelado. Depois da cobrança, o PIX continua válido até expirar ou ser pago: a API usada não cancela QR Code. O bot diz isso. Se a pessoa pagar depois, o webhook ainda entrega.

## Checkout

Cada clique que gera cobrança cria um pedido novo. Um usuário pode ter vários PIX. Cobrança repetida do mesmo pedido usa `Idempotency-Key` igual ao id do pedido e `externalId` igual ao id do pedido.

Corpo enviado à KavroPay:

- `amount` com duas casas, vindo dos centavos do produto ativo.
- `description` com o nome do produto.
- `expiresInMinutes` configurável, padrão 30.
- `customer.name` apenas.
- `metadata` com id do pedido, Telegram ID e campanha.
- `notification_url` quando existe URL pública. O `notification_secret` devolvido fica cifrado junto do pagamento.

A resposta guarda id da cobrança, copia-e-cola, QR Code, taxa, líquido, vencimento e ambiente. Taxa e líquido ausentes ficam nulos, com origem `nao_informada`. Taxa presente fica com origem `gateway`.

O bot envia valor, vencimento, QR Code, copia-e-cola, botão "Copiar PIX" e botão "Já paguei", mais a frase de que a confirmação é automática.

"Já paguei" e `/status` consultam a cobrança na KavroPay. Status `paid` com o mesmo valor dispara o mesmo caminho do webhook. Qualquer outro status só informa a situação. Limite: uma consulta a cada 15 segundos por pedido.

## Confirmação

O endpoint de webhook responde 2xx só depois de persistir o evento bruto. O processamento pesado vai para a fila.

Validação, nesta ordem:

1. Assinatura HMAC-SHA256 de `timestamp.corpo_cru`, comparação em tempo constante, rejeição se o timestamp passar de 5 minutos.
2. Segredo: o da cobrança, se houver; senão o segredo global cifrado nas configurações.
3. `X-Kavro-Delivery-Id` único. Entrega repetida não gera outro pagamento nem outra entrega.
4. Ambiente do evento igual ao ambiente da chave salva.
5. Nova leitura da cobrança na KavroPay.
6. Valor em centavos igual ao do pedido. Divergência marca o pedido `em_analise`, grava auditoria e não entrega.
7. Pedido ainda não liquidado. Segunda confirmação do mesmo pagamento não entrega de novo.

Eventos:

- `payment.paid` e `payment.confirmed` liquidam. São o mesmo fato. Um deles tendo liquidado, o outro não faz nada.
- `payment.expired` expira o pedido se ele ainda está aguardando.
- `payment.refunded` marca o pagamento e o pedido como reembolsados, grava o reembolso e impede `/meuacesso`. Não apaga a entrega que já aconteceu.

Status do pedido: `criado`, `aguardando_pagamento`, `pago`, `expirado`, `cancelado`, `reembolsado`, `em_analise`.

Não há edição livre de status. Ação administrativa de "reconciliar" só relê a KavroPay e aplica o status que ela devolver, com auditoria.

## Entrega

Pedido pago e não reembolsado enfileira uma entrega. Existe no máximo uma entrega por pedido. Tentativas ficam no histórico dessa entrega.

O worker envia a mensagem de aprovação configurada, o vídeo de entrega (`file_id`) e as instruções, com botão para recuperar o conteúdo. Grava horário, pedido, arquivo, status, número da tentativa e o erro, se houver.

Falhou: novas tentativas em 1 minuto, 5 minutos, 15 minutos e 1 hora. Depois da quarta falha, a entrega fica `falha` e o painel pode reprocessar. Reprocessar zera a contagem de espera e grava quem autorizou. Reprocessar pedido não pago ou reembolsado é recusado.

Envio aceito pelo Telegram é `entrega concluída`. Isso não significa que o vídeo foi assistido.

## Recuperação

Três etapas, cada uma com no máximo uma mensagem por usuário:

- Iniciou ou clicou em comprar e não gerou PIX.
- Gerou PIX e não pagou, ainda dentro do prazo.
- PIX expirou.

O atraso de cada etapa é configurável. O padrão é 60 minutos, 30 minutos e 24 horas, nessa ordem. Não envia se a pessoa já pagou, se já recebeu a mensagem daquela etapa, se bloqueou o bot, ou se a etapa está desligada. Texto de cada etapa é configurável.

## Financeiro

Tudo em centavos. Período no fuso de São Paulo.

- Faturamento bruto: soma do valor original dos pagamentos que chegaram a `pago`, inclusive os que depois foram reembolsados.
- Taxas: soma das taxas com origem `gateway` desses mesmos pagamentos. Taxa nula não entra como zero estimado; a tela mostra quantas ficaram sem taxa.
- Valor líquido atual: soma do `net` dos pagamentos que estão `pago` agora. Reembolsado sai dessa soma.
- Reembolsos: soma do valor dos pagamentos `reembolsado`.
- Despesas: soma das despesas operacionais do período.
- Resultado operacional: valor líquido atual menos despesas.

Reembolso não é subtraído de novo em cima do líquido, porque o líquido atual já não inclui o reembolsado. Chargeback, neste gateway, chega como `payment.refunded` e entra na linha de reembolso. Não há módulo separado de defesa de MED.

Despesa tem descrição, categoria (`hospedagem`, `vps`, `ferramentas`, `servicos`, `marketing`, `outras`), valor em centavos, data e observação. Criar, editar e apagar gera auditoria.

Não há lançamento manual de taxa enquanto a KavroPay mandar `fee`. Se uma cobrança vier sem `fee`, o líquido daquela cobrança fica de fora do resultado e a tela mostra "taxa não informada". Não se inventa percentual.

## Funil e campanhas

Eventos append-only: `bot_started`, `presentation_sent`, `purchase_clicked`, `pix_generated`, `payment_pending`, `payment_approved`, `payment_expired`, `payment_refunded`, `delivery_started`, `delivery_completed`, `delivery_failed`, `recovery_sent`.

Cada evento tem id, usuário, tipo, pedido opcional, origem, campanha, data e metadados.

Funil, em usuários únicos no período, pela data do evento:

1. Iniciaram o bot (`bot_started`)
2. Apresentação enviada (`presentation_sent`)
3. Clicaram em comprar (`purchase_clicked`)
4. Geraram PIX (`pix_generated`)
5. Pagaram (`payment_approved`)
6. Receberam o conteúdo (`delivery_completed`)

Cada etapa mostra usuários, percentual sobre quem iniciou, conversão sobre a etapa anterior, quantidade que não avançou e percentual disso. "Não avançou" é a diferença para a etapa anterior, não uma suposição de motivo.

Campanha compara, pela origem do primeiro acesso: iniciados, PIX, pagos, faturamento bruto e conversão pago/iniciado.

## Painel

Autenticado. Primeiro administrador nasce das variáveis `ADMIN_EMAIL` e `ADMIN_PASSWORD` quando ainda não existe admin. Papéis: `owner` e `operator`. Owner configura bot, produto, gateway, despesas e outros admins. Operator consulta e reprocessa entrega. Toda ação de escrita grava auditoria (quem, o que, quando, antes e depois, sem segredo).

Telas:

- Dashboard: os indicadores da especificação, com a etapa de apresentação nomeada como envio, mais o financeiro definido acima. Atualização por consulta a cada 15 segundos enquanto a aba está aberta.
- Funil.
- Usuários: Telegram ID, username, nome, primeiro acesso, último acesso, origem, campanha, etapa atual, quantidade de PIX, quantidade de pagamentos, valor comprado, status da entrega. Busca por Telegram ID, nome ou username.
- Campanhas.
- Recuperação: quem está em cada abandono e o que já foi enviado.
- Pedidos: detalhe, transação, eventos, entrega e botão de reconciliar. Sem editar status à mão.
- Entregas: totais, fila, falhas, tentativas e reprocessar.
- Financeiro: indicadores, tabela de transações e despesas.
- Configurações: textos do bot, vídeos, produto, gateway e suporte.

Filtros em todos os relatórios: hoje, ontem, 7 dias, 30 dias, este mês, mês anterior e intervalo. Também produto, origem, campanha, status de pagamento e status de entrega, onde o dado existir. Exportação CSV e XLSX do conjunto filtrado.

Credenciais do bot e da KavroPay ficam cifradas (AES-256-GCM) com chave só no ambiente. A tela mostra os quatro últimos caracteres e permite substituir. Nunca devolve o valor inteiro.

## Dados

Tabelas: `users`, `products`, `orders`, `payments`, `payment_fees`, `payment_webhooks`, `deliveries`, `delivery_attempts`, `tracking_events`, `campaigns`, `recovery_messages`, `expenses`, `refunds`, `admin_users`, `audit_logs`, `settings`.

Invariantes:

- Um `users.telegram_id`.
- Um pagamento liquidado por pedido.
- Um `payment_webhooks.delivery_id`.
- Uma entrega por pedido.
- Pedido guarda o valor em centavos no momento da criação. Mudar o preço do produto não altera pedido já aberto.
- Só um produto com `ativo = true`.

## Processos

`docker-compose` sobe Postgres, Redis, API, worker e o painel. A API serve o webhook, o painel consome a API, o worker consome as filas `payment`, `delivery` e `recovery`. O mesmo código do backend, dois processos.

Telegram em long polling por padrão. Com `TELEGRAM_WEBHOOK_URL`, usa webhook.

Backup: todo dia, `pg_dump` num volume local, retenção de 7 dias. Cópia para fora da máquina fica para quando existir destino.

## Configuração de ambiente

Obrigatório para subir: `DATABASE_URL`, `REDIS_URL`, `SETTINGS_ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

Obrigatório para cobrar de verdade, gravado cifrado pelo painel ou por variável inicial: token do Telegram e chave `kvk_live_` ou `kvk_test_`. URL pública para o webhook da KavroPay.

## Critérios de aceite

- Dois `/start` do mesmo Telegram ID não criam dois usuários.
- Duas cobranças do mesmo usuário criam dois pedidos.
- Webhook com assinatura inválida não muda pedido.
- O mesmo `delivery id` duas vezes cria um pagamento e uma entrega.
- Valor divergente não entrega e marca `em_analise`.
- "Já paguei" com cobrança ainda `waiting_payment` não entrega.
- Pedido reembolsado não reenvia o vídeo.
- Falha de entrega fica registrada e o reprocesso autorizado envia de novo.
- Dashboard vazio mostra zero.
- Taxa ausente não vira zero nem percentual inventado.
- CSV exportado bate com o filtro da tela.

## O que fica com quem for construir

- Nomes exatos de campos e arquivos dentro dos módulos já nomeados.
- Biblioteca de XLSX e detalhes visuais do painel, desde que os indicadores, filtros e a regra de dinheiro acima permaneçam.
- Intervalo de atualização do painel entre 10 e 30 segundos.
- Texto padrão das mensagens, em português, editável nas configurações.
