import type {
    BanData,
    CategoryData,
    ChannelsData,
    CreateOptions,
    EmojiData,
    RoleData,
    TextChannelData,
    VoiceChannelData,
    ExemptRoleData,
    ExemptChannelData,
    AutoModRuleActionData,
    AutoModRuleData
} from './types';
import type { CategoryChannel, Collection, Guild, GuildChannel, Snowflake, TextChannel, ThreadChannel, VoiceChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import axios from 'axios';
import { fetchChannelPermissions, fetchTextChannelData, fetchVoiceChannelData } from './util';
import { MemberData } from './types/MemberData';

/**
 * Returns an array with the banned members of the guild
 * @param {Guild} guild The Discord guild
 * @returns {Promise<BanData[]>} The banned members
 */
export async function getBans(guild: Guild) {
    const bans: BanData[] = [];
    const cases = await guild.bans.fetch(); // Gets the list of the banned members
    cases.forEach((ban) => {
        bans.push({
            id: ban.user.id, // Banned member ID
            reason: ban.reason // Ban reason
        });
    });
    return bans;
}

/**
 * Returns an array with the members of the guild
 * @param {Guild} guild The Discord guild
 * @returns {Promise<MemberData>}
 */
export async function getMembers(guild: Guild) {
    const members: MemberData[] = [];
    guild.members.cache.forEach((member) => {
        members.push({
            userId: member.user.id, // Member ID
            username: member.user.username, // Member username
            discriminator: member.user.discriminator, // Member discriminator
            avatarUrl: member.user.avatarURL(), // Member avatar URL
            joinedTimestamp: member.joinedTimestamp, // Member joined timestamp
            roles: member.roles.cache.map((role) => role.id), // Member roles
            bot: member.user.bot // Member bot
        });
    });
    return members;
}

/**
 * Returns an array with the roles of the guild
 * @param {Guild} guild The discord guild
 * @returns {Promise<RoleData[]>} The roles of the guild
 */
export async function getRoles(guild: Guild) {
    const roles: RoleData[] = [];
    guild.roles.cache
        .filter((role) => !role.managed)
        .sort((a, b) => b.position - a.position)
        .forEach((role) => {
            const roleData = {
                name: role.name,
                color: role.hexColor,
                hoist: role.hoist,
                permissions: role.permissions.bitfield.toString(),
                mentionable: role.mentionable,
                position: role.position,
                isEveryone: guild.id === role.id
            };
            roles.push(roleData);
        });
    return roles;
}

/**
 * Returns an array with the emojis of the guild
 * @param {Guild} guild The discord guild
 * @param {CreateOptions} options The backup options
 * @returns {Promise<EmojiData[]>} The emojis of the guild
 */
export async function getEmojis(guild: Guild, options: CreateOptions) {
    const emojis: EmojiData[] = [];
    guild.emojis.cache.forEach(async (emoji) => {
        const eData: EmojiData = {
            name: emoji.name
        };
        if (options.saveImages && options.saveImages === 'base64') {
            eData.base64 = (await axios.get(emoji.url).then((res) => res.data.buffer())).toString('base64');
        } else {
            eData.url = emoji.url;
        }
        emojis.push(eData);
    });
    return emojis;
}

/**
 * Returns an array with the channels of the guild
 * @param {Guild} guild The discord guild
 * @param {CreateOptions} options The backup options
 * @returns {ChannelData[]} The channels of the guild
 */
export async function getChannels(guild: Guild, options: CreateOptions) {
    return new Promise<ChannelsData>(async (resolve) => {
        const channels: ChannelsData = {
            categories: [],
            others: []
        };
        // Gets the list of the categories and sort them by position
        const categories = (guild.channels.cache
            .filter((ch) => ch.type === ChannelType.GuildCategory) as Collection<Snowflake, CategoryChannel>)
            .sort((a, b) => a.position - b.position)
            .toJSON() as CategoryChannel[];
        for (const category of categories) {
            const categoryData: CategoryData = {
                name: category.name, // The name of the category
                permissions: fetchChannelPermissions(category), // The overwrite permissions of the category
                children: [] // The children channels of the category
            };
            // Gets the children channels of the category and sort them by position
            const children = category.children.cache.sort((a, b) => a.position - b.position).toJSON();
            for (const child of children) {
                // For each child channel
                if (child.type === ChannelType.GuildText || child.type === ChannelType.GuildNews) {
                    const channelData: TextChannelData = await fetchTextChannelData(child as TextChannel, options); // Gets the channel data
                    categoryData.children.push(channelData); // And then push the child in the categoryData
                } else {
                    const channelData: VoiceChannelData = await fetchVoiceChannelData(child as VoiceChannel); // Gets the channel data
                    categoryData.children.push(channelData); // And then push the child in the categoryData
                }
            }
            channels.categories.push(categoryData); // Update channels object
        }
        // Gets the list of the other channels (that are not in a category) and sort them by position
        const others = (guild.channels.cache
            .filter((ch) => {
                return !ch.parent && ch.type !== ChannelType.GuildCategory
                    //&& ch.type !== 'GUILD_STORE' // there is no way to restore store channels, ignore them
                    && ch.type !== ChannelType.GuildNewsThread && ch.type !== ChannelType.GuildPrivateThread && ch.type !== ChannelType.GuildPublicThread // threads will be saved with fetchTextChannelData
            }) as Collection<Snowflake, Exclude<GuildChannel, ThreadChannel>>)
            .sort((a, b) => a.position - b.position)
            .toJSON();
        for (const channel of others) {
            // For each channel
            if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildNews) {
                const channelData: TextChannelData = await fetchTextChannelData(channel as TextChannel, options); // Gets the channel data
                channels.others.push(channelData); // Update channels object
            } else {
                const channelData: VoiceChannelData = await fetchVoiceChannelData(channel as VoiceChannel); // Gets the channel data
                channels.others.push(channelData); // Update channels object
            }
        }
        resolve(channels); // Returns the list of the channels
    });
}

/* returns an array with the guilds automoderation rules */
export async function getAutoModerationRules(guild: any): Promise<AutoModRuleData[]> {

    const rules: AutoModRuleData[] = [];
    const ruless = await guild.autoModerationRules.fetch({ cache: false });
    const collectedRules: AutoModRuleData[] = [];

    rules.forEach((rule) => {
        const actions: AutoModRuleActionData[] = [];

        rule.actions.forEach((action) => {
            const copyAction: AutoModRuleActionData = JSON.parse(JSON.stringify(action));

            if (copyAction.metadata.channelId) {
                const channel = guild.channels.cache.get(copyAction.metadata.channelId);

                if (channel) {
                    copyAction.metadata.channelName = channel.name;
                    actions.push(copyAction);
                }

            } else {
                actions.push(copyAction);
            }
        });

        /* filter out deleted roles and channels due to a potential bug with discord.js */
        const exemptRoles: ExemptRoleData[] = rule.exemptRoles.filter((role: any) => role != undefined);
        const exemptChannels: ExemptChannelData[] = rule.exemptChannels.filter((channel: any) => channel != undefined);

        collectedRules.push({
            name: rule.name,
            eventType: rule.eventType,
            triggerType: rule.triggerType,
            triggerMetadata: rule.triggerMetadata,
            actions: actions,
            enabled: rule.enabled,
            exemptRoles: exemptRoles.map((role) => ({ id: role.id, name: role.name })),
            exemptChannels: exemptChannels.map((channel) => ({ id: channel.id, name: channel.name }))
        });
    });

    return collectedRules;
}
