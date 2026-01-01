const chalk = require('chalk');
const ora = require('ora');
const WebSocket = require('ws');
const api = require('../utils/api');
const config = require('../utils/config');

// ============================================
// HELPER - Resolver Container
// ============================================
async function resolveContainer(identifier) {
  try {
    const response = await api.getContainer(identifier);
    return response.container;
  } catch (error) {
    if (error.response?.status === 404) {
      const listResponse = await api.listContainers();
      const found = listResponse.containers.find(c =>
        c.name === identifier ||
        c.id === identifier ||
        c.id.startsWith(identifier)
      );

      if (!found) {
        const similar = listResponse.containers.filter(c =>
          c.name.toLowerCase().includes(identifier.toLowerCase()) ||
          c.id.includes(identifier)
        );

        if (similar.length > 0) {
          console.log(chalk.yellow('\n💡 Você quis dizer:'));
          similar.forEach(c => {
            console.log(chalk.white(`   • ${c.name} ${chalk.gray(`(${c.id.slice(0, 8)})`)}`));
          });
        }

        throw new Error(`Container "${identifier}" não encontrado`);
      }

      return found;
    }
    throw error;
  }
}

// ============================================
// EXEC - Executar comando remoto
// ============================================
async function exec(containerIdentifier, command) {
  try {
    if (!command) {
      console.error(chalk.red('❌ Comando não especificado'));
      console.log(chalk.gray('   Use: mozhost exec <container> "<comando>"'));
      console.log(chalk.gray('   Exemplo: mozhost exec meu-bot "npm install"'));
      process.exit(1);
    }

    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(containerIdentifier);

    if (container.status !== 'running') {
      spinner.fail(chalk.red(`Container está ${container.status}, não rodando`));
      process.exit(1);
    }

    spinner.text = `Executando comando em ${container.name}...`;

    const response = await api.executeCommand(container.id, command);

    spinner.stop();

    console.log(chalk.cyan.bold(`\n📟 Executando em ${container.name}\n`));
    console.log(chalk.gray(`$ ${command}\n`));

    if (response.output) {
      console.log(response.output);
    }

    console.log();

    if (response.exitCode === 0) {
      console.log(chalk.green(`✅ Comando executado com sucesso (exit code: ${response.exitCode})`));
    } else {
      console.log(chalk.red(`❌ Comando falhou (exit code: ${response.exitCode})`));
      process.exit(response.exitCode);
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao executar comando:'));
    console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    process.exit(1);
  }
}

// ============================================
// SSH - Terminal interativo via WebSocket
// ============================================
async function ssh(containerIdentifier) {
  try {
    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(containerIdentifier);

    if (container.status !== 'running') {
      spinner.fail(chalk.red(`Container está ${container.status}, não rodando`));
      process.exit(1);
    }

    const token = await config.getToken();
    if (!token) {
      spinner.fail(chalk.red('Não autenticado'));
      console.log(chalk.gray('   Use: mozhost auth'));
      process.exit(1);
    }

    const apiUrl = await config.getApiUrl();
    const wsUrl = apiUrl
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');

    spinner.text = `Conectando ao terminal de ${container.name}...`;

    const ws = new WebSocket(
      `${wsUrl}/api/terminal/${container.id}?token=${token}`
    );

    ws.on('open', () => {
      spinner.stop();
      console.log(chalk.green(`\n✅ Conectado ao container ${chalk.bold(container.name)}`));
      console.log(chalk.gray('   Digite comandos normalmente. Ctrl+C para sair.\n'));

      // Configurar stdin para modo raw
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
      }

      // Enviar input do usuário para o WebSocket
      process.stdin.on('data', (key) => {
        // Ctrl+C para sair
        if (key === '\u0003') {
          console.log(chalk.yellow('\n\n👋 Desconectando...'));
          ws.close();
          process.exit(0);
        }

        // Enviar tecla para o container
        ws.send(JSON.stringify({
          type: 'input',
          data: key
        }));
      });
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'output') {
          process.stdout.write(message.data);
        } else if (message.type === 'error') {
          console.error(chalk.red(`\n❌ ${message.message}`));
          ws.close();
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Erro ao processar mensagem:', error.message));
      }
    });

    ws.on('error', (error) => {
      spinner.stop();
      console.error(chalk.red('\n❌ Erro de conexão:'));
      console.error(chalk.red(`   ${error.message}`));
      process.exit(1);
    });

    ws.on('close', () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      console.log(chalk.yellow('\n\n👋 Conexão encerrada'));
      process.exit(0);
    });

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao conectar:'));
    console.error(chalk.red(`   ${error.message}`));
    process.exit(1);
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  exec,
  ssh
};
