import { DialogFlowRichResponse } from './dialogflow-rich-response';

export class DialogFlowGooglePayload {
    public expectUserResponse: boolean;
    public richResponse: DialogFlowRichResponse;
    constructor() {
        this.richResponse = new DialogFlowRichResponse();
    }
}
