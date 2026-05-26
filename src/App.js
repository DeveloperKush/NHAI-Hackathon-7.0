"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
const react_1 = __importDefault(require("react"));
const native_1 = require("@react-navigation/native");
const stack_1 = require("@react-navigation/stack");
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const useNetworkStatus_1 = require("./hooks/useNetworkStatus");
const DemoAuthScreen_1 = __importDefault(require("./screens/DemoAuthScreen"));
const EnrollmentScreen_1 = __importDefault(require("./screens/EnrollmentScreen"));
const Stack = (0, stack_1.createStackNavigator)();
function App() {
    // Activate global connection monitoring and auto-sync on network reconnection
    (0, useNetworkStatus_1.useNetworkStatus)();
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
