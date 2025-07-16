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
            background: './src/background.js',
            'popup/popup': './src/popup/popup.jsx',
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
                    exclude: /node_modules/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/preset-env', '@babel/preset-react'],
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
