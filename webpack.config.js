const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const Dotenv = require('dotenv-webpack');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
    const isDev = argv.mode === 'development';

    return {
        mode: argv.mode || 'development',
        entry: {
            background: './src/background/index.js',
            'popup/popup': './src/popup/popup.jsx',
            'dashboard/dashboard': './src/dashboard/main.jsx',
            'content/trackPropertyButton': './src/content/trackPropertyButton.js',
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
                    { from: 'src/dashboard/dashboard.html', to: 'dashboard' },
                    { from: 'src/icons', to: 'icons' },
                ],
            }),
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': JSON.stringify(argv.mode),
            }),
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
            extensions: ['.js', '.jsx'],
        },
        module: {
            rules: [
                {
                    test: /\.jsx?$/,
                    exclude: (filePath) => {
                        return /node_modules/.test(filePath) || /scraper\.js$/.test(filePath);
                    },
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/preset-env', '@babel/preset-react'],
                            plugins: [
                                ['@babel/plugin-transform-runtime', { regenerator: true }],
                                ['transform-remove-console', {
                                    exclude: isDev ? ['error', 'warn', 'log', 'info'] : ['error', 'warn']
                                }], // Remove console logs in production, keep some in dev
                            ],
                        },
                    },
                },
                {
                    test: /\.css$/i,
                    use: ['style-loader', 'css-loader', 'postcss-loader'],
                },
                {
                    test: /\.(png|svg|jpg|jpeg|gif)$/i,
                    type: 'asset/resource',
                },
            ],
        },
        optimization: {
            minimize: !isDev,
            minimizer: [
                new TerserPlugin({
                    terserOptions: {
                        compress: true,
                        mangle: false, // <-- this is important for Manifest V3
                        format: {
                            comments: false,
                        },
                    },
                    extractComments: false,
                }),
            ],
        },
        experiments: {
            topLevelAwait: true,
        },
        devtool: isDev ? 'cheap-module-source-map' : false,
    };
};
