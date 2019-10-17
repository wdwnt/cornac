import { DialogFlowResponse } from '../../models/response/dialogflow/dialogflow-response';

export function convertDialogflowResponseToAlexa(response: DialogFlowResponse, isSSML = true) {
    const googleItems = response.payload.google.richResponse.items;
    const simpleResponse = googleItems[0].simpleResponse;
    const lastResponse = googleItems[googleItems.length - 1].simpleResponse;

    const alexaResponse = {
        response: {
            outputSpeech: {
                ssml: simpleResponse.textToSpeech,
                text: simpleResponse.displayText,
                type: isSSML ? 'SSML' : 'PlainText'
            },
            reprompt: {
                outputSpeech: {
                    ssml: lastResponse.textToSpeech,
                    text: lastResponse.displayText,
                    type: isSSML ? 'SSML' : 'PlainText'
                }
            },
            shouldEndSession: !response.payload.google.expectUserResponse
        },
        version: '1.0'
    };

    return alexaResponse;
}
