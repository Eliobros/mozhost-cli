const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const api = require('../utils/api');

// ============================================
// git:auth - Autenticar com GitHub via Device Flow
// ============================================
async function auth() {
  try {
    console.log(chalk.cyan.bold('\n🔑 Conectar GitHub\n'));

    const spinner = ora('Iniciando autenticação...').start();
    const response = await api.githubDeviceStart();
    spinner.stop();

    console.log(chalk.yellow.bold(`\n📋 Código: ${response.user_code}\n`));
    console.log(chalk.white(`1. Acesse: ${chalk.cyan.underline(response.verification_uri)}`));
    console.log(chalk.white(`2. Cole o código: ${chalk.yellow.bold(response.user_code)}`));
    console.log(chalk.white('3. Autorize o acesso\n'));

    const pollSpinner = ora('Aguardando autorização no navegador...').start();

    const interval = (response.interval || 5) * 1000;
    const maxAttempts = Math.floor((response.expires_in || 900) / (response.interval || 5));

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, interval));

      try {
        const pollResult = await api.githubDevicePoll(response.device_code);

        if (pollResult.status === 'connected') {
          pollSpinner.succeed(chalk.green(`✅ GitHub conectado como @${pollResult.github_username}`));
          return;
        }

        if (pollResult.status === 'slow_down') {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        if (error.response?.status === 400) {
          pollSpinner.fail(chalk.red('❌ Código expirado. Tente novamente.'));
          return;
        }
      }
    }

    pollSpinner.fail(chalk.red('❌ Tempo esgotado. Tente novamente.'));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao autenticar:'));
    console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    process.exit(1);
  }
}

