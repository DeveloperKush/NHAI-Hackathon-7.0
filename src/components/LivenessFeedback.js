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
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = LivenessFeedback;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
function LivenessFeedback({ message, type, onDismiss }) {
    // Auto-dismiss success after 1.5s
    (0, react_1.useEffect)(() => {
        if (type === 'success' && onDismiss) {
            const timer = setTimeout(() => {
                onDismiss();
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [type, onDismiss]);
    const handlePress = () => {
        if (type === 'error' && onDismiss) {
            onDismiss();
        }
    };
    // Determine background color based on type
    let backgroundColor = '#ff9800'; // default warning
    if (type === 'success') {
        backgroundColor = '#4caf50';
    }
    else if (type === 'error') {
        backgroundColor = '#f44336';
    }
    return (<react_native_1.TouchableOpacity activeOpacity={type === 'error' ? 0.8 : 1} onPress={handlePress} style={[styles.banner, { backgroundColor }]} testID="liveness-feedback-banner">
      <react_native_1.View style={styles.content}>
        <react_native_1.Text style={styles.primaryText}>{message}</react_native_1.Text>
        {type === 'error' && (<react_native_1.Text style={styles.secondaryText}>Tap to dismiss</react_native_1.Text>)}
      </react_native_1.View>
    </react_native_1.TouchableOpacity>);
}
const styles = react_native_1.StyleSheet.create({
    banner: {
        position: 'absolute',
        top: 40, // offset below notches/safe-area if not wrapped in SafeAreaView, but it will be within CameraOverlay which has SafeAreaView, or inside SafeAreaView of FaceAuthenticator. Let's make it top: 20 or similar so it fits nicely.
        left: 20,
        right: 20,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 20,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    content: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryText: {
        color: '#ffffff',
        fontFamily: 'System', // bold sans-serif
        fontWeight: 'bold',
        fontSize: 20, // 18-20pt
        textAlign: 'center',
    },
    secondaryText: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontFamily: 'System',
        fontSize: 14, // 14pt
        marginTop: 4,
        textAlign: 'center',
    },
});
