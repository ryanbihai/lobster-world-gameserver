const tracer = require('tracer')
const colors = require('colors')

const log_info = ' {{title}}: {{path}} : {{line}} - {{method}}, {{message}}'
const info = '{{timestamp}} - {{title}}: {{message}}'
const methods = ['INFO', 'ERROR', 'WARN', 'DEBUG', 'EXCEPTION', 'TRACE'].reduce((a, b) => a.concat(b).concat(b.toLowerCase()), [])

const options = {
  filters: {
    TRACE: colors.magenta,
    DEBUG: colors.green,
    INFO: colors.white,
    WARN: colors.yellow,
    ERROR: [colors.red, colors.bold],
    EXCEPTION: [colors.red, colors.bold],
    trace: colors.magenta,
    debug: colors.blue,
    info: colors.green,
    warn: colors.yellow,
    error: [colors.red, colors.bold],
    exception: [colors.red, colors.bold],
  },
  stackIndex: 1,
  format: [
    `${log_info} \n{{stack}}`,
    {
      INFO: `${log_info}`,
      info: `${info}`,
      DEBUG: `${log_info}`,
      WARN: `可能的错误(error): ${log_info}`,
    },
  ],
  dateformat: 'yyyy-mm-dd HH:MM:ss.l',
  methods: methods,
  preprocess: data => {
    data.path = data.path.replace(`${process.cwd()}/`, '')
    data.method = data.method.replace(/Object\.<anonymous>/, 'file-level').replace(/.*\.<anonymous>|^$/, 'closure')
  },
  transport: data => {
    console.log(data.output)
  },
}

const logger = tracer.colorConsole(options)

module.exports = filename => {
  const key = filename.replace(`${process.cwd()}/`, '')
  const isDebugEnabled = () => global.realtime_config?.debug?.[key] ?? global.realtime_config?.debug?.default ?? false

  const wrappedLogger = { ...logger }

  methods.forEach(method => {
    wrappedLogger[method] = (...args) => {
      if ((method === 'DEBUG' || method === 'debug') && !isDebugEnabled()) {
        return
      }
      logger[method](...args)
    }
  })

  return wrappedLogger
}
