import sql from 'mssql';
import parser from 'node-html-parser';

import { DialogFlowResponse } from '../models/response/dialogflow/dialogflow-response';
import { BlogPostResponse } from '../models/response/fastpass/blog-post-response';
import { PodcastEpisodeResponse } from '../models/response/fastpass/podcast-episode-response';
import { MeetAndGreetResponse } from '../models/response/meet-and-greet-response';
import { WeatherResponse } from '../models/response/weather-response';
import { Constants } from '../util/constants';
import { DB_CONFIG } from '../util/secrets';
import { CornacProcessor } from './cornac-processor';

export const processRequest = async (action: string, parameters: { attraction?: any;
    entertainment?: any; park?: any; date?: any; destination?: any; characters?: any; }): Promise<any> => {
    if (action === Constants.WDWNT_WELCOME || action === 'DefaultWelcomeIntent') {
        return processWelcomeRequest();
    } else if (action === Constants.ATTRACTION_WAIT || action === 'WaitTimeForAttraction') {
        return await processWaitTimeRequest(parameters.attraction);
    } else if (action === Constants.ENTERTAINMENT_NEXTSHOW || action === 'NextShowtimeForEntertainment') {
        return await processNextShowRequest(parameters.entertainment);
    } else if (action === Constants.PARK_HOURS || action === 'ParkHours') {
        return await processParkHoursRequest(parameters.park, parameters.date);
    } else if (action === Constants.BLOG_LATEST_POSTS || action === 'LatestHeadlines') {
        return await processLatestHeadlinesRequest();
    } else if (action === Constants.PODCAST_LISTEN || action === 'LatestPodcast') {
        return await processLatestPodcastRequest();
    } else if (action === Constants.NTUNES_LISTEN || action === 'Wdwntunes') {
        return await processNTunesListenRequest();
    } else if (action === Constants.DESTINATION_WEATHER || action === 'Weather') {
        return await processWeatherRequest(parameters.destination);
    } else if (action === Constants.WDWNT_FUN || action === 'Random') {
        return processFunRequest();
    } else if (action === Constants.WDWNT_CORNAC || action === 'Cornac') {
        return processCornacRequest();
    } else if (action === Constants.CHARACTER_APPEARANCES || action === 'MeetAndGreets') {
        return await processCharacterAppearancesRequest(parameters.characters);
    } else {
        const result = 'Sorry! We don\'t handle that query yet!';
        const response = buildResponse(result, result);
        addResponseRequest(response);
        return response;
    }
};

function processWelcomeRequest() {
    const welcomeResponses = [
        'Welcome to WDWNT! What can I look up for you?',
        'To all who come to this happy app, welcome! What can I do for you?',
        'My siestas are getting shorter and shorter. How can I help?',
        'Welcome, foolish mortal, to the WDWNT app. How can I be of assistance?'
    ];

    const index = Math.floor(Math.random() * welcomeResponses.length);
    const randomResponse = welcomeResponses[index];

    const responseObject = buildResponse(randomResponse, randomResponse);
    addResponseRequest(responseObject);

    return responseObject;
}

async function processWaitTimeRequest(attractionKey: string) {
    const pool = new sql.ConnectionPool(DB_CONFIG);
    await pool.connect();

    const result = await pool.query(`select top 1 * from AttractionInfos inner join Images on FacilityId = AttractionInfos.Id where LanguageProcessingKey = '${attractionKey}'`);
    pool.close();

    if (result.recordset.length === 0) {
        const noMatchingAttractionsResponse = `Sorry! We couldn't find an attraction that matches your request!`;
        const responseObject = buildResponse(noMatchingAttractionsResponse, noMatchingAttractionsResponse);
        addResponseRequest(responseObject);
        return responseObject;
    }

    const attraction = result.recordset[0];
    let speech = `${attraction.Name} is currently closed.`;

    if (attraction.CurrentStatus.includes('Temporary')) {
        speech = `${attraction.Name} is experiencing a temporary closure.`;
    } else if (attraction.CurrentStatus.includes('Posted')) {
        speech = `The current wait time for ${attraction.Name} is ${attraction.WaitTime} minutes.`;
    }

    const imageUrl = `https://${attraction.Domain}${attraction.FileLocation}`;

    const response = buildResponse(speech, speech, true);
    addCardResponse(response.payload.google.richResponse.items, attraction.Name,
        attraction.CurrentStatus, attraction.Description, imageUrl);

    const moreInfoUrl = `https://now.wdwnt.com/attraction/details/${attraction.Id[0]}`;
    addButtonToCardResponse(response.payload.google.richResponse.items[1], 'More info', moreInfoUrl);

    addResponseRequest(response);

    return response;
}

