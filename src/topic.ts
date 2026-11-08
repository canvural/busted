/**
 * Everything specific to GTA VI lives here. To retarget Busted! at another game or
 * show, edit this file only.
 */

export interface Topic {
  /** Shown in the UI and in the prompt. */
  name: string;
  /** What counts as a spoiler, sent to Clef with every request. */
  spoilerDefinition: string;
  /**
   * Who's who, sent to Clef so it can judge posts that only mention a character
   * or place. Keep it short: it costs tokens on every request.
   */
  glossary: Record<string, string>;
  /**
   * Default pre-filter keywords. Matched case-insensitively on whole words.
   * Users can edit the list in settings.
   */
  defaultKeywords: string[];
  /**
   * Bump whenever the definition, glossary or question wording changes. It's part of
   * the cache key, so old verdicts are thrown away.
   */
  promptVersion: number;
}

export const topic: Topic = {
  name: 'GTA VI',
  spoilerDefinition: [
    'A spoiler is anything that reveals or claims to reveal GTA VI (Grand Theft Auto VI) content a player would discover by playing:',
    'story and plot points, mission details, endings, character fates (deaths, betrayals, twists), late-game areas or content,',
    'and leaked or datamined information. Hinting that something specific happens to a named character counts.',
    'NOT spoilers: official trailers and marketing, release dates, prices, preorders, platform or performance news,',
    'reviews without story details, memes or hype without content reveals, pure reactions ("that ending though"),',
    'warnings with no details, content about other games (including GTA V, GTA Online and older GTA games),',
    'and anything unrelated to GTA VI that happens to share a name.',
  ].join(' '),
  glossary: {
    'Lucia Caminos': 'GTA VI protagonist',
    'Jason Duval': 'GTA VI protagonist',
    'Cal Hampton': 'GTA VI character, friend of Jason',
    'Boobie Ike': 'GTA VI character, Vice City businessman',
    "Dre'Quan Priest": 'GTA VI character, music label owner',
    'Real Dimez': 'GTA VI characters, rap duo',
    'Raul Bautista': 'GTA VI character, bank robber',
    'Brian Heder': 'GTA VI character, drug runner',
    Leonida: 'GTA VI fictional state (based on Florida)',
    'Vice City': 'GTA VI main city (based on Miami)',
    'Port Gellhorn': 'GTA VI town',
    Ambrosia: 'GTA VI town',
    Grassrivers: 'GTA VI wetlands region',
    'Leonida Keys': 'GTA VI island chain',
    'Mount Kalaga': 'GTA VI national park',
  },
  defaultKeywords: [
    // Game names
    'GTA 6',
    'GTA VI',
    'GTA6',
    'Grand Theft Auto VI',
    'Grand Theft Auto 6',
    // Places
    'Vice City',
    'Leonida',
    'Port Gellhorn',
    'Ambrosia',
    'Grassrivers',
    'Mount Kalaga',
    // Characters. These also match unrelated posts ("Lucia from accounting");
    // Clef sorts those out. After launch, story talk names characters, not the game.
    'Lucia',
    'Jason',
    'Cal Hampton',
    'Boobie',
    "Dre'Quan",
    'Real Dimez',
    'Raul',
    'Brian Heder',
  ],
  promptVersion: 1,
};
