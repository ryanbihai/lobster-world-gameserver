const { interceptRouters, METHODS: { GET, POST } } = require('./lib_core/routerlib')
const service = require('./service')

module.exports = expressRouter => {
  interceptRouters({
    expressRouter,
    routers: {
      // 接收来自 L0 的 webhook/sync 事件或客户端动作请求
      game: [
        ['action', POST, service.handleClientAction],
      ]
    }
  })
}