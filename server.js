require('dotenv').config();
const sql = require('mssql');
const os = require("os");
const fs = require('fs');

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
const WDWNT_CORNAC = 'wdwnt.cornac';
const WDWNT_WELCOME = 'wdwnt.welcome';
const CHARACTER_APPEARANCES = 'characters.appearances';

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.get("/", (req, resp) => {
    resp.redirect(301, process.env.CORNAC_LANDING_PAGE_URL);
});

app.post("/api/language/respondtoquery/alexa", async (req, resp) => {
    if (req.body.request) {
        if (req.body.request.type === 'LaunchRequest') {
            let response = await processRequest(WDWNT_WELCOME, {});
            let alexa_response = convertDialogflowResponseToAlexa(response);

            resp.json(alexa_response);
            return;
        }

        var intent = req.body.request.intent.name;
        var slots = req.body.request.intent.slots;

        let response = await processRequest(intent, slots);
        let alexa_response = convertDialogflowResponseToAlexa(response);

        resp.json(alexa_response);
        return;
    }

    let error_response = await processRequest(null, null);
    let alexa_response = convertDialogflowResponseToAlexa(error_response);

    resp.json(alexa_response);
});

app.post("/api/language/respondtoquery/dialogflow", async (req, resp) => {
    let response = await processDialogflowResponse(req);

    resp.json(response);
});

app.post("/api/language/respondtoquery", async (req, resp) => {
    let response = await processDialogflowResponse(req);

    resp.json(response);
});

async function processDialogflowResponse(req) {
    var action = req.body.queryResult.action;
    var parameters = req.body.queryResult.parameters;

    return await processRequest(action, parameters);
}

async function processRequest(action, parameters) {
    if (action === WDWNT_WELCOME || action === 'DefaultWelcomeIntent') {
        return processWelcomeRequest();
    } else if (action === ATTRACTION_WAIT || action === 'WaitTimeForAttraction') {
        return await processWaitTimeRequest(parameters.attraction);
    } else if (action === ENTERTAINMENT_NEXTSHOW || action === 'NextShowtimeForEntertainment') {
        return await processNextShowRequest(parameters.entertainment);
    } else if (action === PARK_HOURS || action === 'ParkHours') {
        return await processParkHoursRequest(parameters.park, parameters.date);
    } else if (action === BLOG_LATEST_POSTS || action === 'LatestHeadlines') {
        return await processLatestHeadlinesRequest();
    } else if (action === PODCAST_LISTEN || action === 'LatestPodcast') {
        return await processLatestPodcastRequest();
    } else if (action === NTUNES_LISTEN || action === 'Wdwntunes') {
        return await processNTunesListenRequest();
    } else if (action === DESTINATION_WEATHER || action === 'Weather') {
        return await processWeatherRequest(parameters.destination);
    } else if (action === WDWNT_FUN || action === 'Random') {
        return processFunRequest();
    } else if (action === WDWNT_CORNAC || action === 'Cornac') {
        return processCornacRequest();
    } else if (action === CHARACTER_APPEARANCES || action === 'MeetAndGreets') {
        return await processCharacterAppearancesRequest(parameters.characters);
    } else {
        const result = "Sorry! We don't handle that query yet!";
        let response = buildResponse(result, result);
        addResponseRequest(response);
        return response;
    }
}

function processWelcomeRequest() {
    let welcomeResponses = [
        'Welcome to WDWNT! What can I look up for you?',
        'To all who come to this happy app, welcome! What can I do for you?',
        'My siestas are getting shorter and shorter. How can I help?',
        'Welcome, foolish mortal, to the WDWNT app. How can I be of assistance?'
    ];

    const index = Math.floor(Math.random() * welcomeResponses.length);
    const randomResponse = welcomeResponses[index];

    let responseObject = buildResponse(randomResponse, randomResponse);
    addResponseRequest(responseObject);

    return responseObject;
}

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

    let firstPodcastEpisode = json[0];
    firstPodcastEpisode.speech = firstPodcastEpisode.title;
    firstPodcastEpisode.displayText = firstPodcastEpisode.title;

    return buildMediaResponse(firstPodcastEpisode);
}

