# Publicação no GitHub Pages

O GitHub Pages publica arquivos estáticos. Os links entre as telas e os arquivos
HTML, CSS e JavaScript funcionam lá, mas login, cadastro e recuperação de senha
precisam do servidor Node.js deste projeto e não funcionam apenas com o Pages.

## Publicar a interface

1. Publique `index.html`, `style.css` e `front-end.js` no GitHub Pages. Os caminhos
   relativos usados pela página permitem publicar tanto em um domínio próprio
   quanto em `usuario.github.io/nome-do-repositorio`.
2. Hospede o servidor Node.js em um serviço que execute aplicações Node e configure
   nele as variáveis SMTP necessárias para envio dos códigos de recuperação.
3. Configure `FRONTEND_ORIGIN` no servidor com a origem exata do Pages, sem caminho,
   por exemplo `https://usuario.github.io`.
4. No `index.html`, informe a URL HTTPS pública do servidor no atributo
   `content` da meta `api-base-url`:

   ```html
   <meta name="api-base-url" content="https://seu-servidor.example">
   ```

O navegador envia cookies de sessão entre a interface e a API; por isso, a API
deve usar HTTPS e permitir credenciais somente para a origem configurada em
`FRONTEND_ORIGIN`. Não publique senhas, credenciais SMTP ou outros segredos no
HTML, JavaScript ou repositório.

Sem uma API configurada, o Pages ainda apresenta as telas, mas informa que as
operações de autenticação precisam do servidor. Senhas não são gravadas no
navegador como substituto do servidor.
