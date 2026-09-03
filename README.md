<div align="center">
  <img src="docs/dmmonitor-stevia.svg" width="130" alt="Logo DM Monitor com uma folha de estévia" />

  <h1>DM Monitor</h1>

  <p>Diário de glicemia com login Google e acompanhamento compartilhado entre usuários, familiares, cuidadores e profissionais de saúde.</p>

  <p>
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=111111" alt="React" />
    <img src="https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Go-1.26-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go" />
    <img src="https://img.shields.io/badge/PostgreSQL-17-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  </p>

  <p>
    <img src="https://img.shields.io/badge/Google-OIDC-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Google OpenID Connect" />
    <a href="https://github.com/alencarleandro/DmMonitor/actions/workflows/ci.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/alencarleandro/DmMonitor/ci.yml?style=for-the-badge&label=build" alt="Build" />
    </a>
  </p>

  <a href="#sobre-o-projeto">Sobre</a> ·
  <a href="#arquitetura">Arquitetura</a> ·
  <a href="#como-executar-localmente">Executar</a> ·
  <a href="#tutorial-de-uso">Tutorial</a> ·
  <a href="#testes">Testes</a>
</div>

## Sobre o projeto

O **DM Monitor** foi criado para simplificar o registro diário de glicemia e aproximar as pessoas que participam do cuidado de alguém com diabetes.

O sistema possui dois perfis:

| Perfil | Objetivo |
| --- | --- |
| **Usuário** | Registrar medições, consultar o próprio histórico e escolher quem pode acompanhar seus dados. |
| **Acompanhante** | Visualizar, em modo somente leitura, os diários compartilhados com sua conta Google. |

Cada medição registra:

- Valor da glicemia em `mg/dL`.
- Data e horário da medição.
- Momento: jejum, antes da refeição, após a refeição, antes de dormir ou outro.
- Observação opcional.

A tela inicial reúne as medições do dia, a última leitura, a média diária e a quantidade de registros.

> [!NOTE]
> O DM Monitor é um diário pessoal. Ele não interpreta resultados, não recomenda tratamentos e não substitui orientação médica.

## Stack utilizada

| Camada | Tecnologias |
| --- | --- |
| Frontend | React 19, TypeScript 5, Vite 7, Lucide React |
| Backend | Go 1.26, `net/http`, OpenID Connect e OAuth 2.0 |
| Banco de dados | PostgreSQL via pgx v5 |
| Autenticação | Google Identity, Authorization Code, PKCE, `state` e nonce |
| Infraestrutura | Docker, Docker Compose e imagem Alpine |
| Qualidade | Go Test, Go Vet e GitHub Actions |

## Funcionalidades

- Login com conta Google.
- Escolha do perfil no primeiro acesso.
- Cadastro e exclusão de medições de glicemia.
- Tabela de registros filtrada por dia.
- Cálculo da última medição, média e total diário.
- Autorização de acompanhante pelo e-mail da conta Google.
- Compartilhamento por código de convite.
- Código válido por sete dias e uma única utilização.
- Revogação de acesso pelo titular.
- Acompanhamento de vários diários pela mesma conta.
- Permissões de acompanhante somente para leitura.
- Interface responsiva para desktop e celular.
- Demonstração com dados fictícios sem persistência.

## Arquitetura

```text
Usuário ou acompanhante
         |
         | Interface responsiva
         v
React + TypeScript + Vite
         |
         | HTTP / JSON na mesma origem
         v
API Go + net/http
         |
         |-- Autenticação ------> Google OpenID Connect
         |
         |-- Sessões -----------> PostgreSQL
         |
         |-- Medições ----------> PostgreSQL
         |
         `-- Acessos e convites -> PostgreSQL
```

### Responsabilidades por camada

| Componente | Responsabilidade |
| --- | --- |
| React | Renderizar telas, formulários, tabela, resumo diário e estados da interface. |
| API Go | Validar entradas, autenticar sessões e aplicar todas as regras de autorização. |
| PostgreSQL | Persistir usuários, sessões, medições, acessos e convites. |
| Google Identity | Confirmar a identidade e o e-mail da conta usada no login. |

### Fluxo de login

```text
1. O visitante escolhe Usuário ou Acompanhante.
2. A API cria um nonce temporário vinculado ao navegador.
3. O botão Google Identity Services autentica a conta.
4. O frontend envia o ID token e o perfil escolhido à API.
5. A API valida o ID token e o e-mail verificado.
6. Uma sessão local é criada e enviada em cookie HttpOnly.
7. Cada requisição protegida valida novamente o perfil e a permissão.
```

### Fluxo de compartilhamento

```text
Por e-mail
Usuário -> autoriza e-mail -> acompanhante entra com o mesmo Google -> leitura liberada

