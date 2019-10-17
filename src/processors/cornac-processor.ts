import { IProcessor } from './processor';

export class CornacProcessor implements IProcessor {
    private readonly jokes = [
        {
            joke: 'Veggie, veggie, fruit, fruit.',
            joke_display: 'Veggie, veggie, fruit, fruit.',
            punchline: 'What does every counter-service menu at Walt Disney World look like now.',
            punchline_display: 'What does every counter-service menu at Walt Disney World look like now.'
        },
        {
            joke: 'Illuminations: Reflections of Earth, Spaceship Earth, and a hotel room on <say-as interpret-as="characters">OBT</say-as>.',
            joke_display: 'Illuminations: Reflections of Earth, Spaceship Earth, and a hotel room on OBT.',
            punchline: 'Name three things that were presented by Siemens.',
            punchline_display: 'Name three things that were presented by Siemens.'
        },
        {
            joke: 'One little spark.',
            joke_display: 'One little spark.',
            punchline: 'How would you describe the pyro in Epcot Forever?<break time="2" />Because money.',
            punchline_display: 'How would you describe the pyro in Epcot Forever? Because money.'
        },
        {
            joke: 'Sparking kites.',
            joke_display: 'Sparking kites.',
            punchline: 'What will you get if you buy a kite from an American manufacturer?',
            punchline_display: 'What will you get if you buy a kite from an American manufacturer?'
        },
        {
            joke: 'Magic Journeys.',
            joke_display: 'Magic Journeys.',
            punchline: 'What did the Disneyland Paris guests on <say-as interpret-as="characters">LSD</say-as> experience?',
            punchline_display: 'What did the Disneyland Paris guests on LSD experience?'
        },
        {
            joke: 'It\'s fun to be free.',
            joke_display: 'It\'s fun to be free.',
            punchline: 'How do you feel when Epcot Forever is over?',
            punchline_display: 'How do you feel when Epcot Forever is over?'
        }
    ];

    public process(): any {
        const index = Math.floor(Math.random() * this.jokes.length);
        const randomJoke = this.jokes[index];

        let response = randomJoke.joke;
        response += '<audio src=\"https://appcdn.wdwnt.com/cornac/audio/open_envelope.mp3\">[Opens envelope]</audio>';
        response += randomJoke.punchline;
        response += '<audio src=\"https://appcdn.wdwnt.com/cornac/audio/rim_shot.mp3\">[Rimshot]</audio>';

        const displayText = `${randomJoke.joke_display} [Opens envelope] ${randomJoke.punchline_display} [Rimshot]`;

        return {
            displayText,
            response
        };
    }
}
