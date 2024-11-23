const { Pool } = require('pg');  // Using PostgreSQL pool

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'inventory_db5',  // Replace with your actual database name
    password: '12345',  // Replace with your actual password
    port: 5432,  // PostgreSQL default port
});

// Test the connection
pool.connect()
    .then(() => console.log("Database connected successfully!"))
    .catch(err => console.error("Database connection error: ", err.stack));

module.exports = pool;

