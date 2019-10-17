import { DialogFlowGooglePayload } from './dialogflow-google-payload';

export class DialogFlowPayload {
    public google: DialogFlowGooglePayload;
    constructor() {
        this.google = new DialogFlowGooglePayload();
    }
}