Por código
Usuário -> gera convite -> compartilha código -> acompanhante resgata -> leitura liberada
```

Os códigos são armazenados apenas como hash. Depois do resgate, o código deixa de funcionar e o acesso fica vinculado à conta Google do acompanhante.

## Estrutura

```text
.
|-- backend/
|   |-- cmd/server/              # Inicialização da API
|   `-- internal/
|       |-- server/              # Rotas, OAuth, validações e permissões
|       `-- store/               # PostgreSQL e criação das tabelas
|-- docs/
|   `-- dmmonitor-stevia.svg     # Logo do projeto
|-- scripts/
|   |-- start-api.ps1            # Inicia a API no Windows
|   `-- test-api.ps1             # Executa testes e Go Vet
|-- web/
|   |-- public/
|   `-- src/                     # React, TypeScript e estilos
|-- .github/workflows/ci.yml     # Integração contínua
|-- compose.yaml                 # PostgreSQL e aplicação completa
|-- Dockerfile
`-- README.md
```

## Como executar localmente

### Pré-requisitos

- Node.js 22.12 ou superior. A versão 24 é recomendada.
- Go 1.26 ou superior.
- PostgreSQL 16 ou superior.
- Credencial OAuth do Google para testar o login real.

As portas padrão são:

| Serviço | URL |
| --- | --- |
| Frontend | `http://127.0.0.1:5175` |
| API | `http://127.0.0.1:8087` |
| Health check | `http://127.0.0.1:8087/healthz` |

### 1. Clone e instale

```bash
git clone https://github.com/alencarleandro/DmMonitor.git
cd DmMonitor
npm run install:web
```

### 2. Crie o arquivo de ambiente

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux ou macOS:

```bash
cp .env.example .env
```

Configure o `.env`:

```env
DMMONITOR_ENV=development
PORT=8087
PUBLIC_URL=http://127.0.0.1:5175
DATABASE_URL=postgres://dmmonitor:senha@localhost:5432/dmmonitor?sslmode=disable
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
STATIC_DIR=web/dist
```

O arquivo `.env` é ignorado pelo Git. Segredos reais nunca devem ser colocados no `.env.example`.

### 3. Configure o PostgreSQL

Use um banco dedicado e informe sua conexão em `DATABASE_URL`. O usuário precisa criar e manipular tabelas dentro desse banco, mas não precisa ser administrador do PostgreSQL.

Para iniciar um PostgreSQL isolado com Docker:

```bash
docker compose up -d postgres
```

Depois, use esta conexão:

```env
DATABASE_URL=postgres://dmmonitor:dmmonitor_local@127.0.0.1:5433/dmmonitor?sslmode=disable
```

As tabelas são criadas automaticamente no primeiro início da API usando `backend/internal/store/schema.sql`.

### 4. Configure o Google

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Configure a tela de consentimento OAuth.
3. Crie um **ID do cliente OAuth** do tipo **Aplicativo da Web**.
4. Em **Origens JavaScript autorizadas**, cadastre a origem usada para abrir o app:

```text
http://127.0.0.1:5175
```

5. Adicione o Client ID ao `.env`. O botão **Google Identity Services** precisa apenas desse identificador, sem API key nem Client Secret:

```env
GOOGLE_CLIENT_ID=seu-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=
```

6. Se o aplicativo Google estiver em modo de teste, cadastre as contas permitidas como usuários de teste.

Use exatamente a mesma origem de `PUBLIC_URL`. Para o Google, `localhost` e `127.0.0.1` são origens diferentes.

Se usar `localhost`, cadastre `http://localhost` e `http://localhost:5175` e ajuste `PUBLIC_URL`. No Docker completo, use a origem da porta `8087`. Se acessar pelo ARSENAL em `https://arsenal.dev.br/...`, a origem é `https://arsenal.dev.br`, sem o caminho: ela deve estar autorizada no Google e configurada em `PUBLIC_URL`.

