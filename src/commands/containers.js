const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const api = require('../utils/api');

// ============================================
// HELPER FUNCTION - Resolver Nome ou ID
// ============================================
async function resolveContainer(identifier) {
  try {
    // Tenta buscar diretamente por ID
    const response = await api.getContainer(identifier);
    return response.container;
  } catch (error) {
    // Se não encontrar (404), busca na lista por nome
    if (error.response?.status === 404 || error.response?.data?.error?.includes('not found')) {
      const listResponse = await api.listContainers();
      
      // Procura por nome, ID completo ou ID parcial
      const found = listResponse.containers.find(c => 
        c.name === identifier || 
        c.id === identifier ||
        c.id.startsWith(identifier)
      );
      
      if (!found) {
        // Procura containers similares para sugerir
        const similar = listResponse.containers.filter(c => 
          c.name.toLowerCase().includes(identifier.toLowerCase()) ||
          c.id.includes(identifier)
        );
        
        if (similar.length > 0) {
          console.log(chalk.yellow('\n💡 Você quis dizer:'));
          similar.forEach(c => {
            console.log(chalk.white(`   • ${c.name} ${chalk.gray(`(${c.id.slice(0, 8)})`)}`));
          });
        } else {
          console.log(chalk.gray('\n💡 Use: mozhost ls para ver todos os containers'));
        }
        
        throw new Error(`Container "${identifier}" não encontrado`);
      }
      
      return found;
    }
    throw error;
  }
}

