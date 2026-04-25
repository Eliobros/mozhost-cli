const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const api = require('../utils/api');

// ============================================
// HELPER - Resolver container (igual ao containers.js)
// ============================================
async function resolveContainer(identifier) {
  try {
    const response = await api.getContainer(identifier);
    return response.container;
  } catch (error) {
    if (error.response?.status === 404 || error.response?.data?.error?.includes('not found')) {
      const listResponse = await api.listContainers();
      const found = listResponse.containers.find(c =>
        c.name === identifier ||
        c.id === identifier ||
        c.id.startsWith(identifier)
      );
      if (!found) throw new Error(`Container "${identifier}" não encontrado`);
      return found;
    }
    throw error;
  }
}

// ============================================
// HELPER - Parsear VAR=valor ou VAR:valor
// ============================================
function parseEnvPair(pair) {
  // Suporta VAR=valor e VAR:valor
  const match = pair.match(/^([A-Z0-9_]+)[=:](.*)$/i);
  if (!match) return null;
  return { key: match[1].toUpperCase(), value: match[2] };
}

// ============================================
// ENV:LIST - Listar variáveis do container
// ============================================
async function list(identifier) {
  try {
    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(identifier);

    spinner.text = `Carregando variáveis de ${container.name}...`;
    const response = await api.getContainerEnv(container.id);
    spinner.stop();

    const envVars = response.env || {};
    const keys = Object.keys(envVars);

    if (keys.length === 0) {
      console.log(chalk.yellow(`\n⚠️  Nenhuma variável de ambiente em "${container.name}"`));
      console.log(chalk.gray(`   Use: mozhost env:add ${container.name} VAR=valor`));
      return;
    }

    console.log(chalk.cyan.bold(`\n🔐 Variáveis de ambiente - ${container.name}\n`));
    keys.forEach(key => {
      const value = envVars[key];
      // Ocultar valores que parecem sensíveis
      const isSensitive = /(secret|password|token|key|pass|pwd)/i.test(key);
      const displayValue = isSensitive ? chalk.gray('••••••••') : chalk.white(value);
      console.log(`  ${chalk.cyan(key)}${chalk.gray('=')}${displayValue}`);
    });

    console.log(chalk.gray(`\n  Total: ${keys.length} variável(is)\n`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao listar variáveis:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// ENV:ADD - Adicionar/atualizar variáveis
// Uso: mozhost env:add <container> VAR=valor [VAR2=valor2 ...]
// ============================================
async function add(identifier, pairs) {
  try {
    if (!pairs || pairs.length === 0) {
      console.error(chalk.red('\n❌ Informe pelo menos uma variável'));
      console.error(chalk.gray('   Uso: mozhost env:add <container> VAR=valor'));
      console.error(chalk.gray('   Exemplo: mozhost env:add meu-bot PREFIX=! TOKEN=abc123'));
      process.exit(1);
    }

    // Parsear todos os pares VAR=valor
    const envToAdd = {};
    for (const pair of pairs) {
      const parsed = parseEnvPair(pair);
      if (!parsed) {
        console.error(chalk.red(`\n❌ Formato inválido: "${pair}"`));
        console.error(chalk.gray('   Use o formato: VARIAVEL=valor ou VARIAVEL:valor'));
        process.exit(1);
      }
      envToAdd[parsed.key] = parsed.value;
    }

    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(identifier);

    spinner.text = `Adicionando variáveis em ${container.name}...`;
    await api.setContainerEnv(container.id, envToAdd);

    spinner.succeed(chalk.green(`✅ Variável(is) adicionada(s) em "${container.name}"!`));

    Object.entries(envToAdd).forEach(([key, value]) => {
      const isSensitive = /(secret|password|token|key|pass|pwd)/i.test(key);
      const displayValue = isSensitive ? chalk.gray('••••••••') : chalk.white(value);
      console.log(`  ${chalk.cyan(key)}${chalk.gray('=')}${displayValue}`);
    });

    console.log(chalk.gray('\n💡 Reinicia o container para aplicar as mudanças:'));
    console.log(chalk.white(`   mozhost restart ${container.name}\n`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao adicionar variáveis:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// ENV:REMOVE - Remover variável do container
// ============================================
async function remove(identifier, key) {
  try {
    if (!key) {
      console.error(chalk.red('\n❌ Informe o nome da variável'));
      console.error(chalk.gray('   Uso: mozhost env:remove <container> VARIAVEL'));
      process.exit(1);
    }

    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(identifier);
    spinner.stop();

    const confirm = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: chalk.yellow(`Remover "${key.toUpperCase()}" de "${container.name}"?`),
        default: false
      }
    ]);

    if (!confirm.confirmed) {
      console.log(chalk.yellow('Operação cancelada'));
      return;
    }

    const deleteSpinner = ora(`Removendo ${key.toUpperCase()}...`).start();
    await api.deleteContainerEnv(container.id, key.toUpperCase());

    deleteSpinner.succeed(chalk.green(`✅ Variável "${key.toUpperCase()}" removida de "${container.name}"!`));
    console.log(chalk.gray('\n💡 Reinicia o container para aplicar as mudanças:'));
    console.log(chalk.white(`   mozhost restart ${container.name}\n`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao remover variável:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// ENV:SET - Modo interativo para definir vars
// ============================================
async function set(identifier) {
  try {
    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(identifier);
    spinner.stop();

    console.log(chalk.cyan.bold(`\n🔐 Definir variáveis - ${container.name}\n`));
    console.log(chalk.gray('   Digite as variáveis uma a uma. Deixe o valor vazio para parar.\n'));

    const envToAdd = {};
    let continueAdding = true;

    while (continueAdding) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'key',
          message: 'Nome da variável (vazio para terminar):',
          validate: (input) => {
            if (!input) return true; // permite vazio para sair
            if (!/^[A-Z0-9_]+$/i.test(input)) return 'Use apenas letras, números e underscore';
            return true;
          }
        }
      ]);

      if (!answers.key) {
        continueAdding = false;
        break;
      }

      const valueAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'value',
          message: `Valor de ${answers.key.toUpperCase()}:`
        }
      ]);

      envToAdd[answers.key.toUpperCase()] = valueAnswer.value;
      console.log(chalk.green(`  ✓ ${answers.key.toUpperCase()} definida\n`));
    }

    if (Object.keys(envToAdd).length === 0) {
      console.log(chalk.yellow('\nNenhuma variável definida.'));
      return;
    }

    const saveSpinner = ora('Salvando variáveis...').start();
    await api.setContainerEnv(container.id, envToAdd);
    saveSpinner.succeed(chalk.green(`✅ ${Object.keys(envToAdd).length} variável(is) salva(s) em "${container.name}"!`));

    console.log(chalk.gray('\n💡 Reinicia o container para aplicar as mudanças:'));
    console.log(chalk.white(`   mozhost restart ${container.name}\n`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao definir variáveis:'));
    console.error(chalk.red(`   ${error.message || error.response?.data?.error}`));
    process.exit(1);
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  list,
  add,
  remove,
  set
};
