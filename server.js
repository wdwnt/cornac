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
const ENTERTAINMENT_NEXTSHOW = 'entertainment.next_show';
const PARK_HOURS = 'park.hours';
const BLOG_LATEST_POSTS = 'blog.latest_posts';
const PODCAST_LISTEN = 'podcast.listen';
const NTUNES_LISTEN = 'ntunes.listen';
const DESTINATION_WEATHER = 'destination.weather';
const WDWNT_FUN = 'wdwnt.fun';
const CHARACTER_APPEARANCES = 'characters.appearances';

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
    } else if (action === ENTERTAINMENT_NEXTSHOW) {
        var result = await processNextShowRequest(parameters.entertainment);
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
    } else if (action === WDWNT_FUN) {
        var result = processFunRequest();
        resp.json(result);
    } else if (action === CHARACTER_APPEARANCES) {
        var result = await processCharacterAppearancesRequest(parameters.characters);
        resp.json(result);
    } else {
        const result = "Sorry! We don't handle that query yet!";
        let response = buildResponse(result, result);
        addResponseRequest(response);
        resp.json(response);
    }
});

async function processWaitTimeRequest(attraction_key) {
    const pool = new sql.ConnectionPool(db_config);
    await pool.connect();

    const result = await pool.query(`select top 1 * from AttractionInfos inner join Images on FacilityId = AttractionInfos.Id where LanguageProcessingKey = '${attraction_key}'`);
    pool.close();

    if (result.recordset.length == 0) {
        const response = `Sorry! We couldn't find an attraction that matches your request!`;
        let responseObject = buildResponse(response, response);
        addResponseRequest(responseObject);
        return responseObject;
    }

    const attraction = result.recordset[0];
    let speech = `${attraction.Name} is currently closed.`;

    if (attraction.CurrentStatus.includes('Temporary')) {
        speech = `${attraction.Name} is experiencing a temporary closure.`
    } else if (attraction.CurrentStatus.includes('Posted')) {
        speech = `The current wait time for ${attraction.Name} is ${attraction.WaitTime} minutes.`
    }

    let imageUrl = `https://${attraction.Domain}${attraction.FileLocation}`;

    let response = buildResponse(speech, speech, true);
    addCardResponse(response.payload.google.richResponse.items, attraction.Name,
        attraction.CurrentStatus, attraction.Description, imageUrl);

    let moreInfoUrl = `https://now.wdwnt.com/attraction/details/${attraction.Id[0]}`;
    addButtonToCardResponse(response.payload.google.richResponse.items[1], "More info", moreInfoUrl);

    addResponseRequest(response);

    return response;
}

async function processNextShowRequest(entertainment_key) {
    let url = `https://now.wdwnt.com/entertainment/getbylanguageprocessingkey?languageprocessingkey=${entertainment_key}`;
    let json = await downloadJson(url);

    let response = buildResponse(json.speech, json.speech, true);
    addCardResponse(response.payload.google.richResponse.items, json.name, null,
        json.description, json.imageUrl);

    let moreInfoUrl = `https://now.wdwnt.com/entertainment/details/${json.id}`;
    addButtonToCardResponse(response.payload.google.richResponse.items[1], "More info", moreInfoUrl);

    addResponseRequest(response);

    return response;
}

async function processParkHoursRequest(park_key, date) {
    const pool = new sql.ConnectionPool(db_config);
    await pool.connect();

    const result = await pool.query(`select * from ParkInfos where Abbreviation = '${park_key}'`);
    pool.close();

    if (result.recordset.length == 0) {
        let response = `Sorry! We couldn't find hours for that park!`;
        return buildResponse(response, response);
    }

    const park = result.recordset[0];
    let speech = `${park.Name} is closed today.`;

    if (park.TodaysHours.toLowerCase().indexOf('closed') === -1) {
        var parkHours = park.TodaysHours
            .replace("<br />", "")
            .replace("EMH:", "extra magic hours from")
            .replace("EMH", "extra magic hours from")
            .replace("+ Special Event", "with a special event")
            .replace("  ", " ");

        speech = `${park.Name} is open today from ${parkHours}.`;
    }

    let response = buildResponse(speech, speech, true);
    addCardResponse(response.payload.google.richResponse.items, park.Name, park.TodaysHours,
        park.Description, park.ImageUrl);

    let moreInfoUrl = `https://now.wdwnt.com/parkinfo/index/${park.Id}`;
    addButtonToCardResponse(response.payload.google.richResponse.items[1], "More info", moreInfoUrl);

    addResponseRequest(response);

    return response;
}