É possível reutilizar um Client ID do tipo Web de outro projeto, desde que a origem do DM Monitor esteja autorizada nesse cliente. O nome apresentado na tela de consentimento será o configurado naquele projeto Google. Veja a [configuração oficial do Google Identity Services](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

Opcionalmente, ao preencher também `GOOGLE_CLIENT_SECRET`, o app usa o fluxo OAuth com redirecionamento. Nesse modo, cadastre `PUBLIC_URL` + `/auth/google/callback` nos **URIs de redirecionamento autorizados**.

Se aparecer **origin_mismatch** ou **The given origin is not allowed**, confira a origem cadastrada no Console. Se a API responder **Origem da requisição não autorizada**, ajuste `PUBLIC_URL` para a origem exata aberta no navegador. Reinicie a API depois de alterar o `.env`.

### 5. Inicie o frontend

```bash
npm run dev
```

### 6. Inicie a API

Em outro terminal no Windows:

```powershell
.\scripts\start-api.ps1
```

Se o ARSENAL usa `dmmonitor-arsenal.exe`, configure o comando de inicialização abaixo, com a raiz do repositório como diretório de trabalho. Ele recompila esse executável antes de iniciar, evitando que uma versão antiga continue sendo usada após atualizar o código:

```powershell
powershell -NoProfile -File .\scripts\start-api.ps1 -Arsenal
```

No Linux ou macOS:

```bash
mkdir -p .tmp
go -C backend build -o ../.tmp/dmmonitor ./cmd/server
./.tmp/dmmonitor
```

Abra [http://127.0.0.1:5175](http://127.0.0.1:5175).

### Demonstração sem Google e banco

Para conhecer a interface rapidamente:

```bash
npm run install:web
npm run dev
```

Na tela inicial, escolha um perfil e clique em **Explorar demonstração**. As informações são fictícias, ficam apenas na memória do navegador e desaparecem ao sair ou recarregar a página.

### Executar tudo com Docker

```bash
docker compose --profile full up --build
```

Abra `http://127.0.0.1:8087`. Nesse modo, a API Go também entrega o React compilado. Cadastre o callback Google usando a porta `8087` e defina `DOCKER_PUBLIC_URL` caso use outra origem.

## Tutorial de uso

### Registrar uma medição

1. Na página de entrada, selecione **Quero registrar**.
2. Clique em **Continuar com o Google**.
3. Na página **Minhas medições**, clique em **Lançar medição**.
4. Informe o valor da glicemia.
5. Escolha a data, o horário e o momento da medição.
6. Adicione uma observação, se desejar.
7. Clique em **Salvar medição**.

A tabela é atualizada após o cadastro. Use as setas ou o calendário para consultar outro dia. Para remover um registro, clique na lixeira da linha e confirme.

### Autorizar por e-mail

1. Entre no perfil de usuário.
2. Abra **Compartilhamento**.
3. Informe o e-mail exato da conta Google do acompanhante.
4. Clique em **Autorizar acompanhante**.
5. Oriente a pessoa a entrar selecionando **Quero acompanhar**.

O e-mail pode ser autorizado antes do primeiro login do acompanhante. O vínculo será concluído quando essa pessoa entrar com a conta Google correspondente.

### Convidar por código

1. Entre no perfil de usuário e abra **Compartilhamento**.
2. Clique em **Gerar código de convite**.
3. Copie e envie o código diretamente ao acompanhante.
4. O acompanhante entra com Google e abre **Meus vínculos**.
5. Ele informa o código e clica em **Conectar diário**.

O código vale por sete dias e uma utilização. Gerar outro código invalida o anterior.

### Acompanhar medições

1. Na entrada, selecione **Quero acompanhar**.
2. Entre com a conta Google autorizada.
3. Escolha a pessoa em **Diário acompanhado**.
4. Navegue pelas datas para consultar as medições.

O acompanhante tem acesso somente para leitura. Ele não pode cadastrar, excluir ou compartilhar medições.

### Revogar um acesso

1. Entre no perfil de usuário.
2. Abra **Compartilhamento**.
3. Localize o e-mail autorizado.
4. Clique na lixeira e confirme **Revogar**.

As próximas consultas desse acompanhante serão bloqueadas pela API.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DMMONITOR_ENV` | Sim | `development` ou `production`. O prefixo evita conflito com variáveis de outros projetos. |
| `PORT` | Sim | Porta da API Go. Padrão: `8087`. |
| `PUBLIC_URL` | Sim | Origem pública da interface, sem barra final. |
| `DATABASE_URL` | Sim | Conexão PostgreSQL da aplicação. |
| `GOOGLE_CLIENT_ID` | Em produção | ID do cliente OAuth do Google. |
| `GOOGLE_CLIENT_SECRET` | Não | Opcional: seleciona o fluxo OAuth com redirecionamento. Vazio usa Google Identity Services. |
| `STATIC_DIR` | Sim | Diretório do build React servido pelo Go. |
| `DOCKER_PUBLIC_URL` | No Compose | Origem usada ao executar a aplicação completa via Docker. |

## Endpoints principais

| Método | Endpoint | Objetivo |
| --- | --- | --- |
| `GET` | `/healthz` | Verifica a conexão da API com o banco. |
| `GET` | `/api/config` | Informa se o login Google está configurado. |
| `POST` | `/api/auth/google/challenge` | Prepara um nonce vinculado ao navegador para o login. |
| `POST` | `/api/auth/google` | Valida o ID token Google e cria a sessão do perfil escolhido. |
| `GET` | `/auth/google?role=user\|companion` | Inicia o fluxo opcional com Client Secret. |
| `GET` | `/auth/google/callback` | Processa o retorno desse fluxo OAuth. |
| `GET` | `/api/me` | Retorna a conta autenticada. |
| `POST` | `/api/logout` | Encerra a sessão atual. |
| `GET` | `/api/measurements` | Lista medições autorizadas por data. |
| `POST` | `/api/measurements` | Cadastra uma medição do titular. |
| `DELETE` | `/api/measurements/:id` | Exclui uma medição do titular. |
| `GET` | `/api/access` | Lista acompanhantes autorizados. |
| `POST` | `/api/access` | Autoriza um e-mail. |
| `DELETE` | `/api/access/:id` | Revoga um acesso. |
| `POST` | `/api/invites` | Gera um código de convite. |
| `POST` | `/api/invites/redeem` | Resgata um código. |
| `GET` | `/api/patients` | Lista diários disponíveis ao acompanhante. |

Exemplo de consulta diária:

```http
GET /api/measurements?date=2026-09-03&tz=America/Sao_Paulo&patientId=...
```

`patientId` pode ser omitido pelo titular. As datas são filtradas no fuso IANA informado e os instantes são armazenados como `timestamptz`.

## Testes

Compile o frontend:

```bash
npm run build
```

No Windows, execute testes unitários, integração PostgreSQL e Go Vet:

```powershell
.\scripts\test-api.ps1
```

Execução manual:

```bash
cd backend
go test ./...
go vet ./...
```

Para incluir a integração com PostgreSQL:

```bash
TEST_DATABASE_URL='postgres://usuario:senha@localhost:5432/dmmonitor_test?sslmode=disable' go test -race ./...
```

Os testes de integração criam um esquema temporário `dmmonitor_test_*` e removem apenas esse esquema ao terminar. Eles cobrem isolamento de usuários, permissões, validações, persistência, acessos por e-mail, convites, expiração, limitação de tentativas, revogação e sessões.

## Segurança

- Cookies de sessão `HttpOnly` e `SameSite=Lax`.
- Cookies `Secure` quando a aplicação usa HTTPS.
- Tokens de sessão e códigos de convite armazenados como hash.
- Consultas SQL parametrizadas.
- Validação de assinatura, emissor, audiência, expiração, nonce e e-mail no login Google.
- Proteção de origem nas operações que alteram dados.
- Limitação de tentativas no resgate de códigos.
- Permissões aplicadas na API e nas consultas ao banco.
- Inicialização de produção bloqueada sem HTTPS e credenciais Google.

Antes de armazenar medições reais em produção, configure TLS no PostgreSQL, backups, monitoramento, retenção de dados e controle de acesso à infraestrutura.

## Produção

1. Compile o React e o Go ou use o `Dockerfile`.
2. Configure `DMMONITOR_ENV=production`.
3. Use um domínio HTTPS em `PUBLIC_URL`.
4. Cadastre esse domínio nas origens JavaScript autorizadas do cliente Google.
5. Configure `DATABASE_URL` e `GOOGLE_CLIENT_ID` no ambiente. Proteja as credenciais do banco; o Client ID é público. `GOOGLE_CLIENT_SECRET` só é necessário no fluxo opcional por redirecionamento.
6. Mantenha frontend e API na mesma origem atrás de um proxy HTTPS.

<div align="center">
  <br />
  <sub>DM Monitor · pequenos registros para um cuidado mais próximo.</sub>
</div>
