const path = require("path");
const webpack = require('webpack');

module.exports = {
  entry: {
    app: './js/app.ts', // Input is TypeScript
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    filename: 'js/app.js', // Output must be JavaScript
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
      __VERSION__: JSON.stringify(require('./package.json').version),   // version from package.json
      __BUILD_NAME__: JSON.stringify(require('./package.json').name),    // name from package.json
    }),
  ],
};
