const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.mozhost');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const PROJECT_CONFIG = '.mozhost.json';

class Config {
  constructor() {
    this.ensureConfigDir();
  }

  ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  // Configuração global (token, API URL, etc)
  async getGlobalConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return await fs.readJson(CONFIG_FILE);
      }
      return {};
    } catch (error) {
      return {};
    }
  }

  async setGlobalConfig(config) {
    await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
  }

  async updateGlobalConfig(updates) {
    const current = await this.getGlobalConfig();
    await this.setGlobalConfig({ ...current, ...updates });
  }

  async getToken() {
    const config = await this.getGlobalConfig();
    return config.token || null;
  }

  async setToken(token) {
    await this.updateGlobalConfig({ token });
  }

  async clearToken() {
    const config = await this.getGlobalConfig();
    delete config.token;
    delete config.user;
    await this.setGlobalConfig(config);
  }

  async getApiUrl() {
    const config = await this.getGlobalConfig();
    return config.apiUrl || process.env.MOZHOST_API_URL || 'https://api.mozhost.shop';
  }

  async setApiUrl(apiUrl) {
    await this.updateGlobalConfig({ apiUrl });
  }

  async getUser() {
    const config = await this.getGlobalConfig();
    return config.user || null;
  }

  async setUser(user) {
    await this.updateGlobalConfig({ user });
  }

  // Configuração do projeto local
  async getProjectConfig() {
    try {
      const projectConfigPath = path.join(process.cwd(), PROJECT_CONFIG);
      if (fs.existsSync(projectConfigPath)) {
        return await fs.readJson(projectConfigPath);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async setProjectConfig(config) {
    const projectConfigPath = path.join(process.cwd(), PROJECT_CONFIG);
    await fs.writeJson(projectConfigPath, config, { spaces: 2 });
  }

  async getLinkedContainer() {
    const projectConfig = await this.getProjectConfig();
    return projectConfig?.container || null;
  }

  async linkContainer(containerId, containerName) {
    await this.setProjectConfig({
      container: containerId,
      name: containerName,
      linkedAt: new Date().toISOString()
    });
  }

  async unlinkContainer() {
    const projectConfigPath = path.join(process.cwd(), PROJECT_CONFIG);
    if (fs.existsSync(projectConfigPath)) {
      await fs.remove(projectConfigPath);
    }
  }
}

module.exports = new Config();
