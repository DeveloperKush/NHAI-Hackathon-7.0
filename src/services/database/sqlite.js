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
exports.db = void 0;
exports.executeSql = executeSql;
exports.initializeDatabase = initializeDatabase;
exports.initDatabase = initDatabase;
const SQLite = __importStar(require("expo-sqlite"));
exports.db = SQLite.openDatabase('binary_brains.db');
/**
 * Execute a SQL query on the database using a Promise-based wrapper.
 */
function executeSql(sql, params = []) {
    return new Promise((resolve, reject) => {
        exports.db.transaction((tx) => {
            tx.executeSql(sql, params, (_, result) => {
                resolve(result);
            }, (_, error) => {
                reject(error);
                return true; // rollback
            });
        }, (txError) => {
            reject(txError);
        });
    });
}
/**
 * Initialize all required SQLite tables.
 */
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        exports.db.transaction((tx) => {
            tx.executeSql(`CREATE TABLE IF NOT EXISTS enrolled_faces (
            user_id TEXT PRIMARY KEY,
            embedding BLOB,
            enrolled_at TEXT
          );`, [], () => { }, (_, err) => {
                reject(err);
                return true;
            });
            tx.executeSql(`CREATE TABLE IF NOT EXISTS auth_logs (
            log_id TEXT PRIMARY KEY,
            user_id TEXT,
            timestamp TEXT,
            gps_lat REAL,
            gps_lng REAL,
            device_id TEXT,
            similarity_score REAL,
            photo_thumb TEXT,
            synced INTEGER DEFAULT 0
          );`, [], () => {
                resolve();
            }, (_, err) => {
                reject(err);
                return true;
            });
        }, (txError) => {
            console.error('Database initialization transaction failed:', txError);
            reject(txError);
        }, () => {
            console.log('Database initialized successfully.');
            resolve();
        });
    });
}
// Keep initDatabase for backwards compatibility with tests
function initDatabase() {
    return initializeDatabase();
}
// Execute schema creation immediately on module load
initializeDatabase().catch((err) => {
    console.error('Failed to initialize database schema immediately on module load:', err);
});
