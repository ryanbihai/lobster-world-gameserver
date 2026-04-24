const { INFO, ERROR, EXCEPTION, DEBUG, WARN } = require('./logSvc.js')(__filename)

const METHODS = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  PATCH: 'patch',
  DELETE: 'delete',
}

function interceptRouters({ expressRouter, routers }) {
  for (const groupName in routers) {
    const rules = routers[groupName]
    
    rules.forEach(([path, method, handler, options = {}]) => {
      const routePath = path === '/' || !path ? '' : path.startsWith('/') ? path : `/${path}`
      const fullPath = groupName ? `/${groupName}${routePath}` : routePath || '/'
      
      const middlewares = options.preMiddlewares || []

      expressRouter[method](fullPath, ...middlewares, async (req, res, next) => {
        try {
          const params = { ...req.query, ...req.body, ...req.params }
          
          const authHeader = (req.headers['authorization'] || '').trim()
          let apiKey = null
          if (authHeader.startsWith('Bearer ')) {
            apiKey = authHeader.substring(7).trim()
          }
          
          const authContext = { req, res, apiKey }
          
          const result = await handler(params, authContext)

          if (!res.headersSent) {
            if (result && result.code !== undefined) {
              res.json({
                code: result.code,
                msg: result.msg || (result.code === 0 ? 'ok' : 'error'),
                data: result.data || {},
              })
            } else if (result) {
               res.json(result)
            } else {
               res.json({ code: 0, msg: 'ok', data: {} })
            }
          }
        } catch (err) {
          EXCEPTION(err)
          if (!res.headersSent) {
             res.json({ code: -1, msg: '服务器内部错误' })
          }
        }
      })
    })
  }
}

module.exports = { interceptRouters, METHODS }
