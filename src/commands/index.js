import setup from './setup.js';
import subscribe from './subscribe.js';
import keywords from './keywords.js';
import digest from './digest.js';
import settings from './settings.js';
import news from './news.js';
import radar from './radar.js';
import saved from './saved.js';
import ask from './ask.js';
import help from './help.js';

export const commandList = [setup, ...subscribe, keywords, digest, settings, news, radar, saved, ask, help];
export const commands = new Map(commandList.map((c) => [c.data.name, c]));
