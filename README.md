# DM Monitor

Diário de glicemia em **React + TypeScript**, com API em **Go** e banco **PostgreSQL**.

## O que está implementado

- Login Google via OpenID Connect, com escolha de perfil no primeiro acesso.
- Perfil **usuário**: tabela das medições por dia, resumo diário, lançamento e exclusão com confirmação.
- Registro do valor em mg/dL, data/hora, momento da medição e observação opcional.
- Perfil **acompanhante**: consulta de um ou mais diários autorizados, somente leitura.
- Compartilhamento por e-mail da conta Google, inclusive antes do primeiro login do acompanhante.
- Convite com código aleatório exclusivo, válido por sete dias e uma utilização. Gerar outro substitui o anterior.
- Revogação de acesso pelo titular, aplicada às próximas consultas à API.
- Interface responsiva em português e demonstração com dados fictícios em memória.

O perfil fica associado à conta no primeiro login. Selecionar outro perfil na tela inicial não muda o perfil já cadastrado. Um acompanhante pode acessar vários diários. O titular pode ter vários acompanhantes.

Os indicadores mostram apenas valor, quantidade e média dos registros; o app não classifica valores nem sugere condutas médicas. A faixa técnica aceita pelo formulário é de 1 a 1500 mg/dL, sem representar uma faixa clínica desejável.

## Ambiente local

Pré-requisitos: Node.js 22.12+ (ou 24), Go 1.26+ e PostgreSQL 16+.

As portas padrão são **5175** para React e **8087** para Go, para coexistir com outros projetos locais.

```powershell
# Na raiz do projeto
Copy-Item .env.example .env  # somente se o arquivo ainda não existir
npm run install:web
npm run dev
```

Em outro terminal, configure `DATABASE_URL` no `.env` e inicie a API:

```powershell
.\scripts\start-api.ps1
```

O script usa o Go instalado no sistema ou a cópia portátil em `.tools/go`, se houver. Compila a API, inicia na raiz e carrega o `.env` sem sobrescrever variáveis já definidas no ambiente.

Em Linux/macOS:

```sh
go -C backend build -o ../.tmp/dmmonitor ./cmd/server
./.tmp/dmmonitor
```

Acesse **http://127.0.0.1:5175**. O Vite encaminha `/api` e `/auth` para o Go; não é necessário liberar CORS. `/healthz` está disponível diretamente em **http://127.0.0.1:8087/healthz**.

Para verificar a interface antes de configurar o Google, selecione um perfil e clique em **Explorar demonstração**. Os dados dessa opção não são enviados ao servidor e desaparecem ao sair ou recarregar a página. A demonstração não cria sessões autenticadas na API.

### PostgreSQL

O `.env` local desta implementação já foi configurado para o banco `dmmonitor`, com o usuário exclusivo `dmmonitor_app`, no PostgreSQL local. A senha administrativa não é utilizada pela aplicação. Nenhuma credencial fica no código ou no Git.

Para outra instalação, crie um banco e um usuário próprios e configure:

```dotenv
DATABASE_URL=postgres://usuario:senha@host:5432/dmmonitor?sslmode=require
```

Codifique caracteres especiais do usuário e senha na URL. Em conexões locais pode ser usado `sslmode=disable`; em ambientes remotos, configure TLS conforme o provedor, preferindo `verify-full` com uma CA válida.

As tabelas são inicializadas no primeiro início da API, dentro de uma transação protegida por lock. O esquema está em `backend/internal/store/schema.sql`. A aplicação precisa de permissão para criar as próprias tabelas no banco dedicado; não precisa de privilégios para criar bancos, criar usuários ou atuar como superusuário.

### Login com Google

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), configure a tela de consentimento OAuth.
2. Crie uma credencial OAuth do tipo **Aplicativo da Web** para o DM Monitor.
3. Cadastre exatamente este **URI de redirecionamento autorizado**:

   ```text
   http://127.0.0.1:5175/auth/google/callback
   ```

4. Preencha o `.env`:

   ```dotenv
   GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=seu-client-secret
   PUBLIC_URL=http://127.0.0.1:5175
   ```

5. Se a tela de consentimento estiver em modo de teste, inclua as contas permitidas como usuários de teste. Reinicie a API e atualize a página.

Use sempre a origem cadastrada: `localhost` e `127.0.0.1` são origens diferentes. Em produção, altere `PUBLIC_URL` para o domínio HTTPS e cadastre o mesmo caminho `/auth/google/callback` no Google.