// ============================================
// git:status - Ver status da conexão GitHub
// ============================================
async function status() {
  try {
    const spinner = ora('Verificando conexão GitHub...').start();
    const response = await api.githubStatus();
    spinner.stop();

    if (response.connected) {
      console.log(chalk.green(`\n✅ GitHub conectado como @${response.github_username}\n`));
    } else {
      console.log(chalk.yellow('\n⚠️  GitHub não conectado'));
      console.log(chalk.gray('   Use: mozhost git:auth\n'));
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao verificar status:'));
    console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    process.exit(1);
  }
}

// ============================================
// git:repos - Listar repositórios do GitHub
// ============================================
async function repos() {
  try {
    const spinner = ora('Carregando repositórios...').start();
    const response = await api.githubRepos();
    spinner.stop();

    if (!response.repos || response.repos.length === 0) {
      console.log(chalk.yellow('\n⚠️  Nenhum repositório encontrado\n'));
      return;
    }

    console.log(chalk.cyan.bold(`\n📦 Seus Repositórios (${response.repos.length})\n`));

    for (const repo of response.repos) {
      const visibility = repo.private ? chalk.red('🔒 privado') : chalk.green('🌍 público');
      console.log(chalk.white(`  ${chalk.bold(repo.full_name)}  ${visibility}`));
      console.log(chalk.gray(`    Branch: ${repo.default_branch} | ${repo.url}`));
    }

    console.log();

  } catch (error) {
    if (error.response?.status === 404) {
      console.log(chalk.yellow('\n⚠️  GitHub não conectado'));
      console.log(chalk.gray('   Use: mozhost git:auth\n'));
      return;
    }
    console.error(chalk.red('\n❌ Erro ao listar repositórios:'));
    console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    process.exit(1);
  }
}

// ============================================
// git:connect <container> - Conectar repo a container
// ============================================
async function connect(containerId) {
  try {
    console.log(chalk.cyan.bold('\n🔗 Conectar Repositório ao Container\n'));

    // Se não passou container, listar para selecionar
    if (!containerId) {
      const listSpinner = ora('Carregando containers...').start();
      const containersRes = await api.listContainers();
      listSpinner.stop();

      if (!containersRes.containers || containersRes.containers.length === 0) {
        console.log(chalk.red('\n❌ Nenhum container encontrado'));
        return;
      }

      const { selectedContainer } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedContainer',
          message: 'Selecione o container:',
          choices: containersRes.containers.map(c => ({
            name: `${c.name} (${c.type}) - ${c.status}`,
            value: c.id
          }))
        }
      ]);

      containerId = selectedContainer;
    }

    // Listar repositórios
    const repoSpinner = ora('Carregando repositórios...').start();
    const reposRes = await api.githubRepos();
    repoSpinner.stop();

    if (!reposRes.repos || reposRes.repos.length === 0) {
      console.log(chalk.red('\n❌ Nenhum repositório encontrado'));
      console.log(chalk.gray('   Verifique se o GitHub está conectado: mozhost git:status'));
      return;
    }

    // Selecionar repositório
    const { selectedRepo } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedRepo',
        message: 'Selecione o repositório:',
        choices: reposRes.repos.map(r => ({
          name: `${r.full_name} ${r.private ? '🔒' : '🌍'} (${r.default_branch})`,
          value: r
        }))
      }
    ]);

    // Listar branches do repositório selecionado
    const [owner, repo] = selectedRepo.full_name.split('/');
    const branchSpinner = ora('Carregando branches...').start();
    const branchesRes = await api.githubBranches(owner, repo);
    branchSpinner.stop();

    let branch = selectedRepo.default_branch;

    if (!branchesRes.branches || branchesRes.branches.length === 0) {
      console.log(chalk.yellow(`\n⚠️  Nenhuma branch encontrada, usando: ${branch}`));
    } else {
      // SEMPRE mostra seleção de branch, independente de quantas existem
      const { selectedBranch } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedBranch',
          message: 'Selecione a branch:',
          choices: branchesRes.branches.map(b => ({
            name: `${b.name} ${b.name === selectedRepo.default_branch ? chalk.gray('(default)') : ''}`,
            value: b.name
          }))
        }
      ]);
      branch = selectedBranch;
    }

    // Confirmar
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Conectar ${chalk.cyan(selectedRepo.full_name)}@${chalk.yellow(branch)} ao container?`,
        default: true
      }
    ]);

    if (!confirm) {
      console.log(chalk.gray('\nOperação cancelada.'));
      return;
    }

    // Conectar
    const connectSpinner = ora('Conectando repositório e clonando código...').start();
    const result = await api.githubConnect({
      container_id: containerId,
      repo_url: selectedRepo.url,
      repo_name: selectedRepo.full_name,
      branch
    });
    connectSpinner.succeed(chalk.green('✅ Repositório conectado com sucesso!'));

    console.log(chalk.gray(`\n   Repo: ${selectedRepo.full_name}`));
    console.log(chalk.gray(`   Branch: ${branch}`));
    console.log(chalk.gray(`   Webhook: ${result.webhook_registered ? '✅ Ativo' : '⚠️ Não registrado'}`));
    console.log(chalk.cyan('\n💡 Agora cada push nessa branch fará deploy automático!\n'));

  } catch (error) {
    if (error.response?.status === 404) {
      console.log(chalk.yellow('\n⚠️  GitHub não conectado'));
      console.log(chalk.gray('   Use: mozhost git:auth\n'));
      return;
    }
    console.error(chalk.red('\n❌ Erro ao conectar repositório:'));
    console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    process.exit(1);
  }
}

// ============================================
// git:deploys <container> - Ver histórico de deploys
// ============================================
async function deploys(containerId) {
  try {
    const spinner = ora('Carregando histórico de deploys...').start();
    const response = await api.githubDeploys(containerId);
    spinner.stop();

    if (!response.deploys || response.deploys.length === 0) {
      console.log(chalk.yellow('\n⚠️  Nenhum deploy encontrado para este container\n'));
      return;
    }

    console.log(chalk.cyan.bold(`\n📋 Histórico de Deploys (${response.deploys.length})\n`));

    for (const deploy of response.deploys) {
      const statusIcon = deploy.status === 'success' ? chalk.green('✅')
        : deploy.status === 'failed' ? chalk.red('❌')
        : chalk.yellow('⏳');

      const sha = deploy.commit_sha ? deploy.commit_sha.substring(0, 7) : '-------';
      const date = new Date(deploy.created_at).toLocaleString('pt-BR');

      console.log(`  ${statusIcon} ${chalk.gray(sha)} ${chalk.white(deploy.commit_message || 'Sem mensagem')}`);
      console.log(chalk.gray(`     ${date} | via ${deploy.triggered_by}`));
    }

    console.log();

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao buscar deploys:'));
    console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    process.exit(1);
  }
}

// ============================================
// git:disconnect - Desconectar GitHub
// ============================================
async function disconnect() {
  try {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.red('Tem certeza que deseja desconectar o GitHub? Todos os webhooks serão removidos.'),
        default: false
      }
    ]);

    if (!confirm) {
      console.log(chalk.gray('\nOperação cancelada.'));
      return;
    }

    const spinner = ora('Desconectando GitHub...').start();
    await api.githubDisconnect();
    spinner.succeed(chalk.green('✅ GitHub desconectado com sucesso!'));
    console.log();

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao desconectar:'));
    console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    process.exit(1);
  }
}

module.exports = {
  auth,
  status,
  repos,
  connect,
  deploys,
  disconnect
};

