# Deploy do Vizantu Planos na VPS (EasyPanel)

Este guia sobe o sistema numa VPS com **EasyPanel**, usando o repositório Git e um
**volume persistente** para os dados. O armazenamento é local em disco (sem Vercel/Netlify Blob).

## Visão geral

- **Build:** Dockerfile (na raiz do repo) — Next.js 16 + pnpm 11 + Node 22.
- **Runtime:** o container escuta na porta `3000`.
- **Dados:** planos, metadados e aprovações ficam em `DATA_DIR` (`/data`) — precisa de um **volume persistente**, senão cada deploy apaga tudo.
- **Domínio/SSL:** o EasyPanel cuida do proxy reverso e do certificado (Let's Encrypt).

## Passo a passo

### 1. DNS
Crie um registro **A** do subdomínio (ex.: `planos.metricz.com.br`) apontando para o **IP da VPS**.

### 2. Criar o serviço no EasyPanel
- **Project** → **+ Service** → **App**.
- **Source:** GitHub → selecione o repo `phedroborges/vizantu-planos`, branch `main`.
  (Autorize o GitHub no EasyPanel se ainda não tiver feito.)

### 3. Build
- **Build type:** `Dockerfile`.
- **Dockerfile path:** `./Dockerfile` (padrão).

### 4. Variáveis de ambiente
Em **Environment**, defina:

```
STORAGE_DRIVER=local
DATA_DIR=/data
NEXT_PUBLIC_SITE_URL=https://planos.metricz.com.br
```

> Ajuste `NEXT_PUBLIC_SITE_URL` para o seu subdomínio real (com `https://`).
> **Não** defina `BLOB_READ_WRITE_TOKEN` aqui — isso é só da Vercel.

### 5. Volume persistente (essencial)
Em **Mounts** (ou **Volumes**) → **+ Volume**:
- **Type:** Volume
- **Name:** `vizantu-planos-data`
- **Mount path:** `/data`

Isso preserva os planos e aprovações entre deploys e reinícios.

### 6. Porta / Proxy
- **Port:** `3000` (o container expõe 3000).
- Em **Domains** → **+ Domain:** adicione `planos.metricz.com.br`, habilite **HTTPS**.
  O EasyPanel emite o certificado automaticamente.

### 7. Deploy
Clique em **Deploy**. A cada `git push` na branch `main`, o EasyPanel rebuilda e publica.

## Verificação pós-deploy
1. Acesse `https://planos.metricz.com.br` — o painel deve abrir.
2. Publique um HTML de teste e confirme que o link `/{slug}` abre.
3. Faça um redeploy e confirme que o plano de teste **continua lá** (prova do volume persistente).

## Migração dos planos que estão na Vercel (opcional)
Os planos atuais vivem no Vercel Blob e **não** vêm automaticamente. Duas opções:
- **Simples:** re-suba os HTML pelo painel novo (você tem os arquivos).
- **Migrar os dados:** baixar os blobs de `vizantu-planos/{plans,metadata,approvals}` e colocá-los
  na mesma estrutura dentro do volume `/data`. Posso gerar um script para isso quando quiser.

## Rodar localmente com Docker (opcional, para testar)
```bash
docker build -t vizantu-planos .
docker run -p 3000:3000 -e NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
  -v vizantu-planos-data:/data vizantu-planos
```