O backend faz a troca do código e valida assinatura, emissor, audiência, expiração, nonce e e-mail verificado do ID token, conforme o [fluxo OpenID Connect do Google](https://developers.google.com/identity/openid-connect/openid-connect). O segredo nunca é enviado ao React. A configuração real do OAuth é necessária para testar o login Google de ponta a ponta.

## Compartilhamento

**Por e-mail:** o usuário abre Compartilhamento, autoriza o e-mail e orienta a pessoa a entrar com essa conta Google como acompanhante. Se a conta ainda não existir, a autorização fica pendente até o login. O app registra a autorização, sem enviar e-mails automaticamente.

**Por código:** o usuário gera um código e o compartilha diretamente. O acompanhante entra com Google, abre Meus vínculos e cola o código. O código é consumido e o acesso fica associado à conta Google. O titular pode revogar esse acesso na lista de e-mails autorizados.

O código é exibido somente ao gerar e é armazenado no banco apenas como hash. Um código novo invalida o anterior. Tentativas de resgate são limitadas a cinco por minuto por sessão. Acompanhantes não podem lançar, excluir ou compartilhar medições, inclusive por chamadas diretas à API.

## Testes

```powershell
npm run build
.\scripts\test-api.ps1
```

O script de testes usa `TEST_DATABASE_URL`, se definida, ou o `DATABASE_URL` do `.env` local. Ele cria um esquema aleatório `dmmonitor_test_*` no banco indicado e remove somente esse esquema ao terminar. Execute apenas em um banco dedicado ao app ou de testes. Não execute apontando para bancos de outros aplicativos.

Alternativa manual:

```sh
cd backend
go test ./...
TEST_DATABASE_URL='postgres://usuario:senha@localhost:5432/dmmonitor_test?sslmode=disable' go test -race ./...
go vet ./...
```

Sem `TEST_DATABASE_URL`, os testes unitários rodam e a integração PostgreSQL é marcada como ignorada. A integração cobre isolamento de usuários, permissões de acompanhante, persistência, autorização por e-mail, vínculo pendente, rotação e consumo de convites, expiração, limitação de tentativas, revogação, proteção de origem, encerramento de sessão e datas por fuso horário. O CI executa build e testes em PostgreSQL isolado.

## Docker

Banco opcional para desenvolvimento, separado do PostgreSQL já instalado:

```sh
docker compose up -d postgres
```

Esse banco fica em `127.0.0.1:5433`, com banco/usuário `dmmonitor` e senha local padrão `dmmonitor_local`. Configure essa conexão no `.env` se optar por usá-lo. Os dados ficam no volume `dmmonitor_pg`.

Para executar React, Go e esse PostgreSQL juntos:

```sh
docker compose --profile full up --build
```

Acesse **http://127.0.0.1:8087**. Nessa modalidade, o próprio Go serve o React compilado. Cadastre o callback do Google com a porta 8087. Use `DOCKER_PUBLIC_URL` para alterar a origem do app no Compose. A imagem final executa com usuário sem privilégios.

## Produção

- Compile o React e o Go, ou use o Dockerfile.
- Configure `APP_ENV=production`, `PUBLIC_URL=https://seu-dominio`, `DATABASE_URL` e as duas credenciais Google.
- Coloque a aplicação atrás de um proxy HTTPS e mantenha UI e API na mesma origem.
- Configure backups e controle de acesso ao PostgreSQL antes de armazenar registros reais.

Em produção, a API recusa iniciar sem HTTPS e Google configurado. Sessões usam cookies `HttpOnly`, `Secure` em HTTPS e `SameSite=Lax`; seus tokens ficam somente como hash no banco. Mutações exigem a origem configurada e um cabeçalho próprio. Fluxos OAuth usam `state`, nonce e PKCE; sessões e convites têm expiração. Não há login de desenvolvimento que possa contornar o Google.

## Estrutura

```text
web/                         React, estilos e cliente HTTP
backend/cmd/server/          Inicialização, ambiente e encerramento do Go
backend/internal/server/     Rotas, autenticação, validações e testes
backend/internal/store/      PostgreSQL e esquema inicial
scripts/                     Execução e testes no Windows
.github/workflows/ci.yml      Build e testes com PostgreSQL
```

### API

| Método | Rota | Acesso |
| --- | --- | --- |
| GET | `/api/config` | Público; informa se o Google está habilitado |
| GET | `/auth/google?role=user\|companion` | Inicia o login |
| GET | `/auth/google/callback` | Retorno OAuth |
| GET | `/api/me` | Conta autenticada |
| POST | `/api/logout` | Encerra a sessão |
| GET | `/api/measurements?date=AAAA-MM-DD&tz=America/Sao_Paulo&patientId=...` | Titular ou acompanhante autorizado |
| POST | `/api/measurements` | Titular |
| DELETE | `/api/measurements/:id` | Titular da medição |
| GET, POST | `/api/access` | Titular |
| DELETE | `/api/access/:id` | Titular da autorização |
| POST | `/api/invites` | Titular |
| POST | `/api/invites/redeem` | Acompanhante |
| GET | `/api/patients` | Acompanhante |
| GET | `/healthz` | Estado da conexão com o banco |

`patientId` pode ser omitido para consultar o próprio diário. Datas são filtradas no fuso IANA informado, com limites corretos nos dias de mudança de horário de verão. A API armazena instantes em `timestamptz`.
