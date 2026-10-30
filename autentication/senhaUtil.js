const crypto = require ('crypto')

class SenhaUtil {
  // Gera um salt aleatório
  static gerarSalt() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Gera o hash combinando a senha com salt usando SHA-256
  static gerarHash(senha, salt) {
    return crypto.createHmac('sha256', salt).update(senha).digest('hex');
  }

  // Verifica se a senha fornecida corresponde ao hash armazenado
  // static verificarSenha(senhaFornecida, salt, hashArmazenado) {
  //   const hashCalculado = this.gerarHash(senhaFornecida, salt);

  //   return hashCalculado === hashArmazenado;
  // }

}

module.exports = SenhaUtil;