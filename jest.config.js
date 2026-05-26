module.exports = {
  preset: 'react-native',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:react-native|@react-native|@react-native-community|expo(nent)?|@expo(nent)?/.*|@react-native-community/netinfo)/)',
  ],
};