// ============================================
// LIST - Listar todos os containers
// ============================================
async function list() {
  try {
    const spinner = ora('Carregando containers...').start();

    const response = await api.listContainers();

    spinner.stop();

    if (response.containers.length === 0) {
      console.log(chalk.yellow('\n⚠️  Nenhum container encontrado'));
      console.log(chalk.gray('   Use: mozhost create -n <nome> -t <tipo>'));
      return;
    }

    console.log(chalk.cyan.bold(`\n📦 Containers (${response.total})\n`));

    response.containers.forEach(container => {
      const statusColor = container.status === 'running' ? chalk.green : chalk.gray;
      const statusIcon = container.status === 'running' ? '●' : '○';

      console.log(`${statusColor(statusIcon)} ${chalk.white.bold(container.name)} ${chalk.gray(`(${container.id.slice(0, 8)})`)}`);
      console.log(`  ${chalk.gray('Tipo:')} ${container.type}`);
      console.log(`  ${chalk.gray('Status:')} ${statusColor(container.status)}`);
      console.log(`  ${chalk.gray('URL:')} ${chalk.cyan(`https://${container.domain}`)}`);
      console.log(`  ${chalk.gray('Porta:')} ${container.port}`);
      console.log(`  ${chalk.gray('RAM:')} ${container.memory_limit_mb}MB`);
      console.log(`  ${chalk.gray('Storage:')} ${container.storage_used_mb || 0}MB\n`);
    });

    if (response.coins !== undefined) {
      console.log(chalk.yellow(`💰 Coins disponíveis: ${response.coins}\n`));
    }

    if (response.storageAlerts?.length > 0) {
      console.log(chalk.red('⚠️  Alertas de armazenamento:'));
      response.storageAlerts.forEach(alert => {
        console.log(chalk.red(`   ${alert.name}: ${alert.usedMB}MB / ${alert.maxMB}MB (>90%)`));
      });
      console.log();
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao listar containers:'));
    console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    process.exit(1);
  }
}

// ============================================
// CREATE - Criar novo container
// ============================================
async function create(options) {
  try {
    const { name, type } = options;

    if (!['nodejs', 'python', 'php'].includes(type)) {
      console.error(chalk.red('❌ Tipo inválido. Use: nodejs, python ou php'));
      process.exit(1);
    }

    console.log(chalk.cyan.bold('\n🔨 Criando container...\n'));
    console.log(chalk.gray(`  Nome: ${name}`));
    console.log(chalk.gray(`  Tipo: ${type}\n`));

    const spinner = ora('Criando container...').start();

    const response = await api.createContainer({ name, type });

    spinner.succeed(chalk.green('✅ Container criado com sucesso!'));

    console.log(chalk.gray('\nInformações do container:'));
    console.log(chalk.white(`  ID: ${response.container.id}`));
    console.log(chalk.white(`  Nome: ${response.container.name}`));
    console.log(chalk.white(`  Tipo: ${response.container.type}`));
    console.log(chalk.white(`  Status: ${response.container.status}`));
    console.log(chalk.cyan(`  URL: https://${response.container.domain}`));
    console.log(chalk.white(`  Porta: ${response.container.port}`));

    console.log(chalk.gray('\nPróximos passos:'));
    console.log(chalk.white(`  1. mozhost start ${response.container.name}`));
    console.log(chalk.white(`  2. mozhost deploy ${response.container.name}`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao criar container:'));

    if (error.response?.data) {
      console.error(chalk.red(`   ${error.response.data.error || error.response.data.message}`));

      if (error.response.status === 403) {
        console.log(chalk.yellow('\n💡 Dica: Você atingiu o limite de containers do seu plano'));
      }

      if (error.response.status === 402) {
        console.log(chalk.yellow('\n💡 Dica: Você não tem coins suficientes'));
      }
    } else {
      console.error(chalk.red(`   ${error.message}`));
    }

    process.exit(1);
  }
}

// ============================================
// START - Iniciar container
// ============================================
async function start(identifier) {
  try {
    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(identifier);
    
    spinner.text = `Iniciando ${container.name}...`;
    const response = await api.startContainer(container.id);

    spinner.succeed(chalk.green(`✅ Container ${container.name} iniciado!`));

    console.log(chalk.cyan(`\n🌐 URL: https://${container.domain}`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao iniciar container:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// STOP - Parar container
// ============================================
async function stop(identifier) {
  try {
    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(identifier);
    
    spinner.text = `Parando ${container.name}...`;
    await api.stopContainer(container.id);

    spinner.succeed(chalk.green(`✅ Container ${container.name} parado!`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao parar container:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// RESTART - Reiniciar container
// ============================================
async function restart(identifier) {
  try {
    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(identifier);
    
    spinner.text = `Reiniciando ${container.name}...`;
    await api.restartContainer(container.id);

    spinner.succeed(chalk.green(`✅ Container ${container.name} reiniciado!`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao reiniciar container:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// DELETE - Deletar container
// ============================================
async function deleteContainer(identifier) {
  try {
    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(identifier);
    spinner.stop();

    const confirm = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: chalk.red(`Tem certeza que deseja deletar "${container.name}"?`),
        default: false
      }
    ]);

    if (!confirm.confirmed) {
      console.log(chalk.yellow('Operação cancelada'));
      return;
    }

    const deleteSpinner = ora(`Deletando ${container.name}...`).start();
    await api.deleteContainer(container.id);

    deleteSpinner.succeed(chalk.green(`✅ Container ${container.name} deletado com sucesso!`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao deletar container:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// LOGS - Ver logs do container
// ============================================
async function logs(identifier, options) {
  try {
    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(identifier);
    
    spinner.text = `Carregando logs de ${container.name}...`;
    const response = await api.getContainerLogs(container.id, options.lines);

    spinner.stop();

    if (!response.logs || response.logs.length === 0) {
      console.log(chalk.yellow(`\n⚠️  Nenhum log encontrado para ${container.name}`));
      return;
    }

    console.log(chalk.cyan.bold(`\n📝 Logs de ${container.name}\n`));
    response.logs.forEach(line => {
      console.log(chalk.gray(line));
    });

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao buscar logs:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// INFO - Informações detalhadas do container
// ============================================
async function info(identifier) {
  try {
    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(identifier);
    
    spinner.text = `Carregando informações de ${container.name}...`;
    
    // Busca detalhes completos (com stats se disponível)
    const response = await api.getContainer(container.id);
    spinner.stop();

    const containerData = response.container;

    console.log(chalk.cyan.bold('\n📦 Informações do Container\n'));
    console.log(chalk.white(`  ID: ${containerData.id}`));
    console.log(chalk.white(`  Nome: ${containerData.name}`));
    console.log(chalk.white(`  Tipo: ${containerData.type}`));

    const statusColor = containerData.status === 'running' ? chalk.green : chalk.gray;
    console.log(`  Status: ${statusColor(containerData.status)}`);

    console.log(chalk.cyan(`  URL: https://${containerData.domain}`));
    console.log(chalk.white(`  Porta: ${containerData.port}`));
    console.log(chalk.white(`  CPU Limit: ${containerData.cpu_limit}`));
    console.log(chalk.white(`  RAM Limit: ${containerData.memory_limit_mb}MB`));
    console.log(chalk.white(`  Storage Usado: ${containerData.storage_used_mb || 0}MB`));
    console.log(chalk.white(`  Auto Restart: ${containerData.auto_restart ? 'Sim' : 'Não'}`));
    console.log(chalk.gray(`  Criado em: ${new Date(containerData.created_at).toLocaleString('pt-BR')}`));
    console.log(chalk.gray(`  Atualizado em: ${new Date(containerData.updated_at).toLocaleString('pt-BR')}`));

    if (response.stats) {
      console.log(chalk.cyan.bold('\n📊 Estatísticas em Tempo Real\n'));
      console.log(chalk.white(`  CPU: ${response.stats.cpu.toFixed(2)}%`));
      console.log(chalk.white(`  Memória: ${(response.stats.memory.used / 1024 / 1024).toFixed(2)}MB / ${(response.stats.memory.limit / 1024 / 1024).toFixed(2)}MB (${response.stats.memory.percent.toFixed(2)}%)`));
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao buscar informações:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// URL - Obter URL do container
// ============================================
async function url(identifier) {
  try {
    const container = await resolveContainer(identifier);
    console.log(chalk.cyan(`https://${container.domain}`));
  } catch (error) {
    console.error(chalk.red('❌ Erro ao buscar URL:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  list,
  create,
  start,
  stop,
  restart,
  deleteContainer,
  logs,
  info,
  url
};