async function processNextShowRequest(entertainmentKey: string) {
    const url = `https://now.wdwnt.com/entertainment/getbylanguageprocessingkey?languageprocessingkey=${entertainmentKey}`;
    const json = await downloadJson(url);

    const response = buildResponse(json.speech, json.speech, true);
    addCardResponse(response.payload.google.richResponse.items, json.name, null,
        json.description, json.imageUrl);

    const moreInfoUrl = `https://now.wdwnt.com/entertainment/details/${json.id}`;
    addButtonToCardResponse(response.payload.google.richResponse.items[1], 'More info', moreInfoUrl);

    addResponseRequest(response);

    return response;
}

async function processParkHoursRequest(parkKey: string, date: Date) {
    const pool = new sql.ConnectionPool(DB_CONFIG);
    await pool.connect();

    const result = await pool.query(`select * from ParkInfos where Abbreviation = '${parkKey}'`);
    pool.close();

    if (result.recordset.length === 0) {
        const noHoursFoundResponse = `Sorry! We couldn't find hours for that park!`;
        return buildResponse(noHoursFoundResponse, noHoursFoundResponse);
    }

    const park = result.recordset[0];
    let speech = `${park.Name} is closed today.`;

    if (park.TodaysHours.toLowerCase().indexOf('closed') === -1) {
        const parkHours = park.TodaysHours
            .replace('<br />', '')
            .replace('EMH:', 'extra magic hours from')
            .replace('EMH', 'extra magic hours from')
            .replace('+ Special Event', 'with a special event')
            .replace('  ', ' ');

        speech = `${park.Name} is open today from ${parkHours}.`;
    }

    const response = buildResponse(speech, speech, true);
    addCardResponse(response.payload.google.richResponse.items, park.Name, park.TodaysHours,
        park.Description, park.ImageUrl);

    const moreInfoUrl = `https://now.wdwnt.com/parkinfo/index/${park.Id}`;
    addButtonToCardResponse(response.payload.google.richResponse.items[1], 'More info', moreInfoUrl);

    addResponseRequest(response);

    return response;
}

async function processLatestHeadlinesRequest() {
    const json = await downloadJson('https://fastpass.wdwnt.com/posts') as BlogPostResponse[];

    const headlines = json.slice(0, 3)
        .map((p) => p.title)
        .join('. ');

    const text = `Here are the latest headlines! ${headlines}`;

    const response = buildResponse(text, text);
    addResponseRequest(response);

    return response;
}

async function processLatestPodcastRequest() {
    const json = await downloadJson(Constants.PODCAST_URL) as PodcastEpisodeResponse[];

    const firstPodcastEpisode = json[0];
    firstPodcastEpisode.speech = firstPodcastEpisode.title;
    firstPodcastEpisode.displayText = firstPodcastEpisode.title;

    return buildMediaResponse(firstPodcastEpisode);
}

async function processNTunesListenRequest() {
    const json = await downloadJson('https://fastpass.wdwnt.com/live365');
    const title = json['current-track'].title;
    const artist = json['current-track'].artist;

    const speech = `Playing right now on <say-as interpret-as=\"characters\">WDWN</say-as> Tunes is ${title} ${artist}.`;
    const displayText = `Playing right now on WDWNTunes is ${title} ${artist}.`;

    const ntunesInfo = {
        content: 'Broadcasting magic, music and mayhem',
        displayText,
        featured_image: 'https://wdwnt.com/wp-content/uploads/2017/11/WDWNTunes_v3_600.png',
        media_url: 'http://edge1-b.exa.live365.net/a31769',
        speech
    };

    return buildMediaResponse(ntunesInfo);
}

