require('dotenv').config()
const webpack = require('webpack')

module.exports = {
  webpack: (config) => {
    config.plugins.push(new webpack.EnvironmentPlugin(process.env))
    return config
  },
  env: {
    GA_TRACKING_ID: process.env.GA_TRACKING_ID,
  },
}
