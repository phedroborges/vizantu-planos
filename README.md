# Vizantu Planos

Publicador interno de apresentações HTML. A equipe envia um arquivo, define o título e o endereço, e recebe uma página pública pronta para compartilhar:

```text
https://planos.vizantu.com.br/plano-julho-terranet
```

## O que o app entrega

- Painel protegido por senha compartilhada.
- Upload de HTML por seleção ou arrastar e soltar.
- Endereço editável e atualização do mesmo link ao reenviar um plano.
- Lista pesquisável com tamanho e data de publicação.
- Ações para abrir, copiar o link e excluir.
- Páginas públicas com `noindex` para não aparecerem em buscadores.
- HTML publicado em sandbox de segurança, isolado do painel administrativo.
- Netlify Blobs persistente, sem banco de dados ou configuração de storage.

## Stack

- Next.js 16 com App Router
- React 19 e TypeScript
- Tailwind CSS 4
- Netlify Blobs
- Lucide Icons

## Publicar no Netlify

1. Conecte este repositório a um novo projeto no Netlify.
2. O arquivo `netlify.toml` configura o build automaticamente.
3. Acesse **Project configuration > Environment variables**.
4. Cadastre `ADMIN_PASSWORD` com a senha que será usada pela equipe.
5. Acione **Deploys > Trigger deploy > Deploy site**.

O Netlify Blobs é provisionado automaticamente na primeira publicação. Não é necessário criar banco, token ou serviço de armazenamento.

### Variáveis

```env
# Obrigatória em produção
ADMIN_PASSWORD=uma-senha-forte

# Opcionais
SESSION_SECRET=um-segredo-aleatorio-com-32-ou-mais-caracteres
NEXT_PUBLIC_SITE_URL=https://seu-site.netlify.app
```

`SESSION_SECRET` é derivada da senha quando não for informada. A URL pública também é detectada automaticamente, então basta configurar `ADMIN_PASSWORD` para começar.

Depois do deploy, qualquer HTML publicado pelo painel fica online imediatamente. Não é necessário um novo deploy para cada plano.

## Rodar localmente

```bash
pnpm install
pnpm dev
```

Em desenvolvimento, a senha padrão é `vizantu-dev` e os arquivos ficam em memória. Eles são apagados quando o servidor reinicia.

Para testar localmente com outra senha, duplique `.env.example` como `.env.local` e altere `ADMIN_PASSWORD`.

## Segurança

- A senha nunca é enviada ao cliente nem armazenada no navegador.
- A sessão usa cookie `HttpOnly`, `SameSite=Lax` e assinatura HMAC.
- Upload, substituição e exclusão validam a sessão novamente no servidor.
- O limite padrão é 4 MB e apenas documentos HTML completos são aceitos.
- O HTML público recebe uma política CSP `sandbox` sem `allow-same-origin`.
- Os planos públicos são acessíveis somente para quem possui o link.

## Atualizar um plano

Publique novamente usando o mesmo endereço. O arquivo e os metadados são substituídos, mantendo o link já compartilhado.

## Comandos

```bash
pnpm lint
pnpm build
pnpm test:e2e
```
