const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const FormData = require('form-data');
const api = require('../utils/api');
const config = require('../utils/config');

// Arquivos/pastas ignorados por padrão
const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  '.env',
  '.DS_Store',
  'dist',
  'build',
  '.mozhost.json',
  '*.log',
  '.vscode',
  '.idea',
  '__pycache__',
  '*.pyc',
  'venv',
  'env'
];

async function init() {
  try {
    console.log(chalk.cyan.bold('\n🚀 Inicializar Deploy MozHost\n'));

    // Verificar se já existe configuração
    const existingConfig = await config.getProjectConfig();
    if (existingConfig) {
      console.log(chalk.yellow('⚠️  Projeto já inicializado'));
      console.log(chalk.gray(`   Container vinculado: ${existingConfig.name} (${existingConfig.container})`));
      
      const { override } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'override',
          message: 'Deseja reconfigurar?',
          default: false
        }
      ]);

      if (!override) {
        return;
      }
    }

    // Listar containers disponíveis
    const spinner = ora('Carregando containers...').start();
    const response = await api.listContainers();
    spinner.stop();

    if (response.containers.length === 0) {
      console.log(chalk.red('\n❌ Nenhum container encontrado'));
      console.log(chalk.gray('   Crie um container primeiro: mozhost create -n <nome> -t <tipo>'));
      return;
    }

    // Selecionar container
    const { containerId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'containerId',
        message: 'Selecione o container:',
        choices: response.containers.map(c => ({
          name: `${c.name} (${c.type}) - ${c.status}`,
          value: c.id
        }))
      }
    ]);

    const selectedContainer = response.containers.find(c => c.id === containerId);

    // Criar arquivo .mozhostignore se não existir
    const ignorePath = path.join(process.cwd(), '.mozhostignore');
    if (!fs.existsSync(ignorePath)) {
      await fs.writeFile(ignorePath, DEFAULT_IGNORE.join('\n'));
      console.log(chalk.green('✅ Arquivo .mozhostignore criado'));
    }

    // Salvar configuração
    await config.linkContainer(containerId, selectedContainer.name);

    console.log(chalk.green('\n✅ Projeto inicializado com sucesso!'));
    console.log(chalk.gray(`   Container: ${selectedContainer.name}`));
    console.log(chalk.cyan(`   URL: https://${selectedContainer.domain}`));
    console.log(chalk.gray('\nPróximos passos:'));
    console.log(chalk.white('   mozhost deploy'));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao inicializar:'));
    console.error(chalk.red(`   ${error.message}`));
    process.exit(1);
  }
}