async function processWeatherRequest(destination: string) {
    const json = await downloadJson(`https://weather.wdwnt.com/api/speech/${destination}`) as WeatherResponse;

    const response = buildResponse(json.speech, json.displayText);
    addResponseRequest(response);

    return response;
}

function processFunRequest() {
    const audioUrls = [
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
            text: 'I\'m not spongin\' for rum. It be gold I\'m after!'
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

    const responseObject = buildResponse(response, randomAudio.text);
    addResponseRequest(responseObject);

    return responseObject;
}

function processCornacRequest() {
    const cornacResponse = new CornacProcessor().process();

    const responseObject = buildResponse(cornacResponse.response, cornacResponse.displayText);
    addResponseRequest(responseObject);

    return responseObject;
}

async function processCharacterAppearancesRequest(characters: string) {
    const url = `https://now.wdwnt.com/CharacterAppearances/ByCharacterNames?names=${characters}`;
    const json = await downloadJson(url);

    if (json.length === 0) {
        const noMeetAndGreetsResponse = 'There are no meet and greets listed today for that character.';
        const noMeetAndGreetsResponseObject = buildResponse(noMeetAndGreetsResponse, noMeetAndGreetsResponse);
        addResponseRequest(noMeetAndGreetsResponseObject);

        return noMeetAndGreetsResponseObject;
    }

    const start = `You can meet ${json[0].Name} at the following places today:`;

    const response = json
        .map((ca: MeetAndGreetResponse) => `${ca.Location} at ${ca.ParkName} from ${ca.NextAppearanceDisplay}`)
        .join(', ');

    const finalResponse = `${start} ${response}`;
    const responseObject = buildResponse(finalResponse, finalResponse);
    addResponseRequest(responseObject);

    return responseObject;
}

async function downloadJson(url: string) {
    const request = await fetch(url);
    return await request.json();
}

function buildResponse(speech: string, displayText: string, expectUserResponse = true) {
    const response = new DialogFlowResponse();

    response.fulfillment_text = displayText;

    response.payload.google.expectUserResponse = expectUserResponse;

    response.payload.google.richResponse = { items: [] };
    response.payload.google.richResponse.items.push({
        simpleResponse: {
            displayText: `${displayText}`,
            textToSpeech: `<speak>${speech}</speak>`
        }
    });

    return response;
}

function addCardResponse(richResponseItemsArray: any, title: string,
                         subtitle: string, formattedText: string, imageUrl: string) {
    richResponseItemsArray.push({
        basicCard: {
            formattedText,
            image: {
                accessibilityText: title,
                url: imageUrl
            },
            imageDisplayOptions: 'CROPPED',
            subtitle,
            title,
        }
    });
}

function addButtonToCardResponse(cardResponse: any, buttonTitle: string, buttonUrl: string) {
    cardResponse.basicCard.buttons = [];
    cardResponse.basicCard.buttons.push({
        openUrlAction: {
            url: buttonUrl
        },
        title: buttonTitle
    });
}

function buildMediaResponse(media: any, expectUserResponse = false) {
    const response = buildResponse(media.speech, media.displayText, expectUserResponse);

    const description = parser.parse(media.content);

    response.payload.google.richResponse.items.push({
        mediaResponse: {
            mediaObjects: [
                {
                    contentUrl: media.media_url,
                    description: description.text,
                    icon: {
                        accessibilityText: media.title,
                        url: media.featured_image
                    },
                    name: media.title,
                }
            ],
            mediaType: 'AUDIO'
        }
    });

    addResponseRequest(response, expectUserResponse);

    return response;
}

function addResponseRequest(response: any, expectUserResponse = true) {
    if (expectUserResponse) {
        response.payload.google.richResponse.items.push(buildUserResponseRequest());
    }
}

function buildUserResponseRequest() {
    const prompts = [
        `Anything else?`,
        `What else can I do for you?`,
        `Need more assistance?`
    ];

    const index = Math.floor(Math.random() * prompts.length);

    return {
        simpleResponse: {
            displayText: `${prompts[index]}`,
            textToSpeech: `<speak>${prompts[index]}</speak>`
        }
    };
}
