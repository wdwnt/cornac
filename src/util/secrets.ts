import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env')) {
    console.log('Using .env file to supply config environment variables');
    dotenv.config({ path: '.env' });
}

export const PORT = process.env.PORT || 3000;

export const DB_CONFIG = {
    database: process.env.DB_DATABASE,
    encrypt: true,
    password: process.env.DB_PASS,
    pool: {
        idleTimeoutMillis: 30000,
        max: 10,
        min: 0
    },
    server: process.env.DB_HOST,
    user: process.env.DB_USER
};
