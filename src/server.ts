import express from 'express';
import os from 'os';

import * as languageController from './controllers/language';
import { PORT } from './util/secrets';

const app = express();
app.use(express.json());

const hostname = os.hostname();
const port = PORT;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.get('/', (req, resp) => {
    resp.redirect(301, process.env.CORNAC_LANDING_PAGE_URL);
});

app.post('/api/language/respondtoquery', languageController.dialogflow);
app.post('/api/language/respondtoquery/dialogflow', languageController.dialogflow);
app.post('/api/language/respondtoquery/alexa', languageController.alexa);

app.listen(port);
console.log(hostname + ': App listening on port ' + port);
