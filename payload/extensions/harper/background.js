/* Harper - Offline Grammar & Spell Checker
   Background Service Worker (Manifest V3)
   100% offline, privacy-preserving grammar analysis, rule-based checks,
   and dictionary-driven spell checking. */

'use strict';

// ── Built-in Typo Correction Map ─────────────────────────────────────────────
const COMMON_TYPOS = {
  'teh': ['the'],
  'definately': ['definitely'],
  'recieve': ['receive'],
  'seperate': ['separate'],
  'adress': ['address'],
  'wierd': ['weird'],
  'occured': ['occurred'],
  'occurence': ['occurrence'],
  'untill': ['until'],
  'succesful': ['successful'],
  'neccessary': ['necessary'],
  'necessery': ['necessary'],
  'alot': ['a lot'],
  'goverment': ['government'],
  'beleive': ['believe'],
  'truely': ['truly'],
  'tommorrow': ['tomorrow'],
  'tomorow': ['tomorrow'],
  'calender': ['calendar'],
  'accomodate': ['accommodate'],
  'achieve': ['achieve'],
  'acheive': ['achieve'],
  'across': ['across'],
  'accross': ['across'],
  'agressive': ['aggressive'],
  'apparant': ['apparent'],
  'appearence': ['appearance'],
  'argument': ['argument'],
  'arguement': ['argument'],
  'assasination': ['assassination'],
  'basicly': ['basically'],
  'begining': ['beginning'],
  'bizzare': ['bizarre'],
  'buisness': ['business'],
  'colleague': ['colleague'],
  'collegue': ['colleague'],
  'commited': ['committed'],
  'concious': ['conscious'],
  'curiosity': ['curiosity'],
  'curiousity': ['curiosity'],
  'decission': ['decision'],
  'dissapear': ['disappear'],
  'disappoint': ['disappoint'],
  'disapoint': ['disappoint'],
  'embarass': ['embarrass'],
  'environment': ['environment'],
  'existance': ['existence'],
  'experiance': ['experience'],
  'familar': ['familiar'],
  'finelly': ['finally'],
  'foriegn': ['foreign'],
  'fourty': ['forty'],
  'freind': ['friend'],
  'further': ['further'],
  'grammer': ['grammar'],
  'gaurantee': ['guarantee'],
  'guarentee': ['guarantee'],
  'happend': ['happened'],
  'harrass': ['harass'],
  'heigth': ['height'],
  'hieght': ['height'],
  'hierachy': ['hierarchy'],
  'humourous': ['humorous'],
  'ignorence': ['ignorance'],
  'immediatly': ['immediately'],
  'independant': ['independent'],
  'interupt': ['interrupt'],
  'knowlege': ['knowledge'],
  'liasion': ['liaison'],
  'libary': ['library'],
  'lisence': ['license'],
  'maintainance': ['maintenance'],
  'millenium': ['millennium'],
  'mischievious': ['mischievous'],
  'misspell': ['misspell'],
  'mispell': ['misspell'],
  'noticable': ['noticeable'],
  'ocassion': ['occasion'],
  'ocasionally': ['occasionally'],
  'persistant': ['persistent'],
  'posession': ['possession'],
  'prefered': ['preferred'],
  'priviledge': ['privilege'],
  'pronounciation': ['pronunciation'],
  'publically': ['publicly'],
  'realy': ['really'],
  'recommand': ['recommend'],
  'refered': ['referred'],
  'relevent': ['relevant'],
  'religous': ['religious'],
  'rember': ['remember'],
  'resistence': ['resistance'],
  'rythm': ['rhythm'],
  'seige': ['siege'],
  'sence': ['sense'],
  'similer': ['similar'],
  'suprise': ['surprise'],
  'tendancy': ['tendency'],
  'therefor': ['therefore'],
  'threshhold': ['threshold'],
  'tomatos': ['tomatoes'],
  'tounge': ['tongue'],
  'truely': ['truly'],
  'unforseen': ['unforeseen'],
  'unfortunatly': ['unfortunately'],
  'usefull': ['useful'],
  'vaccum': ['vacuum'],
  'vehical': ['vehicle'],
  'visable': ['visible'],
  'weather': ['weather'],
  'writting': ['writing'],
  'yall': ["y'all"],
  'yeild': ['yield']
};

