require('dotenv').config()
const sql = require('mssql')

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    encrypt: true,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
}

async function processWaitTimeRequest(natural_language_key) {
    const pool = new sql.ConnectionPool(config);
    await pool.connect();

    const result = await pool.query(`select * from AttractionInfos where LanguageProcessingKey = '${natural_language_key}'`);
    pool.close();

    if (result.recordset.length == 0) {
        console.log({
            fulfillment_text: "Sorry! We couldn't find an attraction that matches your request!"
        });

        return;
    }

    const attraction = result.recordset[0];
    let fulfillmentText = `${attraction.Name} is currently closed.`;

    if (attraction.CurrentStatus.includes('Temporary')) {
        fulfillmentText = `${attraction.Name} is experiencing a temporary closure.`
    }
    else if (attraction.CurrentStatus.includes('Posted')) {
        fulfillmentText = `The current wait time for ${attraction.Name} is ${attraction.WaitTime} minutes.`
    }

    let output = {
        fulfillment_text: fulfillmentText
    };

    console.log(output);
}

processWaitTimeRequest('ep.sse');