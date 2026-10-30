const Autenticacao = require("./autenticacao")
const SenhaUtil = require("./senhaUtil")
const {readDatabase } = require('../Database/database');

class Recover {
  constructor() {
    this.autenticacao = new Autenticacao();
  }

  codigoRecuperarSenha(email, code, newPassword) {    

    console.log("Número máximo de tentativas excedido.");
    console.log("Deseja redefinir a senha?");


    const resposta = prompt("Digite 'sim' para redefinir a senha ou 'não' para tentar novamente: ");

    if (resposta === "sim") {
      return this.autenticacao.codigoRecuperarSenha(email, code, newPassword);
    }

  }

}
// redefinirSenha(email, novaSenha, confirmarSenha) {
//   return this.autenticacao.redefinirSenha(email, novaSenha, confirmarSenha);
// }


module.exports = Recover;