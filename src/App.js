"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
require("./utils/cryptoPolyfill");
const react_1 = __importStar(require("react"));
const native_1 = require("@react-navigation/native");
const stack_1 = require("@react-navigation/stack");
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const react_native_1 = require("react-native");
const useNetworkStatus_1 = require("./hooks/useNetworkStatus");
const DemoAuthScreen_1 = __importDefault(require("./screens/DemoAuthScreen"));
const EnrollmentScreen_1 = __importDefault(require("./screens/EnrollmentScreen"));
const sqlite_1 = require("./services/database/sqlite");
const Stack = (0, stack_1.createStackNavigator)();
function App() {
    const [isDbReady, setIsDbReady] = (0, react_1.useState)(false);
    // Activate global connection monitoring and auto-sync on network reconnection
    (0, useNetworkStatus_1.useNetworkStatus)();
    (0, react_1.useEffect)(() => {
        async function setupDb() {
            try {
                await (0, sqlite_1.initializeDatabase)();
                setIsDbReady(true);
            }
            catch (err) {
                console.error('Failed to initialize database:', err);
                setIsDbReady(true);
            }
        }
        setupDb();
    }, []);
    if (!isDbReady) {
        return (<react_native_safe_area_context_1.SafeAreaProvider>
        <react_native_1.View style={{ flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
          <react_native_1.ActivityIndicator size="large" color="#1a237e"/>
        </react_native_1.View>
      </react_native_safe_area_context_1.SafeAreaProvider>);
    }
    return (<react_native_safe_area_context_1.SafeAreaProvider>
      <native_1.NavigationContainer>
        <Stack.Navigator initialRouteName="DemoAuthScreen">
          <Stack.Screen name="DemoAuthScreen" component={DemoAuthScreen_1.default} options={{ headerShown: false }}/>
          <Stack.Screen name="EnrollmentScreen" component={EnrollmentScreen_1.default} options={{
            title: 'Enrollment',
            headerStyle: {
                backgroundColor: '#ffffff',
            },
            headerTintColor: '#1a237e',
            headerTitleStyle: {
                fontWeight: 'bold',
            },
        }}/>
        </Stack.Navigator>
      </native_1.NavigationContainer>
    </react_native_safe_area_context_1.SafeAreaProvider>);
}