// ── Built-in Offline Lexicon (~2,500 common English words) ───────────────────
const RAW_LEXICON = [
  'i you he she it we they me him her us them my your his its our their mine yours hers ours theirs',
  'am is are was were be been being have has had having do does did done doing will would shall should can could may might must ought',
  'go goes went gone going come comes came coming see sees saw seen seeing say says said saying get gets got gotten getting',
  'make makes made making take takes took taken taking know knows knew known knowing think thinks thought thinking eat eats ate eaten eating',
  'run runs ran running give gives gave given giving find finds found finding tell tells told telling feel feels felt feeling',
  'leave leaves left leaving put puts putting keep keeps kept keeping let lets letting begin begins began begun beginning',
  'seem seems seemed seeming help helps helped helping talk talks talked talking turn turns turned turning start starts started starting',
  'show shows showed shown showing hear hears heard hearing play plays played playing move moves moved moving like likes liked liking',
  'live lives lived living hold holds held holding bring brings brought bringing write writes wrote written writing',
  'provide provides provided providing sit sits sat sitting stand stands stood standing lose loses lost losing pay pays paid paying',
  'meet meets met meeting include includes included including continue continues continued continuing set sets setting learn learns learned learning',
  'change changes changed changing lead leads led leading understand understands understood understanding watch watches watched watching',
  'follow follows followed following stop stops stopped stopping create creates created creating speak speaks spoke spoken speaking',
  'read reads reading allow allows allowed allowing add adds added adding spend spends spent spending grow grows grew grown growing',
  'open opens opened opening walk walks walked walking win wins won winning offer offers offered offering remember remembers remembered remembering',
  'love loves loved loving consider considers considered considering appear appears appeared appearing buy buys bought buying wait waits waited waiting',
  'serve serves served serving die dies died dying send sends sent sending expect expects expected expecting build builds built building',
  'stay stays stayed staying fall falls fell fallen falling cut cuts cutting reach reaches reached reaching kill kills killed killing',
  'remain remains remained remaining one two three four five six seven eight nine ten first second third fourth fifth',
  'this that these those who whom whose which what where when why how all any both each few more most other some such no not only own same so than too very just',
  'a about above abroad absolute accept access accident according account across act action activity',
  'actual actually add address admit adopt adult advance advantage advice affect afraid after afternoon',
  'again against age agency agent ago agree agreement ahead air aircraft all allow almost alone along',
  'already also alternative although always among amount analysis and animal annual another answer any',
  'anybody anymore anyone anything anyway anywhere apart apparent apparently appeal appear appearance',
  'apple application apply appoint approach appropriate approval approve area argue argument arise arm',
  'around arrange arrangement array arrest arrival arrive article artist aside ask aspect assess asset',
  'assign assignment assist associate association assume assumption assure at athlete atmosphere attach',
  'attack attempt attend attention attitude attorney attract attribute audience author authority auto',
  'available average avoid await award aware balance ball band bank bar base basic basically basis battery',
  'be beach bear beat beautiful because become bed before begin beginning behalf behavior behind being',
  'belief believe belong below belt bench bend benefit beside best better between beyond big bill billion',
  'bird birth bit bite black blame block blood blow blue board boat body bold bone book boom boot border',
  'born boss both bottle bottom boundary bowl box boy branch brand bread break breakfast breast breath',
  'breathe brick bridge brief briefly bright brilliant bring broad broken brother brown brush budget',
  'build building built burn burst bus business busy but butter button buy buyer by cabinet cable call',
  'camera camp campaign can cancel candidate capable capacity capital captain capture car carbon card',
  'care career careful carefully carrier carry case cash cast cat catch category cause ceiling celebrate',
  'cell center central century ceremony certain certainly chain chair chairman challenge champion chance',
  'change channel chapter character charge charity chart chase cheap check cheek cheese chemical chest',
  'chicken chief child choice choose church circle circuit circumstance cite citizen city civil claim',
  'class classic clean clear clearly clerk click client climate climb clinic clock close closely closet',
  'cloth cloud club coach coalition coast coat code coffee coin cold collapse colleague collection',
  'college colony color column combine come comedy comfort comfortable command commander comment commercial',
  'commission commit commitment committee common communicate communication community company compare',
  'comparison compete competition competitor complaint complete completely complex complicated compose',
  'composition comprehensive computer concern conclude conclusion condition conduct conference confidence',
  'confident confirm conflict connect connection conscious consider considerable consideration consist',
  'consistent constant constantly construct construction consume consumer contact contain container',
  'content contest context continue continuous contract contrast contribute contribution control',
  'controversial conversation convert convince cook cookie cool copy core corner corporate corporation',
  'correct correctly cost could council counsel count counter country county couple course court cover',
  'coverage cow crack craft crawl crazy cream create creation creative creativity creature credit crew',
  'crime criteria critic critical criticism cross crowd crucial crush cry cultural culture cup cure',
  'curious current currently curve custom customer cut cycle dad daily damage dance danger dangerous',
  'dare dark data database date daughter day dead deal dear death debate decade decide decision declare',
  'decline decrease deep deeply deer defeat defend defense defensive define definition degree delay',
  'deliver delivery demand democracy democrat demonstrate demonstration deny department depend dependent',
  'depending depict deposit derive describe description design designer desire desk desperate despite',
  'destroy detail detailed detect determine develop developer development device devote dialog dialogue',
  'dictionary diet differ difference different differently difficult difficulty dig dimension diminish',
  'dinner direct direction directly director dirty disabled disagree disappear discover discovery discuss',
  'discussion disease dish dismiss display dispute distance distant distinct distribute distribution',
  'district diverse diversity divide division divorce do doctor document documentation dog dollar door',
  'double doubt down draft drag dramatic draw drawer drawing dream dress drink drive driver drop drug',
  'drum dry due duplicate during dust duty each eager ear early earn earth ease easily east eastern easy',
  'eat economic economics economy edge edition editor educate education educator effect effective',
  'effectively efficiency efficient effort egg eight either elderly elect election electric electricity',
  'electronic element elevator elite else elsewhere email emerge emergency emotion emotional emphasis',
  'emphasize empire employ employee employer employment empty enable encounter encourage end enemy',
  'energy engine engineer engineering enjoy enhance enough ensure enter enterprise entertain entertainment',
  'entire entirely entity entrance entry environment episode equal equally equipment era error escape',
  'especially essay essence essential establish establishment estate estimate etc ethical evaluate',
  'evaluation even evening event eventually ever every everybody everyone everything everywhere evidence',
  'evident evil evolution exact exactly examine example excellent except exception excess exchange',
  'excite excited excitement exclude excuse execute executive exercise exhibit exhibition exist existence',
  'exit expand expansion expect expectation expected expense expensive experience experiment expert',
  'explain explanation explore export expose exposure express expression extend extension extensive',
  'extent external extra extraordinary extreme eye fabric face facility fact factor factory faculty',
  'fade fail failure fair fairly faith fall false familiar family famous fan fantastic far farm farmer',
  'fascinating fashion fast fat fault favor favorite fear feature federal fee feed feedback feel feeling',
  'fellow female fence fever few fiber fiction field fifteen fifth fifty fight fighter figure file fill',
  'film final finally finance financial find fine finger finish fire firm first fish fit fit fitness five',
  'fix flag flame flash flat flavor flee flight float floor flow flower fluid fly focus fog fold follow',
  'following food foot football for force foreign forest forever forget form format formal formula forth',
  'fortune forward found foundation founder four frame free freedom freeze frequency frequent frequently',
  'fresh friend friendly friendship frog from front fruit frustration fuel full fully fun function fund',
  'fundamental funding funny furniture further future gain gallery game gang gap garage garbage garden',
  'garlic gas gate gather gauge gear gene general generally generate generation generic generous genius',
  'gentle gentleman genuine geography get giant gift girl girlfriend give given glad glance glass global',
  'globe glory glow go goal god gold golden good government grab grade gradually grain grand grandfather',
  'grandmother grant grass grateful grave gray great greatly green greet grocery ground group grow growth',
  'guarantee guard guess guest guidance guide guilt guilty guitar gun guy habit habitat hair half hallway',
  'hand handle hang happen happy harassment hard hardly harm harmony hat hate have he head headline health',
  'healthy hear hearing heart heat heaven heavily heavy heel height helicopter hello help helpful her',
  'heritage hero hide high highlight highly highway hill him himself hire his historian historic historical',
  'history hit hold holder hole holiday home honest honor hope horizon horizontal horse hospital host hot',
  'hotel hour hourly house household housing how however huge human humanity humble humor hundred hungry',
  'hunt hunter hurry hurt husband ice idea ideal identify identity ideological idle if ignore ill illegal',
  'illness illustrate illustration image imagination imagine immediate immediately immigrant impact',
  'implement implication imply import importance important impose impossible impression impressive improve',
  'improvement in incentive incident include including income incorporate increase incredible indeed',
  'independence independent index indicate indication individual industrial industry inevitable infant',
  'infect infection influence inform information infrastructure initial initially initiative injure injury',
  'inmate inner innocent innovation input insect inside insight insist install instance instant instead',
  'institution instructional instructor insurance intact integer integrate intelligence intelligent',
  'intend intense intensity intensive intent intention interact interaction interest interested',
  'interesting intermediate internal international internet interpretation intervene interview into',
  'introduce introduction invade invasion invent invest investigate investigation investigator investment',
  'investor invite involve iron island isolate issue it item itself jacket jail job join joint journal',
  'journalist journey joy judge judgment judicial juice jump jungle junior jurisdiction jury just justice',
  'justify keep key kick kid kill kind king kingdom kiss kit kitchen knee knife knock know knowledge lab',
  'label labor lack ladder lady lake lamp land landscape language lap large largely laser last late lately',
  'later launch law lawn lawsuit lawyer lay layer lead leader leadership leading league lean learn learning',
  'least leather leave left leg legacy legal legend legislation legislative legislator legitimate lemon',
  'length lens less lesson let letter level liability liberal liberty library license lie life lifestyle',
  'lifetime light lightly lightweight like likely limit limitation line link lip liquid list listen load',
  'loan local location lock log logic lonely long long-term look loose lose loss lost lot loud love low',
  'loyal loyalty luck lucky lunch lung machine magazine magic mail main mainly maintain maintenance',
  'major majority make maker male manage management manager mandate manner manufacture manufacturer many',
  'map margin mark market marketing marriage married marry mask massive master match mate material',
  'matter maximum may maybe mayor me meal mean meaning meantime meanwhile measure measurement meat medal',
  'media medical medication medicine medium meet meeting member membership memory mention menu mercy mere',
  'merely message metal meter method micro middle midnight midst might military milk million mind minimum',
  'minister ministry minor minority minute miracle mirror miss missed missile mission mistake mix mixture',
  'mobile model moderate mode modern modest modify moisture moment momentum monitor month monthly mood',
  'moon moral more moreover morning mortgage most mostly mother motion motivate motivation motor mountain',
  'mouse mouth move movement movie much multiple municipal museum music musical musician must mutual my',
  'myself mystery nail name narrative narrow nation national nationwide native natural naturally nature',
  'near nearby nearly necessarily necessary neck need negative negotiate negotiation neighbor neighborhood',
  'neither nerve nervous net network neutral never nevertheless new newborn newly news next nice night',
  'nine no nobody noise nominate nomination non none non-profit nonetheless noon nor norm normal normally',
  'north northern nose not note nothing notice notion novel nowhere nuclear number numerous nurse nut',
  'object objective obligation observe observer obtain obvious obviously occasion occasional occasionally',
  'occupation occupy occur occurrence ocean odd oddity odds of off offence offer office officer official',
  'officially often oh oil okay old ongoing olive on once one ongoing online only onto open opening operate',
  'operating operation operational operator opinion opponent opportunity oppose opposite opposition option',
  'or oral orange order ordinary organic organization organize organized organizer origin original originally',
  'other others otherwise ought our ours ourselves out outcome output outside outstanding over overall',
  'overcome oversea oversee own owner pace pack package pad page pain painful paint painter painting pair',
  'pale palm panel panic paper paragraph parallel parameter parcel parent park part participant participate',
  'participation particular particularly partner partnership party pass passage passenger passion past',
  'path patient pattern pause pay payment peace peaceful peak penalty people pepper perceive percent',
  'percentage perception perfect perfectly perform performance performer perhaps period permanent permission',
  'permit person personal personality personally personnel perspective petition phase philosophy phone',
  'photo photograph photographer physical physically piano pick picture piece pile pilot pine pink pin pipe',
  'pitch place placement plain plan plane planet plant plastic plate platform play player plea pleasant',
  'please pleasure plenty plot plug plus pocket poem poetry point pole police policy politician political',
  'politics poll pollution pool poor pop popular population porch pork port portfolio portion portrait',
  'portray pose position positive possess possession possibility possible possibly post pot potato potential',
  'potentially pound pour poverty powder power powerful practical practically practice praise pray prayer',
  'precisely predict prediction prefer preference pregnancy pregnant preliminary prepare presence present',
  'presentation preserve president presidential press pressure pretend prevail prevent previous previously',
  'price primary primarily prime primitive principal principle print prior prioritize priority prison',
  'private probably problem procedure proceed process processing produce producer product production',
  'profession professional profile profit program progress project promote promotion prompt proof proper',
  'properly property proportion proposal propose prosecution prospect protect protection protective protein',
  'protest proud prove provide provided province provision psychological psychology public publication',
  'publicly publish publisher pull punish purchase pure purely purpose pursue push put qualify quality',
  'quantity quarter quarterly queen quest question quick quickly quiet quietly quit quote race racial',
  'radical radio rail rain raise range rank rapid rapidly rare rarely rat rate rather ratio raw reach react',
  'reaction read reader readiness ready real realistic reality realize really realm reason reasonable rebuild',
  'recall receipt receive receiver recent recently reception recipe recognition recognize recommend record',
  'recover recovery recruit red reduce reduction refer reference reflect reform refugee refusal regard',
  'regarding regardless regime region regional register registration regular regularly regulate regulation',
  'reinforce reject relate relation relationship relative relatively relax release relevant reliability',
  'reliable relief religion religious rely remain remainder remarkable remember remind remote remove repeat',
  'replace replacement reply report reporter represent representation representative republic require',
  'requirement rescue research researcher resemble reservation reserve resident resist resolution resolve',
  'resort resource respect respective respond respondent response responsibility responsible rest restaurant',
  'restore result retain retire retirement return reveal revenue review revolution rhythm rice rich rid ride',
  'rifle right rim ring rinse rise risk ritual rival river road robot rock roll roman roof room root rope',
  'rose rough roughly round route routine row rub rubber ruin rule ruler run rural rush sacred sad safe',
  'safety salad salary sale salmon salt same sample sanction sand sandwich satellite satisfaction satisfy',
  'save saving scale scandal scan scarce scarcely scene schedule scheme school science scientific scientist',
  'scope score scratch scream screen screw script search season seat second secondary secret secretary',
  'section sector secure security see seed seek seem segment seize select selection self sell senate senator',
  'send senior sense sensitive sensor sentence separate separation sequence series serious seriously serve',
  'service session set setting settle settlement seven seventh seventy several severe severely shadow shake',
  'shall shape share shared shark sharp sharply she sheet shelf shell shelter shift shine ship shirt shock',
  'shoe shoot shooting shop shopping shore short shortly shortage shot should shoulder shout show shower',
  'shrink shut sick side sign signal signature significance significant significantly silence silent silver',
  'similar similarity similarly simple simplify simply simultaneous sin since sincere sing singer single',
  'sink sister sit site situation six sixth sixty size skill skin skirt sky sleep slice slide slight',
  'slightly slim slip slow slowly small smart smash smell smile smoke smooth snake snap snow so social',
  'society software soil solar soldier solid solution solve some somebody somehow someone something sometime',
  'sometimes somewhat somewhere song soon sophisticated sorry sort soul sound soup source south southern',
  'space Spanish spare speak speaker special specialist specifically species specific specify speech',
  'speed spend spending sphere spice spider spill spin spirit spiritual spite split sponsor sport spot spread',
  'spring stability stable stack stadium staff stage stain stair staircase stake stand standard stand',
  'standardize star start starting state statement station stationary statistical status stay steady steak',
  'steal steam steel step stick stiff still stimulus stock stomach stone stop storage store storm story',
  'straight straightforward strain strange stranger strategic strategy stream street strength strengthen',
  'stress stretch strict strictly strike stroke strong strongly structural structure struggle student',
  'studio study stuff style subdivide subject submission submit substance substantial succeed success',
  'successful successfully such sudden suddenly sue suffer sugar suggest suggestion suicide suit suitable',
  'summer summit sun supply support supporter supposed supreme sure surely surface surgery surprise',
  'surprising surround surveillance survey survival survive suspect suspend sustain swear sweep sweet',
  'swim swing switch symbol symptom synthesize system systemic table tablet tag tail take tale talent talk',
  'tall tank tap target task taste tax tea teach teacher teaching team tear tech technical technique',
  'technology teenager telephone telescope television tell temperature temporarily temporary ten tendency',
  'tender tennis tension term terminal terms terrible territory test testimony texture than thank thanks',
  'that the theater theatre their them theme themselves then theoretical theory therapy there thereafter',
  'thereby therefore these thesis they thick thickness thin thing think third thirty this thorough',
  'thoroughly those though threat threaten three throat through throughout throw thrust thumb ticket tide',
  'tie tight tile timber time timeout timer timing tiny tip tissue title to tobacco today toe together',
  'toilet token tolerate tolerance toll tomato tomorrow tone tongue tonight too tool top topic totally',
  'tough tour tourist tournament toward towards towel tower town toxic trace track tracker trade trader',
  'trading tradition traditional traffic tragedy train trainer training transaction transfer transform',
  'transit transition translate translation transport trash travel treasure treat treatment treaty tree',
  'trend trial triangle tribe tribute trick trigger trip triumph troop tropical trouble truck true truly',
  'trunk trust truth try tube tune turn turnover twin twist two type typical typically ultimate ultimately',
  'unable uncle under undergo understand understanding undertake undo uniform unique union unique unit',
  'unite unity universal universe university unknown unless unlike unlikely until unusual up update upon',
  'upper upset urban urge urgent usage use used useful user usual usually valid validate validation valley',
  'valuable value van variable variation varied variety various vary vast vegetable vehicle velocity vendor',
  'venture venue verdict verify version versus vertical very vessel veteran via vibrant victim victory video',
  'view viewer village violent violence virtual virtually virtue visible vision visit visitor visual vital',
  'vocabulary voice volume voluntary volunteer vote voter vulnerable wage wait wake walk wall wander want',
  'war warm warming warning wash waste watch water wave way we weapon wear weather web website wedding week',
  'weekend weekly weight welcome welfare well west western wet what whatever whatsoever wheel when whenever',
  'where whereas wherever whether which while whisper white who whole wholly whom whose why wide widely',
  'widow width wife wild wilderness will willing willingly win wind window wine wing winner winter wipe',
  'wire wisdom wise wish with withdraw within without witness woman wonder wonderful wood wooden word work',
  'worker working workforce workout world worldwide worm worry worth wound wrap wrapper wrist write writer',
  'writing wrong yard yeah year yellow yes yesterday yet yield you young youngster your yours yourself youth zone'
].join(' ');

