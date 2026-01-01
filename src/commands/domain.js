// mozhost-cli/commands/domain.js

const program = require('commander');
const axios = require('axios');
const chalk = require('chalk');

program
  .command('domain add <container> <domain>')
  .description('Adicionar domínio customizado')
  .action(async (container, domain) => {
    try {
      const res = await axios.post(`${API_URL}/domains`, {
        containerId: container,
        domain
      });
      
      console.log(chalk.green('\n✅ Domínio adicionado com sucesso!\n'));
      console.log(chalk.yellow('📋 Configure seu DNS:\n'));
      console.log(`   Tipo: ${chalk.bold('A')}`);
      console.log(`   Nome: ${chalk.bold('@')} (ou ${chalk.bold(domain)})`);
      console.log(`   Valor: ${chalk.bold(res.data.instructions.ip)}`);
      console.log(`   TTL: ${chalk.bold('300')}\n`);
      console.log(chalk.cyan('⏳ Aguardando propagação DNS...\n'));
      console.log(`Use ${chalk.bold('mozhost domain status ' + container)} para acompanhar\n`);
      
    } catch (error) {
      console.error(chalk.red('❌ Erro:'), error.response?.data?.error || error.message);
    }
  });

program
  .command('domain status <container>')
  .description('Ver status dos domínios')
  .action(async (container) => {
    try {
      const res = await axios.get(`${API_URL}/domains/${container}`);
      const domains = res.data;
      
      if (domains.length === 0) {
        console.log(chalk.yellow('Nenhum domínio customizado configurado'));
        return;
      }
      
      console.log('\n┌─────────────────────────────────────────────────┐');
      
      for (const d of domains) {
        const statusIcon = {
          pending: '⏳',
          dns_pending: '🔍',
          ssl_generating: '🔒',
          active: '✅',
          failed: '❌'
        }[d.status];
        
        const statusText = {
          pending: 'Aguardando configuração',
          dns_pending: 'DNS detectado, gerando SSL...',
          ssl_generating: 'Gerando certificado SSL...',
          active: 'Ativo',
          failed: 'Falhou - verifique DNS'
        }[d.status];
        
        console.log(`│ ${statusIcon} ${chalk.bold(d.domain)}`);
        console.log(`│    Status: ${statusText}`);
        if (d.ssl_expires_at && d.status === 'active') {
          console.log(`│    SSL válido até: ${new Date(d.ssl_expires_at).toLocaleDateString()}`);
        }
        console.log('│');
      }
      
      console.log('└─────────────────────────────────────────────────┘\n');
      
    } catch (error) {
      console.error(chalk.red('❌ Erro:'), error.message);
    }
  });

program.parse(process.argv);
