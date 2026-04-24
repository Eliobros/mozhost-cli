const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const FormData = require('form-data');
const api = require('../utils/api');
const config = require('../utils/config');

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

      if (!override) return;
    }

    const spinner = ora('Carregando containers...').start();
    const response = await api.listContainers();
    spinner.stop();

    if (response.containers.length === 0) {
      console.log(chalk.red('\n❌ Nenhum container encontrado'));
      console.log(chalk.gray('   Crie um container primeiro: mozhost create -n <nome> -t <tipo>'));
      return;
    }

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

    const ignorePath = path.join(process.cwd(), '.mozhostignore');
    if (!fs.existsSync(ignorePath)) {
      await fs.writeFile(ignorePath, DEFAULT_IGNORE.join('\n'));
      console.log(chalk.green('✅ Arquivo .mozhostignore criado'));
    }

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

    let targetContainerId = containerId;

    if (!targetContainerId) {
      targetContainerId = await config.getLinkedContainer();

      if (!targetContainerId) {
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
          targetContainerId = response.containers[0].id;
          console.log(chalk.cyan(`\n🎯 Usando container: ${response.containers[0].name}`));
        } else {
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
            console.log(chalk.green('✅ Container vinculado!'));
          }
        }
      }
    }

    console.log(chalk.cyan.bold('\n🚀 Deploy MozHost\n'));

    const spinner = ora('Verificando container...').start();
    const containerInfo = await api.getContainer(targetContainerId);

    spinner.text = 'Coletando arquivos...';
    const ignorePatterns = await getIgnorePatterns(projectDir);
    const files = await collectFiles(projectDir, ignorePatterns);

    if (files.length === 0) {
      spinner.fail(chalk.red('Nenhum arquivo encontrado para deploy'));
      process.exit(1);
    }

    spinner.text = `Empacotando ${files.length} arquivos...`;
    await uploadFiles(targetContainerId, projectDir, files, spinner);

    spinner.succeed(chalk.green('✅ Deploy concluído com sucesso!'));

    console.log(chalk.gray(`\n📦 Arquivos enviados: ${files.length}`));
    console.log(chalk.cyan(`🌐 URL: https://${containerInfo.container.domain}`));

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

    if (shouldIgnore(relativePath, ignorePatterns)) continue;

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
    if (normalized === pattern || normalized.startsWith(pattern + '/')) return true;

    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(normalized);
    }

    return false;
  });
}

async function uploadFiles(containerId, projectDir, files, spinner) {
  const client = await api.getClient();
  const baseURL = await config.getApiUrl();

  spinner.text = `Empacotando ${files.length} arquivos...`;

  // Criar ZIP em memória
  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks = [];

  archive.on('data', chunk => chunks.push(chunk));

  for (const file of files) {
    const fullPath = path.join(projectDir, file);
    archive.file(fullPath, { name: file });
  }

  await archive.finalize();

  const zipBuffer = Buffer.concat(chunks);

  spinner.text = `Enviando pacote (${(zipBuffer.length / 1024 / 1024).toFixed(2)}MB)...`;

  const form = new FormData();
  form.append('zipfile', zipBuffer, {
    filename: 'deploy.zip',
    contentType: 'application/zip'
  });
  form.append('overwrite', 'true');

  await client.post(
    `${baseURL}/api/files/${containerId}/upload-zip`,
    form,
    { headers: form.getHeaders() }
  );
}

module.exports = {
  init,
  link,
  deploy
};
