function register(bot, deps = {}) {
  // TODO: implement feature
  // keep it silent when enabled without config
  bot.command('content', ctx => ctx.reply('Feature "content" is not enabled/configured yet'));
}
module.exports = { register };
