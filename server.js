require('dotenv').config();
const sql = require('mssql');
const os = require("os");
const fetch = require("node-fetch");

var express = require('express');
var app = express();
app.use(express.json());

var hostname = os.hostname();
var port = process.env.PORT || 3000;

const db_config = {
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
};

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.post("/api/language/respondtoquery", async (req, resp) => {
    var action = req.body.queryResult.action;
    var parameters = req.body.queryResult.parameters;

    if (action === 'attraction.wait') {
        var result = await processWaitTimeRequest(parameters.attraction);
        resp.json(result);
    } else if (action === 'park.hours') {
        var result = await processParkHoursRequest(parameters.park, parameters.date);
        resp.json(result);
    } else if (action === 'blog.latest_posts') {
        var result = await processLatestHeadlinesRequest();
        resp.json(result);
    } else {
        resp.json(buildResponse("Sorry! We don't handle that query yet!"));
    }
});

async function processWaitTimeRequest(attraction_key) {
    const pool = new sql.ConnectionPool(db_config);
    await pool.connect();

    const result = await pool.query(`select * from AttractionInfos where LanguageProcessingKey = '${attraction_key}'`);
    pool.close();

    if (result.recordset.length == 0) {
        return buildResponse("Sorry! We couldn't find an attraction that matches your request!");
    }

    const attraction = result.recordset[0];
    let fulfillmentText = `${attraction.Name} is currently closed.`;

    if (attraction.CurrentStatus.includes('Temporary')) {
        fulfillmentText = `${attraction.Name} is experiencing a temporary closure.`
    }
    else if (attraction.CurrentStatus.includes('Posted')) {
        fulfillmentText = `The current wait time for ${attraction.Name} is ${attraction.WaitTime} minutes.`
    }

    return buildResponse(fulfillmentText);
}

async function processParkHoursRequest(park_key, date) {
    const pool = new sql.ConnectionPool(db_config);
    await pool.connect();

    const result = await pool.query(`select * from ParkInfos where Abbreviation = '${park_key}'`);
    pool.close();

    if (result.recordset.length == 0) {
        return buildResponse("Sorry! We couldn't find hours for that park!");
    }

    const park = result.recordset[0];
    var parkHours = park.TodaysHours
        .replace("<br />", "")
        .replace("EMH:", "extra magic hours from")
        .replace("EMH", "extra magic hours from")
        .replace("+ Special Event", "with a special event")
        .replace("  ", " ");

    return buildResponse(`${park.Name} is open today from ${parkHours}.`);
}

async function processLatestHeadlinesRequest() {
    let request = await fetch('https://fastpass.wdwnt.com/posts');
    let responseJson = await request.json();

    var test = responseJson.slice(0, 3)
        .map(p => p.title)
        .join(". ");

    return buildResponse(test);
}

function buildResponse(fulfillmentText) {
    return {
        fulfillment_text: fulfillmentText
    };
}

app.listen(port);
console.log(hostname + ": App listening on port " + port);
