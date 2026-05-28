module.exports = {
  preset: 'react-native',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:react-native|react-native-.*|@react-native|@react-native-community|expo(nent)?|@expo(nent)?/.*|expo-.*|@react-native-community/netinfo)/)',
  ],
};
