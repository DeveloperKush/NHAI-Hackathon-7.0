// Jest setup file
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  
  class MockWebView extends React.Component {
    render() {
      return React.createElement(View, this.props);
    }
  }

  return {
    WebView: MockWebView,
  };
});
