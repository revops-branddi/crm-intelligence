<!-- guardiao:inicio v=e38f2c2f -->
## Regras do guardião

Bloco sincronizado de `revops-branddi/revops-guardiao`. **Não edite aqui** — a
edição se perde no próximo sync. Edite `blocos/comum.md` no guardião e rode
`scripts/sincronizar.ps1`. Suas regras próprias ficam fora dos marcadores.

### Vercel — nunca criar projeto

1. **Não rode `vercel deploy` para ver sua mudança.** Push da branch já gera
   preview automático pela integração de Git. O deploy manual duplica um serviço
   que já existe.
2. **Se o CLI perguntar "Set up and deploy?", a resposta é NÃO.** É esse prompt
   que cria projeto novo. Pare e peça ajuda a um humano.
3. **Nunca** crie, importe ou conecte um projeto Vercel — nem por `vercel link`,
   nem por `vercel git connect`, nem por ferramenta que crie projeto.
4. **Nunca** vincule um repo a um projeto cujo `rootDirectory` já seja usado por
   outro projeto. Cada push passa a buildar N vezes e os crons são agendados N
   vezes — com risco de disparo duplicado se o projeto extra tiver env de produção.
5. Antes de qualquer subida, confirme que existe `.vercel/project.json` no
   diretório alvo. É ele que amarra o comando ao projeto certo.

> Em 12/09/2026 um `vercel deploy` num diretório sem vínculo criou o projeto
> `api`, cópia do `apps/api` do Cecilia-CS, com os mesmos 58 crons e zero env
> vars. Em 15/09 ele consumiu **322 min de build num único dia** e disparou
> **2.820 invocações de cron, todas em `401`**. Nasceram 18 projetos assim.

### Produção — antes de mergear PR que dispara deploy

Confirme que o commit rodando em produção é igual ao HEAD da branch de deploy.
Se não for, o seu merge publica junto tudo que estiver parado lá.

Um deploy com `source=cli` parece "sem git", mas o objeto completo traz o commit:

```
GET /v13/deployments/{id}   ->  meta.gitCommitSha
GET /repos/{owner}/{repo}/compare/{prodSha}...{branch}
```

O `compare` diz exatamente quantos commits e arquivos subiriam junto. Se vier
mais que o seu, isso é decisão de release — não de quem abriu o PR.

### Identidade

Commit, push, merge e deploy em produção saem por uma conta autorizada pela
Branddi para o repositório e o destino corporativo. A autorização pode ser de
uma conta pessoal (`dtodres`, `Victor-Petroni`) ou compartilhada
(`comercialbranddi`); **ser pessoal não é impedimento**. Confira a conta ativa,
o remoto, as permissões e as regras específicas do projeto. Se a conta ativa
está autorizada, siga sem pedir troca de login ou confirmação adicional de
identidade. Se não está autorizada, **abra PR e pare** — não publique.

### Autoria — quem fez o PR

Só a conta compartilhada precisa dizer quem fez. Antes de abrir o PR, veja de
que conta ele sai: `gh api user --jq .login`.

**Conta pessoal** (`dtodres`, `Victor-Petroni`, qualquer login que não seja o
compartilhado): o login já diz quem é. **Não pergunte quem fez e não segure o
PR por isso.** A linha abaixo é opcional.

**Conta compartilhada** (`comercialbranddi`, e-mail `comercial@`): a descrição
do PR leva esta linha sozinha, exatamente neste formato:

```
Quem fez: Nome Sobrenome
```

1. É a **pessoa que pediu o trabalho a você**. Nessa conta, o `git config` e o
   e-mail do commit dizem só "comercial": não deduza deles, não invente.
2. **Resolva sozinho antes de perguntar.** Use o nome completo declarado pela
   pessoa nesta conversa. Sem declaração, no **Codex**, execute da raiz do repo:
   `node .agents/identificar-codex.mjs`. O comando consulta `account/read`, sem
   renovar tokens, e cruza o e-mail com o cadastro do time. Com
   `status=identificado`, use `nome` exatamente como retornado, sem confirmação.
3. Consulte o mesmo ambiente/`CODEX_HOME` da sessão em uso. Não troque conta nem
   use um CLI de outro usuário/host para identificar o solicitante. Conta
   compartilhada, e-mail desconhecido, comando ausente ou falha? Pergunte
   **uma vez** antes de abrir o PR. Nos outros agentes, use a identidade
   individual autenticada da sessão se disponível; senão, pergunte.
4. Não deduza pelo usuário do sistema, caminho de pasta, autor de commit ou
   responsável do chamado. Nome em `branddi.quemfez` ou memória de outra sessão
   não comprova quem está usando agora. Uma declaração atual prevalece.
5. Nome e sobrenome. Só o primeiro nome pode ser atribuído à pessoa errada.
6. Achou PR seu já aberto por essa conta sem a linha? Edite a descrição e
   acrescente.

> Na leitura de 15/10/2026, 644 PRs dos últimos 30 dias ficaram sem autoria
> confirmada (595 sem identificação e 49 apenas prováveis). O HUB lê `Quem fez:`
> neste formato. Conta pessoal continua sendo resolvida pelo login.

### Commit — e-mail que o GitHub reconhece

Antes do primeiro commit numa máquina, rode `git config user.email`. Se vier
e-mail da máquina (`fulano@Mac-mini.local`) ou qualquer um que não esteja na
conta do GitHub, a Vercel **recusa o deploy do PR inteiro** ("GitHub couldn't
verify an account for commit"). Corrija só neste repo, sem perguntar, com o
e-mail `noreply` da conta em uso:

```
git config user.email "$(gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com"')"
```

> Em 06/10/2026 o Cecilia-CS#1584 ficou sem preview por dois commits com
> `dt@Diegos-Mac-mini.local`, no meio de seis com o e-mail certo.
<!-- guardiao:fim -->