const BUILTIN_WORDS = new Set(RAW_LEXICON.split(/\s+/).map(w => w.toLowerCase()));

// ── In-Memory Custom Dictionary ──────────────────────────────────────────────
let customDictionary = new Set();

function loadCustomDictionary() {
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('harper_custom_words', (result) => {
        if (result && Array.isArray(result.harper_custom_words)) {
          customDictionary = new Set(result.harper_custom_words.map(w => w.toLowerCase()));
        }
      });
    }
  } catch (err) {
    // Storage might not be available during non-browser testing
  }
}
loadCustomDictionary();

// ── Edit Distance & Spelling Candidate Generator ─────────────────────────────
function editDistance(a, b) {
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > 2) return 99;
  const row = [];
  for (let i = 0; i <= bl; i++) row[i] = i;
  for (let i = 1; i <= al; i++) {
    let prev = i;
    for (let j = 1; j <= bl; j++) {
      const val = (a[i - 1] === b[j - 1]) ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[bl] = prev;
  }
  return row[bl];
}

function isWordKnown(word) {
  const lower = word.toLowerCase();
  if (BUILTIN_WORDS.has(lower) || customDictionary.has(lower)) return true;
  // Ignore single letters (except a, i)
  if (lower.length === 1 && (lower === 'a' || lower === 'i')) return true;
  if (lower.length === 1) return false;
  // Common suffixes heuristic
  if (lower.endsWith('s') && BUILTIN_WORDS.has(lower.slice(0, -1))) return true;
  if (lower.endsWith('ed') && BUILTIN_WORDS.has(lower.slice(0, -2))) return true;
  if (lower.endsWith('ing') && BUILTIN_WORDS.has(lower.slice(0, -3))) return true;
  if (lower.endsWith('ly') && BUILTIN_WORDS.has(lower.slice(0, -2))) return true;
  return false;
}

