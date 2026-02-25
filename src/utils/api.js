const axios = require('axios');
const config = require('./config');
const chalk = require('chalk');

class ApiClient {
  async getClient() {
    const baseURL = await config.getApiUrl();
    const token = await config.getToken();

    const client = axios.create({
      baseURL,
      timeout: 160000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add auth token if available
    if (token) {
      client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    // Response interceptor for error handling
    client.interceptors.response.use(
      response => response,
      async error => {
        if (error.response?.status === 401) {
          console.error(chalk.red('❌ Não autenticado. Use: mozhost auth'));
          await config.clearToken();
          process.exit(1);
        }
        throw error;
      }
    );

    return client;
  }

  // Auth
  async login(credentials) {
    const client = await this.getClient();
    const response = await client.post('/api/auth/login', credentials);
    return response.data;
  }

  async verify() {
    const client = await this.getClient();
    const response = await client.get('/api/auth/verify');
    return response.data;
  }

  // Containers
  async listContainers() {
    const client = await this.getClient();
    const response = await client.get('/api/containers');
    return response.data;
  }

  async getContainer(containerId) {
    const client = await this.getClient();
    const response = await client.get(`/api/containers/${containerId}`);
    return response.data;
  }

  async createContainer(data) {
    const client = await this.getClient();
    const response = await client.post('/api/containers', data);
    return response.data;
  }

  async startContainer(containerId) {
    const client = await this.getClient();
    const response = await client.post(`/api/containers/${containerId}/start`);
    return response.data;
  }

  async stopContainer(containerId) {
    const client = await this.getClient();
    const response = await client.post(`/api/containers/${containerId}/stop`);
    return response.data;
  }

  async restartContainer(containerId) {
    const client = await this.getClient();
    const response = await client.post(`/api/containers/${containerId}/restart`);
    return response.data;
  }

  async deleteContainer(containerId) {
    const client = await this.getClient();
    const response = await client.delete(`/api/containers/${containerId}`);
    return response.data;
  }

  async getContainerLogs(containerId, tail = 100) {
    const client = await this.getClient();
    const response = await client.get(`/api/containers/${containerId}/logs`, {
      params: { tail }
    });
    return response.data;
  }

  // Files
  async listFiles(containerId, dirPath = '/') {
    const client = await this.getClient();
    const response = await client.get(`/api/files/${containerId}`, {
      params: { path: dirPath }
    });
    return response.data;
  }

  async uploadFile(containerId, filePath, content) {
    const client = await this.getClient();

    // 🔍 DEBUG
    console.log('📤 Upload:', {
      endpoint: `/api/files/${containerId}/cli-upload`,
      filePath,
      contentLength: content.length
    });

    try {
      const response = await client.post(`/api/files/${containerId}/cli-upload`, {
        path: filePath,
        content
      });
      return response.data;
    } catch (error) {
      // 🔍 DEBUG - Mostrar erro completo
      console.error('❌ Upload error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      throw error;
    }
  }

  async uploadFiles(containerId, files) {
    const client = await this.getClient();
    const FormData = require('form-data');
    const form = new FormData();

    for (const file of files) {
      form.append('files', file.content, {
        filename: file.path,
        filepath: file.path
      });
    }

    const response = await client.post(
      `/api/files/${containerId}/upload`,
      form,
      {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );
    return response.data;
  }

  async deleteFile(containerId, filePath) {
    const client = await this.getClient();
    const response = await client.delete(`/api/files/${containerId}`, {
      data: { path: filePath }
    });
    return response.data;
  }

  // Databases
  async listDatabases() {
    const client = await this.getClient();
    const response = await client.get('/api/databases');
    return response.data;
  }

  async getDatabase(databaseId) {
    const client = await this.getClient();
    const response = await client.get(`/api/databases/${databaseId}`);
    return response.data;
  }

  async createDatabase(data) {
    const client = await this.getClient();
    const response = await client.post('/api/databases', data);
    return response.data;
  }

  async deleteDatabase(databaseId) {
    const client = await this.getClient();
    const response = await client.delete(`/api/databases/${databaseId}`);
    return response.data;
  }

  async linkDatabase(databaseId, containerId) {
    const client = await this.getClient();
    const response = await client.post(`/api/databases/${databaseId}/link`, {
      container_id: containerId
    });
    return response.data;
  }

  // Domains
  async listDomains() {
    const client = await this.getClient();
    const response = await client.get('/api/domains');
    return response.data;
  }

  async getContainerDomains(containerId) {
    const client = await this.getClient();
    const response = await client.get(`/api/domains/container/${containerId}`);
    return response.data;
  }

  async addDomain(data) {
    const client = await this.getClient();
    const response = await client.post('/api/domains', data);
    return response.data;
  }

  async verifyDomain(domain) {
    const client = await this.getClient();
    const response = await client.get(`/api/domains/verify/${domain}`);
    return response.data;
  }

  async deleteDomain(domainId) {
    const client = await this.getClient();
    const response = await client.delete(`/api/domains/${domainId}`);
    return response.data;
  }

  // GitHub
  async githubDeviceStart() {
    const client = await this.getClient();
    const response = await client.post('/api/github/device/start');
    return response.data;
  }

  async githubDevicePoll(deviceCode) {
    const client = await this.getClient();
    const response = await client.post('/api/github/device/poll', { device_code: deviceCode });
    return response.data;
  }

  async githubStatus() {
    const client = await this.getClient();
    const response = await client.get('/api/github/status');
    return response.data;
  }

  async githubRepos() {
    const client = await this.getClient();
    const response = await client.get('/api/github/repos');
    return response.data;
  }

  async githubBranches(owner, repo) {
    const client = await this.getClient();
    const response = await client.get(`/api/github/repos/${owner}/${repo}/branches`);
    return response.data;
  }

  async githubConnect(data) {
    const client = await this.getClient();
    const response = await client.post('/api/github/connect', data);
    return response.data;
  }

  async githubDeploys(containerId) {
    const client = await this.getClient();
    const response = await client.get(`/api/github/deploys/${containerId}`);
    return response.data;
  }

  async githubDisconnect() {
    const client = await this.getClient();
    const response = await client.delete('/api/github/disconnect');
    return response.data;
  }

  // Terminal
  async executeCommand(containerId, command) {
    const client = await this.getClient();
    const response = await client.post(`/api/terminal/${containerId}/exec`, {
      command
    });
    return response.data;
  }
}

module.exports = new ApiClient();
