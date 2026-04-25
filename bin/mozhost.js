#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const authCommands = require('../src/commands/auth');
const containerCommands = require('../src/commands/containers');
const deployCommands = require('../src/commands/deploy');
const domainCommands = require('../src/commands/domains');
const databaseCommands = require('../src/commands/databases'); // 👈 NOVO
const terminalCommands = require('../src/commands/terminal');
const gitCommands = require('../src/commands/git');
const packageJson = require('../package.json');
const envCommands = require('../src/commands/env');


program
  .name('mozhost')
  .description('CLI for MozHost - Hospedagem de Bots e APIs')
  .version(packageJson.version);

// ============================================
// AUTH COMMANDS
// ============================================
program
  .command('auth')
  .description('Autenticar na MozHost')
  .action(authCommands.login);

program
  .command('logout')
  .description('Deslogar da MozHost')
  .action(authCommands.logout);

program
  .command('whoami')
  .description('Ver usuário atual')
  .action(authCommands.whoami);

// ============================================
// CONTAINER COMMANDS
// ============================================
program
  .command('containers')
  .alias('ls')
  .description('Listar containers')
  .action(containerCommands.list);

program
  .command('create')
  .description('Criar novo container')
  .option('-n, --name <name>', 'Nome do container')
  .option('-t, --type <type>', 'Tipo: bot-baileys, bot-whatsapp-web-js, nodejs, python, php')
  .action(containerCommands.create);

program
  .command('start <container>')
  .description('Iniciar container')
  .action(containerCommands.start);

program
  .command('stop <container>')
  .description('Parar container')
  .action(containerCommands.stop);

program
  .command('restart <container>')
  .description('Reiniciar container')
  .action(containerCommands.restart);

program
  .command('delete <container>')
  .alias('rm')
  .description('Deletar container')
  .action(containerCommands.deleteContainer);

program
  .command('logs <container>')
  .description('Ver logs do container')
  .option('-n, --lines <number>', 'Número de linhas', '100')
  .action(containerCommands.logs);

program
  .command('info <container>')
  .description('Ver informações do container')
  .action(containerCommands.info);

program
  .command('url <container>')
  .description('Ver URL do container')
  .action(containerCommands.url);

// ============================================
// DATABASE COMMANDS 👈 NOVO
// ============================================
program
  .command('db:list')
  .alias('db:ls')
  .description('Listar databases')
  .action(databaseCommands.list);

program
  .command('db:create')
  .description('Criar novo database')
  .requiredOption('-n, --name <name>', 'Nome do database')
  .requiredOption('-t, --type <type>', 'Tipo (mysql, mariadb, postgres, mongodb, redis)')
  .option('-c, --container <container>', 'Container para vincular (opcional)')
  .action(databaseCommands.create);

program
  .command('db:info <database>')
  .description('Ver informações detalhadas do database')
  .action(databaseCommands.info);

program
  .command('db:credentials <database>')
  .alias('db:creds')
  .description('Ver credenciais do database')
  .action(databaseCommands.credentials);

program
  .command('db:link <database> <container>')
  .description('Vincular database a um container')
  .action(databaseCommands.link);

program
  .command('db:delete <database>')
  .alias('db:rm')
  .description('Deletar database')
  .action(databaseCommands.deleteDatabase);

// ============================================
// DEPLOY COMMANDS
// ============================================
program
  .command('init')
  .description('Inicializar projeto para deploy')
  .action(deployCommands.init);

program
  .command('deploy [container]')
  .description('Fazer deploy do projeto atual')
  .option('-d, --directory <path>', 'Diretório do projeto', '.')
  .action(deployCommands.deploy);

program
  .command('link <container>')
  .description('Vincular diretório atual a um container')
  .action(deployCommands.link);

program
  .command('domain:list [container]')
  .alias('domain:ls')
  .description('Listar domínios (opcionalmente de um container)')
  .action(domainCommands.list);

program
  .command('domain:add <container> <domain>')
  .description('Adicionar domínio customizado')
  .action(domainCommands.add);

program
  .command('domain:verify <domain>')
  .description('Verificar status do domínio (DNS e SSL)')
  .action(domainCommands.verify);

program
  .command('domain:watch <domain>')
  .description('Monitorar propagação do domínio em tempo real')
  .action(domainCommands.watch);

program
  .command('domain:remove <container> <domain>')
  .alias('domain:rm')
  .description('Remover domínio')
  .action(domainCommands.remove);


// ============================================
// TERMINAL COMMANDS 👈 ADICIONAR ANTES DO PARSE
// ============================================
program
  .command('ssh <container>')
  .description('Acessar terminal do container')
  .action(terminalCommands.ssh);

program
  .command('exec <container> <command>')
  .description('Executar comando no container')
  .action(terminalCommands.exec);


// ============================================
// GIT / GITHUB COMMANDS
// ============================================
program
  .command('git:auth')
  .description('Conectar conta GitHub')
  .action(gitCommands.auth);

program
  .command('git:status')
  .description('Ver status da conexão GitHub')
  .action(gitCommands.status);

program
  .command('git:repos')
  .alias('git:ls')
  .description('Listar repositórios GitHub')
  .action(gitCommands.repos);

program
  .command('git:connect [container]')
  .description('Conectar repositório a um container')
  .action(gitCommands.connect);

program
  .command('git:deploys <container>')
  .description('Ver histórico de deploys via Git')
  .action(gitCommands.deploys);

program
  .command('git:disconnect')
  .description('Desconectar conta GitHub')
  .action(gitCommands.disconnect);


// ============================================
// ENV COMMANDS
// ============================================
program
  .command('env:list <container>')
  .alias('env:ls')
  .description('Listar variáveis de ambiente do container')
  .action(envCommands.list);

program
  .command('env:add <container> [pairs...]')
  .description('Adicionar variáveis: VAR=valor VAR2=valor2')
  .action(envCommands.add);

program
  .command('env:remove <container> <key>')
  .alias('env:rm')
  .description('Remover variável de ambiente')
  .action(envCommands.remove);

program
  .command('env:set <container>')
  .description('Definir variáveis interativamente')
  .action(envCommands.set);



// ============================================
// PARSE & HELP
// ============================================
program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  console.log(chalk.cyan.bold('\n🚀 MozHost CLI\n'));
  program.outputHelp();
  
  // Mostrar exemplos úteis
  console.log(chalk.gray('\nExemplos:'));
  console.log(chalk.white('  mozhost auth                     # Autenticar'));
  console.log(chalk.white('  mozhost ls                       # Listar containers'));
  console.log(chalk.white('  mozhost create -n app -t nodejs  # Criar container'));
  console.log(chalk.white('  mozhost db:list                  # Listar databases'));
  console.log(chalk.white('  mozhost db:create -n db -t mysql # Criar database'));
  console.log(chalk.white('  mozhost domain:list                 # Listar domínios'));
  console.log(chalk.white('  mozhost domain:add bot exemplo.com  # Adicionar domínio'));
  console.log(chalk.white('  mozhost domain:verify exemplo.com   # Verificar domínio'));
  console.log(chalk.white('  mozhost git:auth                    # Conectar GitHub'));
  console.log(chalk.white('  mozhost git:repos                   # Listar repositórios'));
  console.log(chalk.white('  mozhost git:connect                 # Conectar repo a container'));
  console.log(chalk.white('  mozhost git:deploys <container>     # Histórico de deploys'));
  console.log();
}
