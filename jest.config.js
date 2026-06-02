module.exports = {
  preset: 'react-native',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:react-native|react-native-.*|@react-native|@react-native-community|@react-native-async-storage|expo(nent)?|@expo(nent)?/.*|expo-.*|@react-native-community/netinfo)/)',
  ],
  moduleNameMapper: {
    '@react-native-async-storage/async-storage': '<rootDir>/__mocks__/@react-native-async-storage/async-storage.js',
  },
};
