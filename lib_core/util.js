const { v4: uuidv4 } = require('uuid')

exports.createId = () => uuidv4().replace(/-/g, '')

exports.getField = (obj, ...keys) => keys.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj)
