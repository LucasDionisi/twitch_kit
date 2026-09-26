/* Envoi dans le chat de la chaîne, par le compte du bot.
 *
 * Deux façons d'écrire : un message normal, ou une annonce (mise en avant, colorée),
 * qui demande que le bot soit modérateur de la chaîne. Une annonce refusée retombe
 * sur un message normal : le chat reçoit toujours l'info, et la page d'accueil dit
 * pourquoi l'annonce n'est pas passée.
 *
 * Ce module n'importe rien du serveur : server.js lui passe les deux comptes.
 */
'use strict';

const MAX_LENGTH = 500;   // limite Twitch, pour les messages comme pour les annonces

const chat = {
  bot: null,        // compte du bot : c'est lui qui écrit
  channel: null,    // compte de la chaîne : où il écrit
  warning: '',      // annonce refusée, messages normaux en attendant
  lastError: ''
};

function init(options) {
  chat.bot = options.bot;
  chat.channel = options.channel;
}

function status() {
  return { erreur: chat.lastError || null, avertissement: chat.warning || null };
}

// Array.from pour ne jamais couper un emoji en deux
function clamp(text) {
  const chars = Array.from(String(text).replace(/\s+/g, ' ').trim());
  return chars.length > MAX_LENGTH ? chars.slice(0, MAX_LENGTH - 1).join('') + '…' : chars.join('');
}

function fail(message) {
  chat.lastError = message;
  throw new Error(message);
}

// options : { annonce: bool, couleur: 'primary'|'blue'|… }
// Renvoie 'annonce' ou 'message' selon ce qui est parti ; lève une erreur lisible sinon.
async function say(text, options) {
  const opts = options || {};
  const message = clamp(text);
  if (!message) return null;

  const botId = chat.bot.authorized() && chat.bot.tokens.user_id;
  if (!botId) fail('Le bot n\'est pas connecté : autorise-le dans « Compte du bot ».');
  const channelId = chat.channel.tokens && chat.channel.tokens.user_id;
  if (!channelId) fail('Ta chaîne n\'est pas connectée.');

  if (opts.annonce) {
    try {
      await chat.bot.helix('/chat/announcements?broadcaster_id=' + channelId + '&moderator_id=' + botId, {
        method: 'POST',
        body: { message: message, color: opts.couleur || 'primary' }
      });
      chat.warning = '';
      chat.lastError = '';
      return 'annonce';
    } catch (err) {
      console.warn('Annonce impossible, envoi en message normal : ' + err.message);
      chat.warning = /→ 401/.test(err.message)
        ? 'Annonce impossible : l\'autorisation du bot est à refaire. En attendant, il écrit en message normal.'
        : 'Annonce impossible : le bot doit être modérateur de ta chaîne (tape /mod ' +
          (chat.bot.tokens.login || 'pseudo_du_bot') + ' dans ton chat). En attendant, il écrit en message normal.';
    }
  }

  let res;
  try {
    res = await chat.bot.helix('/chat/messages', {
      method: 'POST',
      body: { broadcaster_id: channelId, sender_id: botId, message: message }
    });
  } catch (err) {
    fail('Envoi dans le chat impossible : ' + err.message);
  }
  // Twitch répond 200 même quand il écarte le message (doublon, AutoMod, bot banni…)
  const sent = res && res.data && res.data[0];
  if (sent && !sent.is_sent) {
    const reason = sent.drop_reason && (sent.drop_reason.message || sent.drop_reason.code);
    fail('Twitch n\'a pas publié le message' + (reason ? ' : ' + reason : '') + '.');
  }
  if (!opts.annonce) chat.warning = '';
  chat.lastError = '';
  return 'message';
}

module.exports = { init, say, status };
