'use-strict';

require('dotenv').config();

module.exports = {
    processMessage: async (incomingMessage) => {
        console.log('Processing incoming message', incomingMessage);

        const { type, origin, content, from, fingerprint, user } = incomingMessage.data;
        const { nickname, user_id } = user;

        const userExist = await strapi.db.query('api::customer.customer').findOne({
            where: {
                id_crisp: user_id
            }
        })

        if (!userExist) {
            await strapi.entityService.create('api::customer.customer', {
                data: {
                    id_crisp: user_id,
                    nickname: nickname
                }
            })
        }

        const dbUser = await strapi.db.query('api::customer.customer').findOne({
            where: {
                id_crisp: user_id,
            }
        })

        const existMessage = await strapi.db.query('api::message.message').findOne({
            where: {
                id_crisp: fingerprint.toString()
            }
        })

        if (existMessage) return;

        await strapi.entityService.create('api::message.message', {
            data: {
                type: type,
                customer: dbUser.id,
                id_crisp: fingerprint.toString(),
                from: from,
                origin: origin,
                content: content,
            }
        })

        const tag = content.match(/#(\w+)/g).join('');

        if (tag) {

            if (['#tips', '#nextsteps', '#warnings'].includes(tag)) {

                // @ts-ignore
                const { OpenAI } = await import('openai')
                
                const GPTClient = new OpenAI({
                    apiKey: process.env.GPT_API_KEY
                })
                
                const response = await GPTClient.chat.completions.create({
                    messages: [
                        { role: 'user', content: `Résume ça d'une manière simple à comprendre, courte et précise : ${content.replace(tag, '')}` }
                    ],
                    model: 'gpt-4o'
                });

                await strapi.entityService.create('api::memory.memory', {
                    data: {
                        key: tag.replace('#', ''),
                        content: response.choices[0].message.content,
                        customer: dbUser.id
                    }
                })
            }
        }
    },

    removeMessage: async (incomingMessage) => {
        console.log('Processing removed message', incomingMessage);

        const { session_id } = incomingMessage.data;

        // @ts-ignore
        await strapi.entityService.delete('api::message.message', {
            where: {
                id_crisp: session_id
            }
        })
    },

    updateMessage: async (incomingMessage) => {
        console.log('Processing updated message', incomingMessage);

        const { session_id, content } = incomingMessage.data;

        // @ts-ignore
        await strapi.entityService.update('api::message.message', {
            where: {
                id_crisp: session_id
            },
            data: {
                content: content
            }
        })
    },

    processReminder: async () => {
        try {
            const customers = await strapi.db.query('api::customer.customer').find();

            for (const customer of customers) {
                const customerId = customer.id;

                const messages = await strapi.entityService.findMany('api::message.message', {
                    filters: {
                        customer: customerId,
                        from: 'user'
                    },
                    sort: { createdAt: 'desc' },
                    fields: ['createdAt'],
                    populate: { customer: true }
                });

                if(messages.length > 0) {
                    const lastMessage = messages[0];
                    const lastMessageDate = new Date(lastMessage.createdAt);
                    const currentDate = new Date();

                    const differenceInTime = currentDate.getTime() - lastMessageDate.getTime();
                    const differenceInDays = differenceInTime / (1000 * 3600 * 24);

                    if (differenceInDays >= 3) {
                        console.log();
                    }
                }
            }
        } catch (error) {
            console.log(error);
        }
    }
}