import { DialogFlowResponse } from '../../models/response/dialogflow/dialogflow-response';

export function convertDialogflowResponseToAlexa(response: DialogFlowResponse) {
    const GOOGLE_ITEMS = response.payload.google.richResponse.items;
    const simpleResponse = GOOGLE_ITEMS[0].simpleResponse;
    const lastResponse = GOOGLE_ITEMS[GOOGLE_ITEMS.length - 1].simpleResponse;

    const alexaResponse = {
        response: {
            outputSpeech: {
                ssml: simpleResponse.textToSpeech,
                text: simpleResponse.displayText,
                type: 'PlainText'
            },
            reprompt: {
                outputSpeech: {
                    ssml: lastResponse.textToSpeech,
                    text: lastResponse.displayText,
                    type: 'PlainText'
                }
            },
            shouldEndSession: response.payload.google.expectUserResponse
        },
        version: 'v1'
    };

    return alexaResponse;
}
