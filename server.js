require('dotenv').config();
const sql = require('mssql');
const os = require("os");
const fetch = require("node-fetch");

const parser = require("node-html-parser");

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

const ATTRACTION_WAIT = 'attraction.wait';
const PARK_HOURS = 'park.hours';
const BLOG_LATEST_POSTS = 'blog.latest_posts';
const PODCAST_LISTEN = 'podcast.listen';
const NTUNES_LISTEN = 'ntunes.listen';
const DESTINATION_WEATHER = 'destination.weather';

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.post("/api/language/respondtoquery", async (req, resp) => {
    var action = req.body.queryResult.action;
    var parameters = req.body.queryResult.parameters;

    if (action === ATTRACTION_WAIT) {
        var result = await processWaitTimeRequest(parameters.attraction);
        resp.json(result);
    } else if (action === PARK_HOURS) {
        var result = await processParkHoursRequest(parameters.park, parameters.date);
        resp.json(result);
    } else if (action === BLOG_LATEST_POSTS) {
        var result = await processLatestHeadlinesRequest();
        resp.json(result);
    } else if (action === PODCAST_LISTEN) {
        var result = await processLatestPodcastRequest();
        resp.json(result);
    } else if (action === NTUNES_LISTEN) {
        var result = processNTunesListenRequest();
        resp.json(result);
    } else if (action === DESTINATION_WEATHER) {
        var result = await processWeatherRequest(parameters.destination);
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
    } else if (attraction.CurrentStatus.includes('Posted')) {
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
    let json = await downloadJson('https://fastpass.wdwnt.com/posts');

    var headlines = json.slice(0, 3)
        .map(p => p.title)
        .join(". ");

    var text = `Here are the latest headlines! ${headlines}`;

    return buildResponse(text);
}

async function processLatestPodcastRequest() {
    let json = await downloadJson('https://fastpass.wdwnt.com/podcasts?noplayer');

    return buildMediaResponse(json[0]);
}

function processNTunesListenRequest() {
    let ntunesInfo = {
        title: 'WDWNTunes',
        content: 'Broadcasting magic, music and mayhem',
        media_url: 'http://edge1-b.exa.live365.net/a31769',
        featured_image: 'https://wdwnt.com/wp-content/uploads/2017/11/WDWNTunes_v3_600.png'
    };

    return buildMediaResponse(ntunesInfo);
}

async function processWeatherRequest(destination) {
    let json = await downloadJson(`https://weather.wdwnt.com/api/speech/${destination}`);

    return buildResponse(json.speech);
}

async function downloadJson(url) {
    let request = await fetch(url);
    return await request.json();
}

function buildResponse(fulfillmentText) {
    return {
        fulfillment_text: fulfillmentText
    };
}

function buildMediaResponse(media) {
    let description = parser.parse(media.content);

    return {
        payload: {
            google: {
                expectUserResponse: false,
                richResponse: {
                    items: [
                        {
                            simpleResponse: {
                                textToSpeech: media.title
                            }
                        },
                        {
                            mediaResponse: {
                                mediaType: "AUDIO",
                                mediaObjects: [
                                    {
                                        name: media.title,
                                        contentUrl: media.media_url,
                                        description: description.text,
                                        icon: {
                                            url: media.featured_image,
                                            accessibilityText: media.title
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            }
        }
    };
}

app.listen(port);
console.log(hostname + ": App listening on port " + port);
