import { Request, Response } from 'express';
import * as requestProcessor from '../processors/request-processor';
import { Constants } from '../util/constants';
import * as alexaConverter from '../util/converters/alexa-converter';

export const dialogflow = async (req: Request, res: Response) => {
    const action = req.body.queryResult.action;
    const parameters = req.body.queryResult.parameters;

    const response = await requestProcessor.processRequest(action, parameters);

    res.json(response);
};

export const alexa = async (req: Request, res: Response) => {
    if (req.body.request) {
        if (req.body.request.type === 'LaunchRequest') {
            const welcomeResponse = await requestProcessor.processRequest(Constants.WDWNT_WELCOME, {});
            const convertedWelcomeResponse =
                alexaConverter.convertDialogflowResponseToAlexa(welcomeResponse);

            res.json(convertedWelcomeResponse);
            return;
        }

        const intent = req.body.request.intent.name;

        const slots = req.body.request.intent.slots;
        const slotsKeys = Object.keys(slots);

        const parameters: {[k: string]: any} = {};
        slotsKeys.forEach((element, index) => {
            parameters[element] = slots[element].resolutions.resolutionsPerAuthority[0].values[0].value.name;
        });

        const response = await requestProcessor.processRequest(intent, parameters);
        const convertedResponse = alexaConverter.convertDialogflowResponseToAlexa(response);

        res.json(convertedResponse);
        return;
    }

    const errorResponse = await requestProcessor.processRequest(null, null);
    const convertedErrorResponse = alexaConverter.convertDialogflowResponseToAlexa(errorResponse);

    res.json(convertedErrorResponse);
};
