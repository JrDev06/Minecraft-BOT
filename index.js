const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock, GoalXZ } = require('mineflayer-pathfinder').goals;
const config = require('./settings.json');
const loggers = require('./logging.js');
const logger = loggers.logger;

function validateConfig(config) {
    if (!config['bot-account'] || !config.server || !config.utils) {
        throw new Error("Invalid configuration format.");
    }
    if (!config['bot-account'].username || !config.server.ip) {
        throw new Error("Missing critical configuration values.");
    }
}

function createBot() {
    try {
        validateConfig(config);

        const bot = mineflayer.createBot({
            username: config['bot-account']['username'],
            password: config['bot-account']['password'],
            auth: config['bot-account']['type'],
            host: config.server.ip,
            port: config.server.port,
            version: config.server.version,
        });

        bot.loadPlugin(pathfinder);
        const mcData = require('minecraft-data')(bot.version);
        const defaultMove = new Movements(bot, mcData);
        bot.settings.colorsEnabled = false;
        bot.pathfinder.setMovements(defaultMove);

        bot.once('spawn', () => {
            logger.info("Bot joined the server");

            if (config.utils['auto-auth'].enabled) {
                logger.info('Started auto-auth module');
                let password = config.utils['auto-auth'].password;
                setTimeout(() => {
                    bot.chat(`/register ${password} ${password}`);
                    bot.chat(`/login ${password}`);
                }, 500);
                logger.info('Authentication commands executed');
            }

            if (config.utils['chat-messages'].enabled) {
                logger.info('Started chat-messages module');
                let messages = config.utils['chat-messages']['messages'];
                if (config.utils['chat-messages'].repeat) {
                    let delay = config.utils['chat-messages']['repeat-delay'];
                    let i = 0;
                    setInterval(() => {
                        bot.chat(`${messages[i]}`);
                        i = (i + 1) % messages.length;
                    }, delay * 1000);
                } else {
                    messages.forEach((msg) => bot.chat(msg));
                }
            }

            if (config.position.enabled) {
                logger.info(`Moving to target location (${config.position.x}, ${config.position.y}, ${config.position.z})`);
                bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
            }

            if (config.utils['anti-afk'].enabled) {
                handleAntiAFK(bot, config.utils['anti-afk']);
            }
        });

        bot.on('chat', (username, message) => {
            if (config.utils['chat-log']) {
                logger.info(`<${username}> ${message}`);
            }
        });

        bot.on('goal_reached', () => {
            if (config.position.enabled) {
                logger.info(`Bot arrived at target location: ${bot.entity.position}`);
            }
        });

        bot.on('death', () => {
            logger.warn(`Bot died and respawned at ${bot.entity.position}`);
        });

        if (config.utils['auto-reconnect']) {
            bot.on('end', () => {
                setTimeout(() => {
                    createBot();
                }, config.utils['auto-reconnect-delay']);
            });
        }

        bot.on('kicked', (reason) => {
            let reasonText = JSON.parse(reason).text || JSON.parse(reason).extra[0].text;
            reasonText = reasonText.replace(/§./g, '');
            logger.warn(`Bot was kicked from the server. Reason: ${reasonText}`);
        });

        bot.on('error', (err) => logger.error(err.message));

    } catch (err) {
        logger.error(`Failed to create bot: ${err.message}`);
    }
}

function handleAntiAFK(bot, antiAFKConfig) {
    if (antiAFKConfig.sneak) {
        bot.setControlState('sneak', true);
    }

    if (antiAFKConfig.jump) {
        bot.setControlState('jump', true);
    }

    if (antiAFKConfig.hit.enabled) {
        let delay = antiAFKConfig.hit.delay;
        let attackMobs = antiAFKConfig.hit['attack-mobs'];
        setInterval(() => {
            if (attackMobs) {
                let entity = bot.nearestEntity(e => e.type !== 'object' && e.type !== 'player' &&
                    e.type !== 'global' && e.type !== 'orb' && e.type !== 'other');
                if (entity) {
                    bot.attack(entity);
                    return;
                }
            }
            bot.swingArm("right", true);
        }, delay);
    }

    if (antiAFKConfig.rotate) {
        setInterval(() => {
            bot.look(bot.entity.yaw + 1, bot.entity.pitch, true);
        }, 100);
    }

    if (antiAFKConfig['circle-walk'].enabled) {
        let radius = antiAFKConfig['circle-walk'].radius;
        circleWalk(bot, radius);
    }
}

function circleWalk(bot, radius) {
    const pos = bot.entity.position;
    const points = [
        [pos.x + radius, pos.y, pos.z],
        [pos.x, pos.y, pos.z + radius],
        [pos.x - radius, pos.y, pos.z],
        [pos.x, pos.y, pos.z - radius],
    ];
    let i = 0;
    setInterval(() => {
        bot.pathfinder.setGoal(new GoalXZ(points[i][0], points[i][2]));
        i = (i + 1) % points.length;
    }, 1000);
}

createBot();
