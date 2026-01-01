const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const api = require('../utils/api');

// ============================================
// HELPER FUNCTION - Resolver Nome ou ID
// ============================================
async function resolveDatabase(identifier) {
  try {
    // Tenta buscar diretamente por ID
    const response = await api.getDatabase(identifier);
    return response.database;
  } catch (error) {
    // Se não encontrar (404), busca na lista por nome
    if (error.response?.status === 404 || error.response?.data?.error?.includes('not found')) {
      const listResponse = await api.listDatabases();

      // Procura por nome, ID completo ou ID parcial
      const found = listResponse.databases.find(d =>
        d.name === identifier ||
        d.id === identifier ||
        d.id.startsWith(identifier)
      );

      if (!found) {
        // Procura databases similares para sugerir
        const similar = listResponse.databases.filter(d =>
          d.name.toLowerCase().includes(identifier.toLowerCase()) ||
          d.id.includes(identifier)
        );

        if (similar.length > 0) {
          console.log(chalk.yellow('\n💡 Você quis dizer:'));
          similar.forEach(d => {
            console.log(chalk.white(`   • ${d.name} ${chalk.gray(`(${d.id.slice(0, 8)}) - ${d.type}`)}`));
          });
        } else {
          console.log(chalk.gray('\n💡 Use: mozhost db:list para ver todos os databases'));
        }

        throw new Error(`Database "${identifier}" não encontrado`);
      }

      return found;
    }
    throw error;
  }
}

