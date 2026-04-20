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
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
async function fixIndexes() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose_1.default.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        const db = mongoose_1.default.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }
        const collection = db.collection('users');
        console.log('\n📋 Current indexes:');
        const indexes = await collection.indexes();
        indexes.forEach((index) => {
            console.log(`  - ${JSON.stringify(index.key)} (unique: ${index.unique || false})`);
        });
        console.log('\n🗑️  Dropping old providerId unique index...');
        try {
            await collection.dropIndex('providerId_1');
            console.log('✅ Successfully dropped providerId_1 index');
        }
        catch (error) {
            if (error.code === 27) {
                console.log('ℹ️  Index providerId_1 does not exist (already dropped)');
            }
            else {
                throw error;
            }
        }
        console.log('\n✨ Creating new sparse index on providerId...');
        await collection.createIndex({ providerId: 1 }, { unique: true, sparse: true });
        console.log('✅ Created sparse unique index on providerId');
        console.log('\n📋 Updated indexes:');
        const updatedIndexes = await collection.indexes();
        updatedIndexes.forEach((index) => {
            console.log(`  - ${JSON.stringify(index.key)} (unique: ${index.unique || false}, sparse: ${index.sparse || false})`);
        });
        console.log('\n✅ Database fix completed successfully!');
        console.log('💡 Now you can signup with email/password without providerId errors');
    }
    catch (error) {
        console.error('❌ Error fixing indexes:', error);
        process.exit(1);
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
        process.exit(0);
    }
}
fixIndexes();
//# sourceMappingURL=fix-mongodb-index.js.map