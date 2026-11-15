# Hot Vendas

Venda de um conteúdo digital no Telegram, com PIX pela KavroPay e painel da operação.

## Subir em desenvolvimento

1. `docker compose up -d postgres redis`
2. No `backend`: `npx prisma migrate deploy` e `npm run build && node dist/main.js`
3. No `frontend`: `npm run dev`
4. Abra `http://localhost:3000` com o e-mail e a senha de `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
5. Em Configurações, salve o token do Telegram e a chave `kvk_live_` ou `kvk_test_`. O painel mostra só os quatro últimos caracteres.
6. Para a confirmação automática, publique `PUBLIC_BASE_URL` em HTTPS e cadastre `https://seu-dominio/api/webhooks/kavro` na KavroPay.

O Postgres local usa a porta **5433**. A senha do exemplo é só para a máquina de desenvolvimento.

## O que o painel mostra

Os números saem de eventos e pagamentos gravados. Sem movimento, o painel fica em zero. Taxa que a KavroPay não enviar aparece como não informada.

O checkout não pede CPF. A cobrança vai só com o nome do Telegram.

## Downsell

Na tela Downsell você monta uma sequência de ofertas para quem gerou o PIX e não pagou. Cada downsell tem uma espera, uma mensagem e, se quiser, um preço próprio.

- A espera do primeiro conta do PIX mais recente da pessoa. A dos seguintes, do downsell anterior.
- Cada pessoa recebe cada downsell uma vez. O fluxo para quando ela paga, bloqueia o bot ou tem um pagamento em análise.
- O botão da mensagem gera um PIX com o preço daquele downsell. Sem preço, cobra o preço do produto. O pedido guarda de qual downsell veio.
- Na mensagem, `{nome}` vira o primeiro nome, `{preco}` o preço do downsell e `{preco_cheio}` o preço do produto.
- O fluxo nasce desligado e aceita até 10 downsells, com espera de até 30 dias cada.

A recuperação (Configurações) continua valendo ao mesmo tempo. Quem usa downsell costuma desligar as mensagens de "PIX em aberto" e "PIX expirado" para a pessoa não receber as duas coisas.
