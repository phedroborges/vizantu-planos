# Vizantu Planos

Publicador de apresentações HTML. A equipe envia um arquivo, define o título e o endereço, e recebe uma página pública pronta para compartilhar:

```text
https://planos.vizantu.com.br/plano-julho-terranet
```

## O que o app entrega

- Acesso direto ao painel, sem login.
- Upload de HTML por seleção ou arrastar e soltar.
- Endereço editável e atualização do mesmo link ao reenviar um plano.
- Lista pesquisável com tamanho e data de publicação.
- Ações para abrir, copiar o link e excluir.
- Páginas públicas com `noindex` para não aparecerem em buscadores.
- HTML publicado em sandbox de segurança, isolado do painel.
- Armazenamento persistente com Vercel Blob ou Netlify Blobs.

## Stack

- Next.js 16 com App Router
- React 19 e TypeScript
- Tailwind CSS 4
- Vercel Blob e Netlify Blobs
- Lucide Icons

## Publicar na Vercel

1. Importe este repositório em um novo projeto da Vercel.
2. Em **Storage**, crie um **Blob Store público** e conecte-o ao projeto.
3. A Vercel adicionará `BLOB_READ_WRITE_TOKEN` automaticamente.
4. Faça um novo deploy.

Não é necessário configurar `NEXT_PUBLIC_SITE_URL`: o domínio é detectado automaticamente. Depois do deploy, cada HTML enviado pelo painel fica disponível imediatamente no endereço escolhido.

## Publicar no Netlify

1. Conecte este repositório a um novo projeto no Netlify.
2. O arquivo `netlify.toml` configura o build automaticamente.
3. Acione **Deploys > Trigger deploy > Deploy site**.

O Netlify Blobs é provisionado automaticamente na primeira publicação. Não é necessário criar banco, token ou serviço de armazenamento.

### Variáveis

```env
# Criada automaticamente ao conectar um Vercel Blob Store ao projeto
BLOB_READ_WRITE_TOKEN=

# Opcional: o domínio é detectado automaticamente em produção
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Depois do deploy, qualquer HTML publicado pelo painel fica online imediatamente. Não é necessário um novo deploy para cada plano.

## Rodar localmente

```bash
pnpm install
pnpm dev
```

Em desenvolvimento, os arquivos ficam persistidos na pasta `.data`.

## Acesso e segurança

- O painel não exige login. Qualquer pessoa com o endereço pode publicar, substituir ou excluir planos.
- O limite padrão é 4 MB e apenas documentos HTML completos são aceitos.
- O HTML público recebe uma política CSP `sandbox` sem `allow-same-origin`.
- Os planos públicos são acessíveis para quem possui o link.

## Atualizar um plano

Publique novamente usando o mesmo endereço. O arquivo e os metadados são substituídos, mantendo o link já compartilhado.

## Comandos

```bash
pnpm lint
pnpm build
pnpm test:e2e
```
