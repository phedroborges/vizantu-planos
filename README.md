# Vizantu Planos

Publicador interno de apresentações HTML. A equipe envia um arquivo, define o título e o endereço, e recebe uma página pública pronta para compartilhar:

```text
https://planos.vizantu.com.br/plano-julho-terranet
```

## O que o app entrega

- Painel protegido por senha compartilhada.
- Upload de HTML por seleção ou arrastar e soltar.
- Slug editável e atualização do mesmo link ao reenviar um plano.
- Lista pesquisável com tamanho e data de publicação.
- Ações para abrir, copiar o link e excluir.
- Páginas públicas com `noindex` para não aparecerem em buscadores.
- HTML publicado em sandbox de segurança, isolado do painel administrativo.
- Armazenamento local durante o desenvolvimento e Vercel Blob em produção.

## Stack

- Next.js 16 com App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Vercel Blob
- Lucide Icons

## Rodar localmente

1. Instale as dependências:

```bash
pnpm install
```

2. Duplique `.env.example` como `.env.local` e configure:

```env
ADMIN_PASSWORD=uma-senha-forte
SESSION_SECRET=um-segredo-aleatorio-com-32-ou-mais-caracteres
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

3. Inicie o projeto:

```bash
pnpm dev
```

Sem `BLOB_READ_WRITE_TOKEN`, o app usa memória temporária. Isso permite testar todo o fluxo antes de conectar a infraestrutura; os uploads locais são apagados ao reiniciar o servidor.

## Publicar na Vercel

1. Importe este repositório em um novo projeto da Vercel.
2. No projeto, abra **Storage**, crie um **Blob Store** e conecte-o ao projeto.
3. A Vercel criará `BLOB_READ_WRITE_TOKEN` automaticamente.
4. Configure as variáveis `ADMIN_PASSWORD`, `SESSION_SECRET` e `NEXT_PUBLIC_SITE_URL`.
5. Faça o deploy e conecte o domínio desejado, como `planos.vizantu.com.br`.

Depois disso, qualquer HTML publicado pelo painel fica online imediatamente. Um novo deploy não é necessário para cada plano.

## Segurança

- A senha nunca é enviada ao cliente nem armazenada no navegador.
- A sessão usa cookie `HttpOnly`, `SameSite=Lax` e assinatura HMAC.
- Upload, substituição e exclusão validam a sessão novamente no servidor.
- O limite padrão é 4 MB e apenas documentos HTML completos são aceitos.
- O HTML público recebe uma política CSP `sandbox` sem `allow-same-origin`. Scripts do documento continuam funcionando, mas não conseguem acessar cookies ou dados do painel.
- Planos públicos são acessíveis por quem possui o link. A versão atual não adiciona senha individual por cliente.

## Atualizar um plano

Publique novamente usando o mesmo slug. O arquivo e os metadados são substituídos, mantendo o endereço compartilhado.

## Comandos

```bash
pnpm lint
pnpm build
pnpm dev
```
