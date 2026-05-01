const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const api = require('../utils/api');
const config = require('../utils/config');

async function login() {
  console.log(chalk.cyan.bold('\n🔐 MozHost - Login\n'));

  try {
    // Escolher método de login
    const { method } = await inquirer.prompt([
      {
        type: 'list',
        name: 'method',
        message: 'Como queres autenticar?',
        choices: [
          { name: '📧  Email e Senha', value: 'email' },
          { name: '🔵  Google', value: 'google' },
          { name: '⚫  GitHub', value: 'github' }
        ]
      }
    ]);

    // Login via Email e Senha (fluxo existente)
    if (method === 'email') {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'login',
          message: 'Username ou Email:',
          validate: input => input.length > 0 || 'Campo obrigatório'
        },
        {
          type: 'password',
          name: 'password',
          message: 'Password:',
          mask: '*',
          validate: input => input.length > 0 || 'Campo obrigatório'
        }
      ]);

      const spinner = ora('Autenticando...').start();
      const response = await api.login(answers);
      await config.setToken(response.token);
      await config.setUser(response.user);
      spinner.succeed(chalk.green('✅ Login realizado com sucesso!'));
      printUserInfo(response.user);
      return;
    }

    // Login via Google ou GitHub (Device Flow)
    const spinner = ora('Gerando link de autenticação...').start();
    const { token, url } = await api.cliDeviceStart();

    spinner.stop();

    console.log(chalk.yellow('\n🌐 Abre este link no teu browser:\n'));
    console.log(chalk.cyan.bold(`   ${url}&provider=${method}`));
    console.log(chalk.gray('\n⏳ Aguardando autenticação...'));
    console.log(chalk.gray('   (expira em 10 minutos)\n'));

    // Polling até autenticar ou expirar
    const pollSpinner = ora('Esperando...').start();
    const maxAttempts = 200; // 200 * 3s = 10 min
    let attempts = 0;

    const poll = setInterval(async () => {
      try {
        attempts++;

        if (attempts >= maxAttempts) {
          clearInterval(poll);
          pollSpinner.fail(chalk.red('❌ Tempo expirado. Tenta novamente.'));
          process.exit(1);
        }

        const res = await api.cliDevicePoll(token);

        if (res.status === 'authorized') {
          clearInterval(poll);
          await config.setToken(res.token);

          // Buscar info do utilizador
          const verify = await api.verify();
          await config.setUser(verify.user);

          pollSpinner.succeed(chalk.green(`✅ Autenticado como ${res.username}!`));
          printUserInfo(verify.user);

        } else if (res.status === 'expired') {
          clearInterval(poll);
          pollSpinner.fail(chalk.red('❌ Token expirado. Tenta novamente.'));
          process.exit(1);
        }

      } catch (err) {
        // Ignora erros de rede temporários durante polling
        if (err.response?.status === 404) {
          clearInterval(poll);
          pollSpinner.fail(chalk.red('❌ Token expirado. Tenta novamente.'));
          process.exit(1);
        }
      }
    }, 3000);

  } catch (error) {
    console.error(chalk.red('\n❌ Erro no login:'));

    if (error.response) {
      console.error(chalk.red(`   ${error.response.data.error || error.response.data.message}`));
    } else if (error.request) {
      console.error(chalk.red('   Não foi possível conectar à API'));
    } else {
      console.error(chalk.red(`   ${error.message}`));
    }

    process.exit(1);
  }
}

function printUserInfo(user) {
  console.log(chalk.gray('\nInformações da conta:'));
  console.log(chalk.white(`  Username: ${user.username}`));
  console.log(chalk.white(`  Email: ${user.email}`));
  console.log(chalk.white(`  Plano: ${user.plan}`));
  console.log(chalk.white(`  Containers: ${user.maxContainers}`));
  console.log(chalk.yellow(`  Coins: ${user.coins || 0}`));
}

async function logout() {
  try {
    const user = await config.getUser();

    if (!user) {
      console.log(chalk.yellow('⚠️  Você não está logado'));
      return;
    }

    await config.clearToken();
    console.log(chalk.green('✅ Logout realizado com sucesso!'));

  } catch (error) {
    console.error(chalk.red('❌ Erro ao fazer logout:'), error.message);
    process.exit(1);
  }
}

async function whoami() {
  try {
    const token = await config.getToken();

    if (!token) {
      console.log(chalk.yellow('⚠️  Você não está logado'));
      console.log(chalk.gray('   Use: mozhost auth'));
      return;
    }

    const spinner = ora('Verificando credenciais...').start();
    const response = await api.verify();
    spinner.stop();

    console.log(chalk.cyan.bold('\n👤 Usuário Atual\n'));
    console.log(chalk.white(`  Username: ${response.user.username}`));
    console.log(chalk.white(`  Email: ${response.user.email}`));
    console.log(chalk.white(`  Plano: ${response.user.plan}`));
    console.log(chalk.white(`  Max Containers: ${response.user.maxContainers}`));
    console.log(chalk.white(`  Max RAM: ${response.user.maxRamMb}MB`));
    console.log(chalk.white(`  Max Storage: ${response.user.maxStorageMb}MB`));
    console.log(chalk.yellow(`  Coins: ${response.user.coins || 0}`));
    console.log(chalk.gray(`\n  Email Verificado: ${response.user.emailVerified ? '✓' : '✗'}`));
    console.log(chalk.gray(`  WhatsApp Verificado: ${response.user.whatsappVerified ? '✓' : '✗'}`));
    console.log(chalk.gray(`  SMS Verificado: ${response.user.smsVerified ? '✓' : '✗'}`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao verificar usuário:'));

    if (error.response?.status === 401) {
      console.error(chalk.red('   Token inválido ou expirado'));
      console.log(chalk.gray('   Use: mozhost auth'));
    } else {
      console.error(chalk.red(`   ${error.message}`));
    }

    process.exit(1);
  }
}

module.exports = {
  login,
  logout,
  whoami
};