// ============================================
// LIST - Listar todos os databases
// ============================================
async function list() {
  try {
    const spinner = ora('Carregando databases...').start();

    const response = await api.listDatabases();

    spinner.stop();

    if (response.databases.length === 0) {
      console.log(chalk.yellow('\n⚠️  Nenhum database encontrado'));
      console.log(chalk.gray('   Use: mozhost db:create --name <nome> --type <tipo>'));
      return;
    }

    console.log(chalk.cyan.bold(`\n💾 Databases (${response.databases.length})\n`));

    response.databases.forEach(database => {
      const statusColor = database.status === 'running' ? chalk.green : chalk.gray;
      const statusIcon = database.status === 'running' ? '●' : '○';

      // Ícones por tipo de database
      const typeIcons = {
        mysql: '🐬',
        mariadb: '🦭',
        postgres: '🐘',
        mongodb: '🍃',
        redis: '🔴'
      };
      const typeIcon = typeIcons[database.type] || '💾';

      console.log(`${statusColor(statusIcon)} ${typeIcon} ${chalk.white.bold(database.name)} ${chalk.gray(`(${database.id.slice(0, 8)})`)}`);
      console.log(`  ${chalk.gray('Tipo:')} ${database.type}`);
      console.log(`  ${chalk.gray('Status:')} ${statusColor(database.status)}`);
      console.log(`  ${chalk.gray('Host:')} ${chalk.cyan(database.host)}`);
      console.log(`  ${chalk.gray('Porta:')} ${database.port}`);
      console.log(`  ${chalk.gray('Database:')} ${database.database_name}`);
      
      if (database.containers && database.containers.length > 0) {
        console.log(`  ${chalk.gray('Containers:')} ${database.containers.join(', ')}`);
      }
      console.log();
    });

    if (response.total_cost !== undefined) {
      console.log(chalk.yellow(`💰 Custo total: ${response.total_cost} coins/dia\n`));
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao listar databases:'));
    console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    process.exit(1);
  }
}

// ============================================
// CREATE - Criar novo database
// ============================================
async function create(options) {
  try {
    const { name, type, container } = options;

    if (!name || !type) {
      console.error(chalk.red('❌ Nome e tipo são obrigatórios'));
      console.log(chalk.gray('   Use: mozhost db:create --name <nome> --type <tipo>'));
      process.exit(1);
    }

    const validTypes = ['mysql', 'mariadb', 'postgres', 'mongodb', 'redis'];
    if (!validTypes.includes(type)) {
      console.error(chalk.red('❌ Tipo inválido'));
      console.log(chalk.gray('   Tipos válidos: mysql, mariadb, postgres, mongodb, redis'));
      process.exit(1);
    }

    console.log(chalk.cyan.bold('\n🔨 Criando database...\n'));
    console.log(chalk.gray(`  Nome: ${name}`));
    console.log(chalk.gray(`  Tipo: ${type}`));
    if (container) {
      console.log(chalk.gray(`  Container: ${container}`));
    }
    console.log();

    const spinner = ora('Criando database...').start();

    const response = await api.createDatabase({ name, type, container });

    spinner.succeed(chalk.green('✅ Database criado com sucesso!'));

    const db = response.database;

    console.log(chalk.gray('\n📋 Informações do Database:'));
    console.log(chalk.white(`  ID: ${db.id}`));
    console.log(chalk.white(`  Nome: ${db.name}`));
    console.log(chalk.white(`  Tipo: ${db.type}`));
    console.log(chalk.white(`  Status: ${db.status}`));
    console.log(chalk.cyan(`  Host: ${db.host}`));
    console.log(chalk.white(`  Porta: ${db.port}`));
    console.log(chalk.white(`  Database: ${db.database_name}`));
    console.log(chalk.white(`  Username: ${db.username}`));
    console.log(chalk.yellow(`  Password: ${db.password}`));
    console.log(chalk.yellow(`  💰 Custo: ${db.cost} coins/dia`));

    console.log(chalk.gray('\n🔗 Connection String:'));
    console.log(chalk.cyan(`  ${db.connection_string}`));

    console.log(chalk.gray('\n💡 Dicas:'));
    console.log(chalk.white(`  • Guarde a senha em local seguro`));
    console.log(chalk.white(`  • Use: mozhost db:credentials ${db.name} para ver novamente`));
    if (!container) {
      console.log(chalk.white(`  • Use: mozhost db:link ${db.name} <container> para vincular`));
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao criar database:'));

    if (error.response?.data) {
      console.error(chalk.red(`   ${error.response.data.error || error.response.data.message}`));

      if (error.response.status === 400 && error.response.data.error?.includes('Insufficient coins')) {
        console.log(chalk.yellow('\n💡 Dica: Você não tem coins suficientes (necessário: 5 coins)'));
      }
    } else {
      console.error(chalk.red(`   ${error.message}`));
    }

    process.exit(1);
  }
}

// ============================================
// INFO - Informações detalhadas do database
// ============================================
async function info(identifier) {
  try {
    const spinner = ora('Resolvendo database...').start();
    const database = await resolveDatabase(identifier);

    spinner.text = `Carregando informações de ${database.name}...`;

    // Busca detalhes completos
    const response = await api.getDatabase(database.id);
    spinner.stop();

    const db = response.database;

    // Ícones por tipo
    const typeIcons = {
      mysql: '🐬',
      mariadb: '🦭',
      postgres: '🐘',
      mongodb: '🍃',
      redis: '🔴'
    };
    const typeIcon = typeIcons[db.type] || '💾';

    console.log(chalk.cyan.bold(`\n${typeIcon} Informações do Database\n`));
    console.log(chalk.white(`  ID: ${db.id}`));
    console.log(chalk.white(`  Nome: ${db.name}`));
    console.log(chalk.white(`  Tipo: ${db.type}`));

    const statusColor = db.status === 'running' ? chalk.green : chalk.gray;
    console.log(`  Status: ${statusColor(db.status)}`);

    console.log(chalk.cyan(`  Host: ${db.host}`));
    console.log(chalk.white(`  Porta: ${db.port}`));
    console.log(chalk.white(`  Database: ${db.database_name}`));
    console.log(chalk.white(`  Username: ${db.username}`));
    console.log(chalk.yellow(`  Password: ${db.password}`));
    console.log(chalk.yellow(`  💰 Custo: ${db.cost} coins/dia`));

    if (db.containers && db.containers.length > 0) {
      console.log(chalk.gray('\n📦 Containers vinculados:'));
      db.containers.forEach(c => {
        console.log(chalk.white(`  • ${c.name} ${chalk.gray(`(${c.id})`)}`));
      });
    }

    console.log(chalk.gray(`\n📅 Criado em: ${new Date(db.created_at).toLocaleString('pt-BR')}`));
    console.log(chalk.gray(`   Atualizado em: ${new Date(db.updated_at).toLocaleString('pt-BR')}`));

    console.log(chalk.gray('\n🔗 Connection String:'));
    console.log(chalk.cyan(`  ${db.connection_string}`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao buscar informações:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// CREDENTIALS - Ver credenciais do database
// ============================================
async function credentials(identifier) {
  try {
    const spinner = ora('Carregando credenciais...').start();
    const database = await resolveDatabase(identifier);

    const response = await api.getDatabase(database.id);
    spinner.stop();

    const db = response.database;

    console.log(chalk.cyan.bold(`\n🔑 Credenciais de ${db.name}\n`));
    console.log(chalk.white(`  Host: ${chalk.cyan(db.host)}`));
    console.log(chalk.white(`  Porta: ${chalk.cyan(db.port)}`));
    console.log(chalk.white(`  Database: ${chalk.cyan(db.database_name)}`));
    console.log(chalk.white(`  Username: ${chalk.cyan(db.username)}`));
    console.log(chalk.white(`  Password: ${chalk.yellow(db.password)}`));

    console.log(chalk.gray('\n🔗 Connection String:'));
    console.log(chalk.cyan(`  ${db.connection_string}`));

    console.log(chalk.gray('\n💡 Copie e cole em suas variáveis de ambiente'));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao buscar credenciais:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// LINK - Vincular database a container
// ============================================
async function link(databaseIdentifier, containerIdentifier) {
  try {
    if (!containerIdentifier) {
      console.error(chalk.red('❌ Container não especificado'));
      console.log(chalk.gray('   Use: mozhost db:link <database> <container>'));
      process.exit(1);
    }

    const spinner = ora('Resolvendo database...').start();
    const database = await resolveDatabase(databaseIdentifier);

    spinner.text = 'Resolvendo container...';
    // Reusar a função de containers (você precisará exportá-la ou criar similar)
    let containerId;
    try {
      const containerResponse = await api.getContainer(containerIdentifier);
      containerId = containerResponse.container.id;
    } catch (error) {
      if (error.response?.status === 404) {
        const listResponse = await api.listContainers();
        const found = listResponse.containers.find(c =>
          c.name === containerIdentifier ||
          c.id === containerIdentifier ||
          c.id.startsWith(containerIdentifier)
        );
        if (!found) {
          throw new Error(`Container "${containerIdentifier}" não encontrado`);
        }
        containerId = found.id;
      } else {
        throw error;
      }
    }

    spinner.text = 'Vinculando database ao container...';
    await api.linkDatabase(database.id, containerId);

    spinner.succeed(chalk.green(`✅ Database ${database.name} vinculado com sucesso!`));

    console.log(chalk.gray('\n💡 O container agora pode acessar este database'));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao vincular database:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// DELETE - Deletar database
// ============================================
async function deleteDatabase(identifier) {
  try {
    const spinner = ora('Resolvendo database...').start();
    const database = await resolveDatabase(identifier);
    spinner.stop();

    console.log(chalk.yellow('\n⚠️  ATENÇÃO: Esta ação é irreversível!'));
    console.log(chalk.gray('   Todos os dados serão perdidos permanentemente.\n'));

    const confirm = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: chalk.red(`Tem certeza que deseja deletar "${database.name}"?`),
        default: false
      }
    ]);

    if (!confirm.confirmed) {
      console.log(chalk.yellow('Operação cancelada'));
      return;
    }

    // Confirmação dupla para databases
    const doubleConfirm = await inquirer.prompt([
      {
        type: 'input',
        name: 'typed',
        message: chalk.red(`Digite o nome do database "${database.name}" para confirmar:`),
      }
    ]);

    if (doubleConfirm.typed !== database.name) {
      console.log(chalk.red('❌ Nome incorreto. Operação cancelada.'));
      return;
    }

    const deleteSpinner = ora(`Deletando ${database.name}...`).start();
    await api.deleteDatabase(database.id);

    deleteSpinner.succeed(chalk.green(`✅ Database ${database.name} deletado com sucesso!`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao deletar database:'));
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
  info,
  credentials,
  link,
  deleteDatabase
};
