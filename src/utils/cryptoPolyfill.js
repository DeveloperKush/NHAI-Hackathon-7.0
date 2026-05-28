"use strict";
// Polyfill global.crypto.getRandomValues for CryptoJS in React Native (Hermes/JSC)
if (typeof global !== 'undefined') {
    if (typeof global.crypto !== 'object') {
        global.crypto = {};
    }
    if (typeof global.crypto.getRandomValues !== 'function') {
        global.crypto.getRandomValues = function (array) {
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
