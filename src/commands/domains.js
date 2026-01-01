const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const api = require('../utils/api');

// ============================================
// HELPER FUNCTION - Resolver Container
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
// LIST - Listar domínios
// ============================================
async function list(containerIdentifier) {
  try {
    const spinner = ora('Carregando domínios...').start();

    let domains;
    if (containerIdentifier) {
      // Listar domínios de um container específico
      const container = await resolveContainer(containerIdentifier);
      const response = await api.getContainerDomains(container.id);
      domains = response;
      spinner.stop();

      console.log(chalk.cyan.bold(`\n🌐 Domínios de ${container.name}\n`));
    } else {
      // Listar todos os domínios
      const response = await api.listDomains();
      domains = response;
      spinner.stop();

      console.log(chalk.cyan.bold(`\n🌐 Domínios (${domains.length})\n`));
    }

    if (domains.length === 0) {
      console.log(chalk.yellow('⚠️  Nenhum domínio encontrado'));
      console.log(chalk.gray('   Use: mozhost domain:add <container> <dominio>'));
      return;
    }

    domains.forEach(domain => {
      const statusIcons = {
        active: '✅',
        pending: '⏳',
        dns_pending: '🔍',
        ssl_generating: '🔒',
        failed: '❌'
      };
      const icon = statusIcons[domain.status] || '○';

      console.log(`${icon} ${chalk.white.bold(domain.domain)}`);
      console.log(`  ${chalk.gray('Container:')} ${domain.container_name || domain.container_id}`);
      console.log(`  ${chalk.gray('Status:')} ${domain.status}`);
      
      if (domain.status === 'active') {
        console.log(`  ${chalk.gray('URL:')} ${chalk.cyan(`https://${domain.domain}`)}`);
      }
      
      if (domain.ip_detected) {
        console.log(`  ${chalk.gray('DNS IP:')} ${domain.ip_detected}`);
      }
      
      if (domain.ssl_expires_at) {
        const expiryDate = new Date(domain.ssl_expires_at);
        console.log(`  ${chalk.gray('SSL expira:')} ${expiryDate.toLocaleDateString('pt-BR')}`);
      }
      
      console.log(`  ${chalk.gray('Criado:')} ${new Date(domain.created_at).toLocaleDateString('pt-BR')}`);
      console.log();
    });

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao listar domínios:'));
    console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    process.exit(1);
  }
}

// ============================================
// ADD - Adicionar domínio
// ============================================
async function add(containerIdentifier, domain) {
  try {
    if (!containerIdentifier || !domain) {
      console.error(chalk.red('❌ Container e domínio são obrigatórios'));
      console.log(chalk.gray('   Use: mozhost domain:add <container> <dominio>'));
      process.exit(1);
    }

    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(containerIdentifier);

    spinner.text = 'Adicionando domínio...';

    const response = await api.addDomain({
      containerId: container.id,
      domain: domain
    });

    spinner.succeed(chalk.green(`✅ Domínio ${domain} adicionado com sucesso!`));

    console.log(chalk.cyan.bold('\n📝 Configure seu DNS:\n'));
    console.log(chalk.white('┌──────┬──────┬────────────────┐'));
    console.log(chalk.white('│ Tipo │ Host │ Valor          │'));
    console.log(chalk.white('├──────┼──────┼────────────────┤'));
    console.log(chalk.white(`│ A    │ @    │ ${response.instructions.ip} │`));
    console.log(chalk.white('└──────┴──────┴────────────────┘'));

    console.log(chalk.gray('\n🔧 Passos:'));
    response.instructions.steps.forEach((step, i) => {
      console.log(chalk.white(`  ${i + 1}. ${step}`));
    });

    console.log(chalk.gray('\n💡 Comandos úteis:'));
    console.log(chalk.white(`  • mozhost domain:verify ${domain} - verificar DNS`));
    console.log(chalk.white(`  • mozhost domain:watch ${domain} - monitorar propagação`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao adicionar domínio:'));
    
    if (error.response?.data) {
      const err = error.response.data.error;
      console.error(chalk.red(`   ${err}`));
      
      if (err.includes('já cadastrado')) {
        console.log(chalk.yellow('\n💡 Este domínio já está em uso'));
      } else if (err.includes('inválido')) {
        console.log(chalk.yellow('\n💡 Formato de domínio inválido'));
        console.log(chalk.gray('   Exemplo: exemplo.com ou api.exemplo.com'));
      }
    } else {
      console.error(chalk.red(`   ${error.message}`));
    }
    
    process.exit(1);
  }
}

// ============================================
// VERIFY - Verificar domínio
// ============================================
async function verify(domain) {
  try {
    if (!domain) {
      console.error(chalk.red('❌ Domínio não especificado'));
      console.log(chalk.gray('   Use: mozhost domain:verify <dominio>'));
      process.exit(1);
    }

    const spinner = ora(`Verificando ${domain}...`).start();

    const response = await api.verifyDomain(domain);
    spinner.stop();

    console.log(chalk.cyan.bold(`\n🔍 Verificação de ${response.domain}\n`));

    // DNS
    console.log(chalk.white.bold('DNS:'));
    if (response.dns_valid) {
      console.log(`├─ Status: ${chalk.green('✅ Configurado')}`);
      console.log(`├─ IP atual: ${chalk.cyan(response.current_ip)}`);
      console.log(`└─ IP esperado: ${chalk.gray(response.expected_ip)}`);
    } else {
      console.log(`├─ Status: ${chalk.red('❌ Não configurado')}`);
      console.log(`├─ IP esperado: ${chalk.cyan(response.expected_ip)}`);
      console.log(`└─ IP atual: ${chalk.gray(response.current_ip || 'não encontrado')}`);
    }

    console.log();

    // SSL
    console.log(chalk.white.bold('SSL:'));
    if (response.ssl_active) {
      const expiryDate = new Date(response.ssl_expires);
      console.log(`├─ Status: ${chalk.green('✅ Ativo')}`);
      console.log(`└─ Expira: ${chalk.gray(expiryDate.toLocaleDateString('pt-BR'))}`);
    } else {
      console.log(`└─ Status: ${chalk.yellow('⏳ Pendente/Gerando...')}`);
    }

    console.log();

    // Container
    console.log(chalk.gray(`📦 Container: ${response.container}`));
    console.log(chalk.gray(`📅 Criado: ${new Date(response.created_at).toLocaleString('pt-BR')}`));
    
    if (response.verified_at) {
      console.log(chalk.gray(`✅ Verificado: ${new Date(response.verified_at).toLocaleString('pt-BR')}`));
    }

    console.log();

    // Status final
    if (response.dns_valid && response.ssl_active) {
      console.log(chalk.green.bold('✅ Domínio totalmente funcional!'));
      console.log(chalk.cyan(`   🌐 https://${response.domain}\n`));
    } else if (response.dns_valid) {
      console.log(chalk.yellow('⚠️  DNS configurado, aguardando SSL...'));
      console.log(chalk.gray('   Pode levar de 2-5 minutos para o SSL ser gerado\n'));
    } else {
      console.log(chalk.red('❌ Configure o DNS primeiro'));
      console.log(chalk.gray(`   Aponte o registro A para: ${response.expected_ip}\n`));
    }

  } catch (error) {
    if (error.response?.status === 404) {
      console.error(chalk.red(`\n❌ Domínio "${domain}" não encontrado`));
      console.log(chalk.gray('   Use: mozhost domain:list para ver seus domínios'));
    } else {
      console.error(chalk.red('\n❌ Erro ao verificar domínio:'));
      console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    }
    process.exit(1);
  }
}

// ============================================
// WATCH - Monitorar domínio (polling)
// ============================================
async function watch(domain) {
  try {
    if (!domain) {
      console.error(chalk.red('❌ Domínio não especificado'));
      console.log(chalk.gray('   Use: mozhost domain:watch <dominio>'));
      process.exit(1);
    }

    console.log(chalk.cyan.bold(`\n🔍 Monitorando ${domain}...`));
    console.log(chalk.gray('   Pressione Ctrl+C para sair\n'));

    let attempt = 0;
    const maxAttempts = 40; // 20 minutos (30s * 40)

    const checkInterval = setInterval(async () => {
      attempt++;
      const time = new Date().toLocaleTimeString('pt-BR');

      try {
        const response = await api.verifyDomain(domain);

        if (response.dns_valid && response.ssl_active) {
          clearInterval(checkInterval);
          console.log(chalk.green(`[${time}] ✅ DNS propagado!`));
          console.log(chalk.green(`[${time}] ✅ SSL configurado!`));
          console.log(chalk.green.bold(`\n🎉 Domínio ativo: https://${domain}\n`));
          process.exit(0);
        } else if (response.dns_valid) {
          console.log(chalk.yellow(`[${time}] ✅ DNS OK | 🔒 Gerando SSL...`));
        } else {
          console.log(chalk.gray(`[${time}] ⏳ Aguardando DNS... (${attempt}/${maxAttempts})`));
        }

        if (attempt >= maxAttempts) {
          clearInterval(checkInterval);
          console.log(chalk.yellow('\n⏰ Tempo limite atingido'));
          console.log(chalk.gray('   Use: mozhost domain:verify para verificar manualmente'));
          process.exit(0);
        }

      } catch (error) {
        console.log(chalk.red(`[${time}] ❌ Erro: ${error.message}`));
      }

    }, 30000); // 30 segundos

    // Primeira verificação imediata
    try {
      const response = await api.verifyDomain(domain);
      const time = new Date().toLocaleTimeString('pt-BR');
      
      if (response.dns_valid && response.ssl_active) {
        clearInterval(checkInterval);
        console.log(chalk.green.bold(`🎉 Domínio já está ativo: https://${domain}\n`));
        process.exit(0);
      } else if (response.dns_valid) {
        console.log(chalk.yellow(`[${time}] ✅ DNS OK | 🔒 Gerando SSL...`));
      } else {
        console.log(chalk.gray(`[${time}] ⏳ Aguardando DNS...`));
      }
    } catch (error) {
      console.error(chalk.red(`❌ ${error.message}`));
      clearInterval(checkInterval);
      process.exit(1);
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Erro:'), error.message);
    process.exit(1);
  }
}

// ============================================
// REMOVE - Remover domínio
// ============================================
async function remove(containerIdentifier, domain) {
  try {
    if (!containerIdentifier || !domain) {
      console.error(chalk.red('❌ Container e domínio são obrigatórios'));
      console.log(chalk.gray('   Use: mozhost domain:remove <container> <dominio>'));
      process.exit(1);
    }

    const spinner = ora('Resolvendo container...').start();
    const container = await resolveContainer(containerIdentifier);

    spinner.text = 'Buscando domínio...';
    
    // Buscar domínios do container
    const domains = await api.getContainerDomains(container.id);
    const foundDomain = domains.find(d => d.domain === domain);

    if (!foundDomain) {
      spinner.fail(chalk.red(`Domínio "${domain}" não encontrado neste container`));
      process.exit(1);
    }

    spinner.stop();

    console.log(chalk.yellow('\n⚠️  Remover domínio:'));
    console.log(chalk.white(`   ${domain}`));
    console.log(chalk.gray('   O domínio será removido e o SSL será revogado\n'));

    const confirm = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Tem certeza?',
        default: false
      }
    ]);

    if (!confirm.confirmed) {
      console.log(chalk.yellow('Operação cancelada'));
      return;
    }

    const deleteSpinner = ora(`Removendo ${domain}...`).start();
    await api.deleteDomain(foundDomain.id);

    deleteSpinner.succeed(chalk.green(`✅ Domínio ${domain} removido com sucesso!`));

  } catch (error) {
    console.error(chalk.red('\n❌ Erro ao remover domínio:'));
    console.error(chalk.red(`   ${error.response?.data?.error || error.message}`));
    process.exit(1);
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  list,
  add,
  verify,
  watch,
  remove
};
