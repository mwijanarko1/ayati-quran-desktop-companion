import type { AyahTheme, QuranVerseContent } from './ayah-types';

export interface CuratedAyahCandidate {
  verseKey: string;
  themeId: AyahTheme;
  priority: number;
  reflection: string;
  whyThisVerse: string;
}

export const FALLBACK_VERSE_KEY = '13:28';

export const CURATED_AYAH_CANDIDATES: CuratedAyahCandidate[] = [
  {
    verseKey: '2:286',
    themeId: 'stress',
    priority: 100,
    reflection: 'Meet the pressure in front of you with the effort you actually have capacity for.',
    whyThisVerse: 'The screen suggested pressure and overload, so this ayah anchors the moment in mercy and capacity.',
  },
  {
    verseKey: '94:5',
    themeId: 'stress',
    priority: 92,
    reflection: 'Hardship is not the only thing present; relief can be unfolding beside it.',
    whyThisVerse: 'The work looked heavy, and this ayah points attention toward relief within difficulty.',
  },
  {
    verseKey: '94:6',
    themeId: 'patience',
    priority: 91,
    reflection: 'Stay steady; the present difficulty is not the final shape of the matter.',
    whyThisVerse: 'The scene called for patience and a calmer view of the next step.',
  },
  {
    verseKey: '13:28',
    themeId: 'unclear',
    priority: 98,
    reflection: 'Return the heart to remembrance before deciding what needs attention next.',
    whyThisVerse: 'When the screen is hard to interpret, this is a safe general reminder.',
  },
  {
    verseKey: '14:7',
    themeId: 'gratitude',
    priority: 88,
    reflection: 'Notice what has already been given before moving to what is missing.',
    whyThisVerse: 'The scene suggested a reason to pause and recognize blessing.',
  },
  {
    verseKey: '67:3',
    themeId: 'beauty',
    priority: 85,
    reflection: 'Let beauty point beyond itself instead of becoming background noise.',
    whyThisVerse: 'The screen appeared visually rich, making this ayah a fitting invitation to wonder.',
  },
  {
    verseKey: '18:24',
    themeId: 'planning',
    priority: 82,
    reflection: 'Hold the plan with humility and leave room for Allah to guide the outcome.',
    whyThisVerse: 'Planning was visible, so this ayah keeps intention and dependence together.',
  },
  {
    verseKey: '96:1',
    themeId: 'study',
    priority: 80,
    reflection: 'Begin learning by remembering the One in whose name knowledge becomes meaningful.',
    whyThisVerse: 'The screen suggested reading, study, or research.',
  },
  {
    verseKey: '23:3',
    themeId: 'distraction',
    priority: 78,
    reflection: 'Turn away from what scatters attention and return to what benefits.',
    whyThisVerse: 'The screen suggested distraction or low-value attention drift.',
  },
  {
    verseKey: '49:10',
    themeId: 'conflict',
    priority: 78,
    reflection: 'Repair and mercy are better goals than winning the argument.',
    whyThisVerse: 'The scene suggested interpersonal tension or conflict.',
  },
  {
    verseKey: '57:20',
    themeId: 'excess',
    priority: 74,
    reflection: 'Keep temporary gains in proportion and choose what lasts.',
    whyThisVerse: 'The screen suggested excess, comparison, or over-attachment.',
  },
  {
    verseKey: '3:159',
    themeId: 'work',
    priority: 76,
    reflection: 'Consult, decide, and then move forward with trust.',
    whyThisVerse: 'The visible work called for clear action without losing gentleness.',
  },
  {
    verseKey: '65:2',
    themeId: 'risk',
    priority: 76,
    reflection: 'When a decision carries risk, taqwa and trust are part of the path through.',
    whyThisVerse: 'The screen suggested uncertainty or a consequential choice.',
  },
  {
    verseKey: '23:1',
    themeId: 'focus',
    priority: 72,
    reflection: 'Focus is not just productivity; it is presence before Allah.',
    whyThisVerse: 'The scene suggested a need for concentration and steadiness.',
  },
];

