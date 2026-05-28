// Polyfill global.crypto.getRandomValues for CryptoJS in React Native (Hermes/JSC)
if (typeof global !== 'undefined') {
  if (typeof (global as any).crypto !== 'object') {
    (global as any).crypto = {};
  }
  if (typeof (global as any).crypto.getRandomValues !== 'function') {
    (global as any).crypto.getRandomValues = function (array: any) {
      if (!array) {
        throw new Error('crypto.getRandomValues: Array is required');
      }
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    };
  }
}