async function link(containerId) {
  try {
    console.log(chalk.cyan.bold('\n🔗 Vincular Container\n'));

    const spinner = ora('Buscando container...').start();
    
    const response = await api.getContainer(containerId);
    const container = response.container;
    
    spinner.stop();

    await config.linkContainer(container.id, container.name);

    console.log(chalk.green('✅ Container vinculado com sucesso!'));
    console.log(chalk.gray(`   Container: ${container.name}`));
    console.log(chalk.cyan(`   URL: https://${container.domain}`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao vincular container:'));
    console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    process.exit(1);
  }
}

async function deploy(containerId, options) {
  try {
    const projectDir = path.resolve(options.directory);

    if (!fs.existsSync(projectDir)) {
      console.error(chalk.red(`❌ Diretório não encontrado: ${projectDir}`));
      process.exit(1);
    }

    // Determinar container ID
    let targetContainerId = containerId;
    
    if (!targetContainerId) {
      // Tentar ler do .mozhost.json
      targetContainerId = await config.getLinkedContainer();
      
      if (!targetContainerId) {
        // Não tem container vinculado - perguntar qual usar
        console.log(chalk.yellow('\n⚠️  Nenhum container vinculado a este projeto'));
        
        const spinner = ora('Carregando containers...').start();
        const response = await api.listContainers();
        spinner.stop();

        if (response.containers.length === 0) {
          console.error(chalk.red('\n❌ Nenhum container encontrado'));
          console.log(chalk.gray('   Crie um container primeiro: mozhost create -n <nome> -t <tipo>'));
          process.exit(1);
        }

        if (response.containers.length === 1) {
          // Só tem 1 container, usar automaticamente
          targetContainerId = response.containers[0].id;
          console.log(chalk.cyan(`\n🎯 Usando container: ${response.containers[0].name}`));
        } else {
          // Múltiplos containers - perguntar qual usar
          const { selectedContainer } = await inquirer.prompt([
            {
              type: 'list',
              name: 'selectedContainer',
              message: 'Selecione o container para deploy:',
              choices: response.containers.map(c => ({
                name: `${c.name} (${c.type}) - ${c.status}`,
                value: c.id
              }))
            }
          ]);

          targetContainerId = selectedContainer;

          // Perguntar se quer vincular este container ao projeto
          const { linkContainer } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'linkContainer',
              message: 'Deseja vincular este container ao projeto?',
              default: true
            }
          ]);

          if (linkContainer) {
            const container = response.containers.find(c => c.id === targetContainerId);
            await config.linkContainer(targetContainerId, container.name);
            console.log(chalk.green('✅ Container vinculado! Próximos deploys usarão este container automaticamente.'));
          }
        }
      }
    }

    console.log(chalk.cyan.bold('\n🚀 Deploy MozHost\n'));

    // Buscar informações do container
    const spinner = ora('Verificando container...').start();
    const containerInfo = await api.getContainer(targetContainerId);
    spinner.text = 'Empacotando arquivos...';

    // Ler arquivos ignorados
    const ignorePatterns = await getIgnorePatterns(projectDir);

    // Coletar arquivos
    const files = await collectFiles(projectDir, ignorePatterns);

    if (files.length === 0) {
      spinner.fail(chalk.red('Nenhum arquivo encontrado para deploy'));
      process.exit(1);
    }

    spinner.text = `Fazendo upload de ${files.length} arquivos...`;

    // Fazer upload dos arquivos
    await uploadFiles(targetContainerId, projectDir, files, spinner);

    spinner.succeed(chalk.green('✅ Deploy concluído com sucesso!'));

    console.log(chalk.gray(`\n📦 Arquivos enviados: ${files.length}`));
    console.log(chalk.cyan(`🌐 URL: https://${containerInfo.container.domain}`));

    // Perguntar se quer iniciar o container
    if (containerInfo.container.status !== 'running') {
      const { startNow } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'startNow',
          message: 'Container parado. Deseja iniciar agora?',
          default: true
        }
      ]);

      if (startNow) {
        const startSpinner = ora('Iniciando container...').start();
        await api.startContainer(targetContainerId);
        startSpinner.succeed(chalk.green('✅ Container iniciado!'));
      }
    } else {
      const { restart } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'restart',
          message: 'Deseja reiniciar o container para aplicar as mudanças?',
          default: true
        }
      ]);

      if (restart) {
        const restartSpinner = ora('Reiniciando container...').start();
        await api.restartContainer(targetContainerId);
        restartSpinner.succeed(chalk.green('✅ Container reiniciado!'));
      }
    }

    console.log(chalk.gray('\n💡 Dica: Use "mozhost logs <container>" para ver os logs\n'));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro no deploy:'));
    console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    process.exit(1);
  }
}

async function getIgnorePatterns(projectDir) {
  const ignorePath = path.join(projectDir, '.mozhostignore');
  
  if (fs.existsSync(ignorePath)) {
    const content = await fs.readFile(ignorePath, 'utf-8');
    return [...DEFAULT_IGNORE, ...content.split('\n').filter(line => line.trim() && !line.startsWith('#'))];
  }
  
  return DEFAULT_IGNORE;
}

async function collectFiles(dir, ignorePatterns, baseDir = dir) {
  const files = [];
  const items = await fs.readdir(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relativePath = path.relative(baseDir, fullPath);

    // Verificar se deve ignorar
    if (shouldIgnore(relativePath, ignorePatterns)) {
      continue;
    }

    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      const subFiles = await collectFiles(fullPath, ignorePatterns, baseDir);
      files.push(...subFiles);
    } else if (stat.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function shouldIgnore(filePath, patterns) {
  const normalized = filePath.replace(/\\/g, '/');
  
  return patterns.some(pattern => {
    // Pattern exato
    if (normalized === pattern || normalized.startsWith(pattern + '/')) {
      return true;
    }
    
    // Wildcard simples
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(normalized);
    }
    
    return false;
  });
}
/*
async function uploadFiles(containerId, projectDir, files, spinner) {
  const client = await api.getClient();
  const baseURL = await config.getApiUrl();

  // Enviar em lotes para evitar timeout
  const BATCH_SIZE = 20;
  
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    
    spinner.text = `Upload: ${Math.min(i + BATCH_SIZE, files.length)}/${files.length} arquivos...`;

    for (const file of batch) {
      const fullPath = path.join(projectDir, file);
      const content = await fs.readFile(fullPath, 'utf-8');

      await client.post(`${baseURL}/api/files/${containerId}`, {
        path: file,
        content: content
      });
    }
  }
}
*/

async function uploadFiles(containerId, projectDir, files, spinner) {
  // Enviar em lotes para evitar timeout
  const BATCH_SIZE = 20;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    spinner.text = `Upload: ${Math.min(i + BATCH_SIZE, files.length)}/${files.length} arquivos...`;

    for (const file of batch) {
      const fullPath = path.join(projectDir, file);
      const content = await fs.readFile(fullPath, 'utf-8');

      // Usar o método correto do api.js que chama o endpoint /cli-upload
      await api.uploadFile(containerId, file, content);
    }
  }
}

module.exports = {
  init,
  link,
  deploy
};