export const FALLBACK_VERSE_CONTENT: Record<string, QuranVerseContent> = {
  '2:286': {
    verseKey: '2:286',
    surahName: 'Al-Baqarah',
    ayahNumber: 286,
    arabicText: 'لَا يُكَلِّفُ ٱللَّهُ نَفْسًا إِلَّا وُسْعَهَا',
    translation: 'Allah does not require of any soul more than what it can afford.',
    translatorId: 20,
  },
  '94:5': {
    verseKey: '94:5',
    surahName: 'Ash-Sharh',
    ayahNumber: 5,
    arabicText: 'فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا',
    translation: 'So, surely with hardship comes ease.',
    translatorId: 20,
  },
  '94:6': {
    verseKey: '94:6',
    surahName: 'Ash-Sharh',
    ayahNumber: 6,
    arabicText: 'إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا',
    translation: 'Surely with hardship comes ease.',
    translatorId: 20,
  },
  '13:28': {
    verseKey: '13:28',
    surahName: "Ar-Ra'd",
    ayahNumber: 28,
    arabicText: 'أَلَا بِذِكْرِ ٱللَّهِ تَطْمَئِنُّ ٱلْقُلُوبُ',
    translation: 'Surely in the remembrance of Allah do hearts find comfort.',
    translatorId: 20,
  },
  '14:7': {
    verseKey: '14:7',
    surahName: 'Ibrahim',
    ayahNumber: 7,
    arabicText: 'لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ',
    translation: 'If you are grateful, I will certainly give you more.',
    translatorId: 20,
  },
  '67:3': {
    verseKey: '67:3',
    surahName: 'Al-Mulk',
    ayahNumber: 3,
    arabicText: 'مَّا تَرَىٰ فِي خَلْقِ ٱلرَّحْمَـٰنِ مِن تَفَـٰوُتٍ',
    translation: 'You will never see any imperfection in the creation of the Most Compassionate.',
    translatorId: 20,
  },
  '18:24': {
    verseKey: '18:24',
    surahName: 'Al-Kahf',
    ayahNumber: 24,
    arabicText: 'وَٱذْكُر رَّبَّكَ إِذَا نَسِيتَ',
    translation: 'And remember your Lord when you forget.',
    translatorId: 20,
  },
  '96:1': {
    verseKey: '96:1',
    surahName: 'Al-Alaq',
    ayahNumber: 1,
    arabicText: 'ٱقْرَأْ بِٱسْمِ رَبِّكَ ٱلَّذِي خَلَقَ',
    translation: 'Read, in the Name of your Lord Who created.',
    translatorId: 20,
  },
  '23:3': {
    verseKey: '23:3',
    surahName: "Al-Mu'minun",
    ayahNumber: 3,
    arabicText: 'وَٱلَّذِينَ هُمْ عَنِ ٱللَّغْوِ مُعْرِضُونَ',
    translation: 'And those who avoid idle talk.',
    translatorId: 20,
  },
  '49:10': {
    verseKey: '49:10',
    surahName: 'Al-Hujurat',
    ayahNumber: 10,
    arabicText: 'إِنَّمَا ٱلْمُؤْمِنُونَ إِخْوَةٌ',
    translation: 'The believers are but one brotherhood.',
    translatorId: 20,
  },
  '57:20': {
    verseKey: '57:20',
    surahName: 'Al-Hadid',
    ayahNumber: 20,
    arabicText: 'وَمَا ٱلْحَيَوٰةُ ٱلدُّنْيَآ إِلَّا مَتَـٰعُ ٱلْغُرُورِ',
    translation: 'The life of this world is no more than the delusion of enjoyment.',
    translatorId: 20,
  },
  '3:159': {
    verseKey: '3:159',
    surahName: 'Ali Imran',
    ayahNumber: 159,
    arabicText: 'فَإِذَا عَزَمْتَ فَتَوَكَّلْ عَلَى ٱللَّهِ',
    translation: 'Once you make a decision, put your trust in Allah.',
    translatorId: 20,
  },
  '65:2': {
    verseKey: '65:2',
    surahName: 'At-Talaq',
    ayahNumber: 2,
    arabicText: 'وَمَن يَتَّقِ ٱللَّهَ يَجْعَل لَّهُۥ مَخْرَجًا',
    translation: 'And whoever is mindful of Allah, He will make a way out for them.',
    translatorId: 20,
  },
  '23:1': {
    verseKey: '23:1',
    surahName: "Al-Mu'minun",
    ayahNumber: 1,
    arabicText: 'قَدْ أَفْلَحَ ٱلْمُؤْمِنُونَ',
    translation: 'Successful indeed are the believers.',
    translatorId: 20,
  },
};

export function getFallbackVerseContent(verseKey: string): QuranVerseContent {
  return FALLBACK_VERSE_CONTENT[verseKey] ?? FALLBACK_VERSE_CONTENT[FALLBACK_VERSE_KEY];
}
