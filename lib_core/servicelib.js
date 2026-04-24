const { INFO, ERROR, EXCEPTION, DEBUG, WARN } = require('./logSvc.js')(__filename)

class Service {
  constructor(opts) {
    this.dir = opts.__dirname
    this.file = opts.__filename
    this.module = opts.module
  }

  getConfig() {
    return global.realtime_config || {}
  }

  getAppConfig() {
    if (this._appConfig) return this._appConfig;

    const fs = require('fs');
    const path = require('path');
    let envSuffix = '';

    switch (process.env.NODE_ENV) {
      case 'development': envSuffix = 'dev'; break;
      case 'local': envSuffix = 'local'; break;
      default: envSuffix = ''; break;
    }

    let config = {};
    const baseConfigPath = path.join(this.dir, 'config.json');
    if (fs.existsSync(baseConfigPath)) {
      config = JSON.parse(fs.readFileSync(baseConfigPath, 'utf8'));
    }

    if (envSuffix) {
      const envConfigPath = path.join(this.dir, `config-${envSuffix}.json`);
      if (fs.existsSync(envConfigPath)) {
        const envConfig = JSON.parse(fs.readFileSync(envConfigPath, 'utf8'));
        config = { ...config, ...envConfig };
      }
    }

    this._appConfig = config;
    return config;
  }

  exportMe() {
    const exportsObj = this.module.exports
    for (const key in exportsObj) {
      if (typeof exportsObj[key] === 'function' && key !== 'exportMe' && key !== 'getConfig') {
        const original = exportsObj[key]

        exportsObj[key] = async (...args) => {
          try {
            return await original.apply(this, args)
          } catch(err) {
            EXCEPTION(`[Service 执行异常] Method: ${key}, Error: ${err.message}`)
            return { code: -1, msg: err.message, data: {} }
          }
        }
      }
    }
  }
}

module.exports = { Service }
