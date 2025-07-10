const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const Dotenv = require('dotenv-webpack');

module.exports = (env, argv) => {
    const isDev = argv.mode === 'development';

    return {
        mode: argv.mode || 'development',
        entry: {
            background: './src/background.js',
            'popup/popup': './src/popup/popup.js',
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js',
        },
        plugins: [
            new CopyPlugin({
                patterns: [
                    { from: 'manifest.json', to: '' },
                    { from: 'src/popup/popup.html', to: 'popup' },
                    { from: 'src/icons', to: 'icons' }, 
                ],
            }),

            // Inject NODE_ENV for conditional logic
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': JSON.stringify(argv.mode),
            }),

            // Load .env.development or .env.production based on mode
            new Dotenv({
                path: isDev ? './.env.development' : './.env.production',
                systemvars: true,
            }),
        ],
        resolve: {
            fallback: {
                crypto: false,
                stream: false,
            },
        },
        experiments: {
            topLevelAwait: true,
        },
        devtool: isDev ? 'cheap-module-source-map' : false,

    };
};
