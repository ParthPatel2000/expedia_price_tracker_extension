const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'production',
    entry: {
        background: './src/background.js',
        content: './src/content.js',
        'popup/popup': './src/popup/popup.js',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'manifest.json', to: '' },  // Copies manifest.json to dist/
                { from: 'src/popup/popup.html', to: 'popup' }  // popup.html copy into dist/popup/
            ],
        }),
    ],
    resolve: {
        fallback: {
            crypto: false,
            stream: false,
        },
    },
    experiments: {
        topLevelAwait: true, // Needed if you use top-level await (Firebase sometimes needs it)
    },
};