async function processNTunesListenRequest() {
    let json = await downloadJson('https://fastpass.wdwnt.com/live365');
    let title = json['current-track'].title;
    let artist = json['current-track'].artist;

    let speech = `Playing right now on <say-as interpret-as=\"characters\">WDWN</say-as> Tunes is ${title} ${artist}.`;
    let displayText = `Playing right now on WDWNTunes is ${title} ${artist}.`;

    let ntunesInfo = {
        speech,
        displayText,
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
            text: 'Hang on to them hats and glasses!',
        },
        {
            src: 'https://appcdn.wdwnt.com/cornac/audio/haunted_mansion.mp3',
            text: 'Welcome, foolish mortals, to the Haunted Mansion...'
        },
        {
            src: 'https://appcdn.wdwnt.com/cornac/audio/tiki.mp3',
            text: 'My siestas are getting shorter and shorter!'
        },
        {
            src: 'https://appcdn.wdwnt.com/cornac/audio/257.mp3',
            text: 'Put up 2, 5, and 7. 7? Yeah...7.'
        },
        {
            src: 'https://appcdn.wdwnt.com/cornac/audio/pirates.mp3',
            text: "I'm not spongin' for rum. It be gold I'm after!"
        },
        {
            src: 'https://appcdn.wdwnt.com/cornac/audio/cop.mp3',
            text: 'No privacy at all around this place!'
        },
        {
            src: 'https://appcdn.wdwnt.com/cornac/audio/dreamfinder.mp3',
            text: 'Oh, hello there. So glad you could come along. I am the Dreamfinder!'
        }
    ];

    const index = Math.floor(Math.random() * audioUrls.length);
    const randomAudio = audioUrls[index];
    const response = `<audio src=\"${randomAudio.src}\">${randomAudio.text}</audio>`;

    let responseObject = buildResponse(response, randomAudio.text);
    addResponseRequest(responseObject);

    return responseObject;
}

function processCornacRequest() {
    let cornacData = fs.readFileSync('cornac.json');
    let jokes = JSON.parse(cornacData);

    const index = Math.floor(Math.random() * jokes.length);
    const randomJoke = jokes[index];

    let response = randomJoke.joke;
    response += '<audio src=\"https://appcdn.wdwnt.com/cornac/audio/open_envelope.mp3\">[Opens envelope]</audio>';
    response += randomJoke.punchline;
    response += '<audio src=\"https://appcdn.wdwnt.com/cornac/audio/rim_shot.mp3\">[Rimshot]</audio>';

    let displayText = `${randomJoke.joke_display} [Opens envelope] ${randomJoke.punchline_display} [Rimshot]`;

    let responseObject = buildResponse(response, displayText);
    addResponseRequest(responseObject);

    return responseObject;
}

async function processCharacterAppearancesRequest(characters) {
    let url = `https://now.wdwnt.com/CharacterAppearances/ByCharacterNames?names=${characters}`;
    let json = await downloadJson(url);

    if (json.length === 0) {
        const response = 'There are no meet and greets listed today for that character.';
        let responseObject = buildResponse(response, response);
        addResponseRequest(responseObject);

        return responseObject;
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

    response.fulfillment_text = displayText;

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
    let response = buildResponse(media.speech, media.displayText, expectUserResponse);

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
    let prompts = [
        `Anything else?`,
        `What else can I do for you?`,
        `Need more assistance?`
    ];

    const index = Math.floor(Math.random() * prompts.length);

    return {
        simpleResponse: {
            textToSpeech: `<speak>${prompts[index]}</speak>`,
            displayText: `${prompts[index]}`
        }
    };
}

function convertDialogflowResponseToAlexa(response) {
    let google_items = response.payload.google.richResponse.items;
    let simpleResponse = google_items[0].simpleResponse;

    let alexa_response = {
        response: {
            outputSpeech: {
                type: "PlainText",
                text: simpleResponse.displayText,
                ssml: simpleResponse.textToSpeech
            }
        },
        version: "v1"
    };

    return alexa_response;
}

app.listen(port);
console.log(hostname + ": App listening on port " + port);
