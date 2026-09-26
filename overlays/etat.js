/* État des comptes et des fonctionnalités, calculé depuis /status. Partagé par la page
 * d'accueil et le dock OBS : les deux affichent toujours la même pastille.
 * Chaque état est { niveau: 'ok' | 'warn' | 'bad' | 'off', texte, detail? }. */
'use strict';

(function () {
  const ACCOUNT_NAMES = { twitch: 'ta chaîne', bot: 'le bot', spotify: 'Spotify' };

  // Le même raisonnement pour les trois comptes : ce qui manque, dans l'ordre où il faut le faire.
  function accountState(configured, account, keysMissing) {
    if (!configured) return { niveau: 'off', texte: keysMissing };
    if (!account.authorized) return { niveau: 'warn', texte: 'À autoriser' };
    if (account.erreur || account.scopesManquants) return { niveau: 'bad', texte: 'Autorisation à refaire' };
    const name = account.displayName || account.login;
    return { niveau: 'ok', texte: name ? 'Connecté : ' + name : 'Connecté' };
  }

  function twitch(s) {
    return accountState(s.twitch.configured, s.comptes.principal, 'Clés à saisir');
  }

  function bot(s) {
    const b = s.comptes.bot;
    if (!s.twitch.configured) return { niveau: 'off', texte: 'Chaîne d\'abord' };
    if (!b.pseudoAttendu && !b.authorized) return { niveau: 'off', texte: 'Non utilisé' };
    return accountState(true, b, '');
  }

  function spotify(s) {
    return accountState(s.spotify.configured, s.comptes.spotify, 'Non utilisé');
  }

  function accountReady(s, name) {
    if (name === 'twitch') return s.comptes.principal.authorized;
    if (name === 'bot') return s.comptes.bot.authorized;
    if (name === 'spotify') return s.comptes.spotify.authorized;
    return false;
  }

  // Comptes à connecter d'abord, puis l'état détaillé calculé par le serveur.
  function feature(f, s) {
    const manquants = (f.comptes || []).filter((c) => !s || !accountReady(s, c));
    if (manquants.length) return { niveau: 'off', texte: 'À connecter', manquants: manquants };
    const st = (s && s.fonctionnalites && s.fonctionnalites[f.id]) || { niveau: 'ok', texte: 'Prêt' };
    return Object.assign({ manquants: [] }, st);
  }

  window.TwitchKitEtat = { ACCOUNT_NAMES, twitch, bot, spotify, feature };
})();