function getSpellingSuggestions(word, maxResults = 3) {
  const lower = word.toLowerCase();

  // 1. Instant lookup in common typos
  if (COMMON_TYPOS[lower]) {
    const direct = COMMON_TYPOS[lower];
    // Preserve initial capitalization if input was capitalized
    if (/^[A-Z]/.test(word)) {
      return direct.map(s => s.charAt(0).toUpperCase() + s.slice(1));
    }
    return direct.slice(0, maxResults);
  }

  // 2. Bounded edit distance scan
  const candidates = [];
  for (const candidate of BUILTIN_WORDS) {
    if (Math.abs(candidate.length - lower.length) > 2) continue;
    const dist = editDistance(lower, candidate);
    if (dist <= 2) {
      candidates.push({ word: candidate, dist: dist });
    }
  }

  candidates.sort((a, b) => a.dist - b.dist || a.word.length - b.word.length);
  const results = candidates.slice(0, maxResults).map(c => c.word);

  if (/^[A-Z]/.test(word)) {
    return results.map(s => s.charAt(0).toUpperCase() + s.slice(1));
  }
  return results;
}

// ── Offline Grammar Rules Engine ─────────────────────────────────────────────
const CONFUSION_RULES = [
  { pattern: /\b(their)\s+(are|is|were|was)\b/i, replace: 'there', message: "Did you mean 'there'?" },
  { pattern: /\b(there)\s+(car|house|book|dog|child|children|parents|family|name)\b/i, replace: 'their', message: "Did you mean possessive 'their'?" },
  { pattern: /\b(they're)\s+(car|house|book|dog|child|children|parents|family|name)\b/i, replace: 'their', message: "Did you mean possessive 'their'?" },
  { pattern: /\b(their)\s+(going|coming|leaving|doing|saying)\b/i, replace: "they're", message: "Did you mean 'they're' (contraction of they are)?" },
  { pattern: /\b(its)\s+(a|an|the|not|been|very|too)\b/i, replace: "it's", message: "Did you mean 'it's' (it is)?" },
  { pattern: /\b(it's)\s+(own|color|name|size|weight|flavor|type|price)\b/i, replace: 'its', message: "Did you mean possessive 'its'?" },
  { pattern: /\b(your)\s+(welcome)\b/i, replace: "you're", message: "Did you mean 'you're welcome'?" },
  { pattern: /\b(you're)\s+(car|house|name|phone|computer|book|dog|job)\b/i, replace: 'your', message: "Did you mean possessive 'your'?" },
  { pattern: /\b(better|more|less|rather|other|greater|worse)\s+(then)\b/i, replace: 'than', message: "Use 'than' for comparisons instead of 'then'." },
  { pattern: /\b(could|should|would|might|must)\s+(of)\b/i, replace: 'have', message: "Use 'have' instead of 'of' ('could have', etc.)." }
];

function analyzeText(text) {
  if (!text || typeof text !== 'string') return [];
  const issues = [];

  // 1. Grammar Check: Repeated Words (e.g. "the the", "in in", "is is")
  const repeatedWordRegex = /\b([a-zA-Z]{2,})\s+\1\b/gi;
  let match;
  while ((match = repeatedWordRegex.exec(text)) !== null) {
    const singleWord = match[1];
    issues.push({
      id: 'grammar_repeat_' + match.index,
      type: 'grammar',
      start: match.index,
      end: match.index + match[0].length,
      matchedText: match[0],
      message: `Repeated word: '${match[0]}'`,
      suggestions: [singleWord]
    });
  }

  // 2. Grammar Check: Capitalization at beginning of text or after terminal punctuation
  const sentenceCapRegex = /(?:^|[.!?]\s+)([a-z])/g;
  while ((match = sentenceCapRegex.exec(text)) !== null) {
    const charIndex = match.index + match[0].length - 1;
    const char = match[1];
    issues.push({
      id: 'grammar_cap_' + charIndex,
      type: 'grammar',
      start: charIndex,
      end: charIndex + 1,
      matchedText: char,
      message: 'Sentence should begin with a capital letter.',
      suggestions: [char.toUpperCase()]
    });
  }

  // 3. Grammar Check: Common Confusions & Collocations
  for (const rule of CONFUSION_RULES) {
    const regex = new RegExp(rule.pattern.source, 'gi');
    while ((match = regex.exec(text)) !== null) {
      // Find the specific confused word in the match
      const matchedStr = match[0];
      issues.push({
        id: 'grammar_confusion_' + match.index,
        type: 'grammar',
        start: match.index,
        end: match.index + matchedStr.length,
        matchedText: matchedStr,
        message: rule.message,
        suggestions: [matchedStr.replace(new RegExp(match[1], 'i'), rule.replace)]
      });
    }
  }

  // 4. Grammar Check: Indefinite Article Agreement ("a" vs "an")
  const articleRegex = /\b(a|an)\s+([a-zA-Z]+)\b/gi;
  while ((match = articleRegex.exec(text)) !== null) {
    const art = match[1].toLowerCase();
    const nextWord = match[2].toLowerCase();
    const isVowelInitial = /^[aeiou]/i.test(nextWord);
    
    // Exception rules for common English phonetics
    const isSpecialConsonantSound = /^(user|universe|university|unique|uniform|unit|one|once)/i.test(nextWord);
    const isSpecialVowelSound = /^(hour|honest|honor|heir)/i.test(nextWord);

    const requiresAn = (isVowelInitial && !isSpecialConsonantSound) || isSpecialVowelSound;

    if (art === 'a' && requiresAn) {
      issues.push({
        id: 'grammar_article_' + match.index,
        type: 'grammar',
        start: match.index,
        end: match.index + match[0].length,
        matchedText: match[0],
        message: `Use 'an' before vowel sounds: 'an ${match[2]}'`,
        suggestions: [`an ${match[2]}`]
      });
    } else if (art === 'an' && !requiresAn) {
      issues.push({
        id: 'grammar_article_' + match.index,
        type: 'grammar',
        start: match.index,
        end: match.index + match[0].length,
        message: `Use 'a' before consonant sounds: 'a ${match[2]}'`,
        suggestions: [`a ${match[2]}`]
      });
    }
  }

  // 5. Spelling Check: Scan individual words
  const wordRegex = /\b([a-zA-Z]{2,})\b/g;
  while ((match = wordRegex.exec(text)) !== null) {
    const rawWord = match[1];
    const startIndex = match.index;
    const endIndex = startIndex + rawWord.length;

    // Check if covered by an existing grammar issue
    const alreadyHandled = issues.some(iss => iss.start <= startIndex && iss.end >= endIndex);
    if (alreadyHandled) continue;

    // Ignore acronyms / all caps (e.g. NASA, HTML, URL, USA)
    if (/^[A-Z]{2,}$/.test(rawWord)) continue;

    // Check spelling against dictionary and typo maps
    if (!isWordKnown(rawWord)) {
      const suggs = getSpellingSuggestions(rawWord);
      issues.push({
        id: 'spelling_' + startIndex,
        type: 'spelling',
        start: startIndex,
        end: endIndex,
        matchedText: rawWord,
        message: `Possible spelling mistake: '${rawWord}'`,
        suggestions: suggs
      });
    }
  }

  // Sort issues in chronological offset order
  issues.sort((a, b) => a.start - b.start);
  return issues;
}

// ── Message Dispatcher ───────────────────────────────────────────────────────
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const action = request && request.action;

    if (action === 'CHECK_TEXT') {
      const issues = analyzeText(request.text || '');
      sendResponse({ status: 'ok', issues: issues });
      return false;
    }

    if (action === 'GET_SUGGESTIONS') {
      const suggs = getSpellingSuggestions(request.word || '');
      sendResponse({ status: 'ok', suggestions: suggs });
      return false;
    }

    if (action === 'ADD_TO_DICTIONARY') {
      const word = (request.word || '').toLowerCase().trim();
      if (word && !customDictionary.has(word)) {
        customDictionary.add(word);
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ harper_custom_words: Array.from(customDictionary) });
        }
      }
      sendResponse({ status: 'ok', added: word });
      return false;
    }

    if (action === 'GET_DICTIONARY') {
      sendResponse({ status: 'ok', words: Array.from(customDictionary) });
      return false;
    }

    if (action === 'PING') {
      sendResponse({ status: 'ok', engine: 'Harper Offline Service Worker', version: '1.0.0' });
      return false;
    }

    sendResponse({ status: 'unknown_action' });
    return false;
  });
}

// Export for testing/internal use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COMMON_TYPOS,
    isWordKnown,
    getSpellingSuggestions,
    analyzeText,
    editDistance
  };
}