async function processLatestHeadlinesRequest() {
    let json = await downloadJson('https://fastpass.wdwnt.com/posts');

    var headlines = json.slice(0, 3)
        .map(p => p.title)
        .join(". ");

    var text = `Here are the latest headlines! ${headlines}`;

    let response = buildResponse(text, text);
    addResponseRequest(response);

    return response;
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

    let response = buildResponse(json.speech, json.displayText);
    addResponseRequest(response);

    return response;
}

function processFunRequest() {
    let audioUrls = [
        {
            src: 'https://appcdn.wdwnt.com/cornac/audio/btmrr.mp3',
            text: 'Hang on tight to them hats and glasses!',
        },
        {
            src: 'https://appcdn.wdwnt.com/cornac/audio/haunted_mansion.mp3',
            text: 'Welcome, foolish mortals, to the Haunted Mansion...'
        },
        {
            src: 'https://appcdn.wdwnt.com/cornac/audio/tiki.mp3',
            text: 'My siestas are getting shorter and shorter!'
        }
    ];

    const index = Math.floor(Math.random() * audioUrls.length);
    const randomAudio = audioUrls[index];
    const response = `<audio src=\"${randomAudio.src}\">${randomAudio.text}</audio>`;

    let responseObject = buildResponse(response, randomAudio.text);
    addResponseRequest(responseObject);

    return responseObject;
}

async function processCharacterAppearancesRequest(characters) {
    let url = `https://now.wdwnt.com/CharacterAppearances/ByCharacterNames?names=${characters}`;
    let json = await downloadJson(url);

    if (json.length === 0) {
        const response = 'There are no meet and greets listed today for that character.';
        return buildResponse(response, response);
    }

    var start = `You can meet ${json[0].Name} at the following places today:`;

    var response = json
        .map(ca => `${ca.Location} at ${ca.ParkName} from ${ca.NextAppearanceDisplay}`)
        .join(', ');

    var finalResponse = `${start} ${response}`;
    let responseObject = buildResponse(finalResponse, finalResponse);
    addResponseRequest(responseObject);

    return responseObject;
}

async function downloadJson(url) {
    let request = await fetch(url);
    return await request.json();
}

function buildResponse(speech, displayText, expectUserResponse = true) {
    var response = { payload: { google: {} } };

    response.payload.google.expectUserResponse = expectUserResponse;

    response.payload.google.richResponse = { items: [] };
    response.payload.google.richResponse.items.push({
        simpleResponse: {
            textToSpeech: `<speak>${speech}</speak>`,
            displayText: `${displayText}`
        }
    });

    return response;
}

function addCardResponse(richResponseItemsArray, title, subtitle, formattedText, imageUrl) {
    richResponseItemsArray.push({
        basicCard: {
            title,
            subtitle,
            formattedText,
            imageDisplayOptions: "CROPPED",
            image: {
                url: imageUrl,
                accessibilityText: title
            }
        }
    });
}

function addButtonToCardResponse(cardResponse, buttonTitle, buttonUrl) {
    cardResponse.basicCard.buttons = [];
    cardResponse.basicCard.buttons.push({
        title: buttonTitle,
        openUrlAction: {
            url: buttonUrl
        }
    });
}


function buildMediaResponse(media, expectUserResponse = false) {
    let response = buildResponse(media.title, media.title, expectUserResponse);

    let description = parser.parse(media.content);

    response.payload.google.richResponse.items.push({
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
    });

    addResponseRequest(response, expectUserResponse);

    return response;
}

function addResponseRequest(response, expectUserResponse = true) {
    if (expectUserResponse) {
        response.payload.google.richResponse.items.push(buildUserResponseRequest());
    }
}

function buildUserResponseRequest() {
    const userResponseRequestText = `Anything else?`;

    return {
        simpleResponse: {
            textToSpeech: `<speak>${userResponseRequestText}</speak>`,
            displayText: `${userResponseRequestText}`
        }
    };
}

app.listen(port);
console.log(hostname + ": App listening on port " + port);
