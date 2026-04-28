import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'db', 'themes.db'));

const APHEX_USERNAMES = [
  'XTAL','Pulsewidth','Ageispolis','Tha','Actium','Fingerbib','AlbertoBalsalm',
  'ComeToDaddy','Flim','Windowlicker','Ventolin','Milkman','GirlBrotherSong',
  'Avril14th','Nanou2','PetiatilCxHtdu2','CockVer10','MtSaintMichelMix',
  'BlueCalx','Rhubarb','Lichen','StoneInFocus','ZTwig','Hexagon',
  'LoganRockWitch','Grumpy','LaughableButaneBob','BucephalusBouncingBall',
  'Cilonen','Digeridoo','Didgeridoo','PolynomialC','AnalogueBubblebath',
  'Bubblebath','PhlangePhace','GwelyMernans','HyAScorpio','VBSRedlofB',
  'Klopjob','Meltphace6','AcridAvidJamShred','ArchedMaidViaRickshaw',
  'BatineActif','Bimbongo','BlocBloc','BwoonDub','Chippy','Cirklon3',
  'CouchPotaTo','Diskhat1','Diskhat2','DiskPrepCal2','DiskRep1',
  'DodeccaCaad','DonkeyRhubarb','Drukqs','ForkRave','FourOfSeven',
  'GardenLinpi','HalibutAcid','Hankie','InTheRubble','IzUs','Jamband',
  'KessonDaslef','LaughingDragon','Marchromt','Marlene','MincThda',
  'Mookid','MtRainier','Nightmail','Nobou','NotProudOfIt','Nyktibad',
  'OrbanEqTrx4','OrganPlod','Ox3','PancakeLizard','PentyPill','PianoUn10',
  'Pitcard','Pondloop','PrependRemain','ProudPimp','Px14','Px3',
  'Quixote','RedPonytail','Reunion','RoughSweep','RunThePlaceRed',
  'RushupBank12','Saggitariutt','Sampled_Vocals_1','SammiDread',
  'Scorrier','SergeFenixRendered','Sexton','Sketch','SlowEarlyMorning',
  'SmackMyBitchUp','Ssnb','StMichaelMount','SteppingFilter101',
  'SummerInSpace','Syro','T08','T10','T16','T20','T23','T47','T48',
  'T58','T69','Triumph','VBS.Redlof.B','Vordhosbn','Vurt','W32.Deadcode.A',
  'WeAreTheMusicMakers','WetTipHenTie','WonderFlips','XMAS_EVET1',
  'Xmd5a','YellowCalx','Ziggomatic17','4BitBleep','7Gel','8Linen',
  '19Rhythm','34Ibiza','54Cymru','Beats','Battleship','BoatCarol',
  'Bodmin','Carnival','Caving','Clayhill','Daventry','Dumfries',
  'Epping','Falmouth','Glastonbury','Hexham','Killerton','Lynton',
  'Morpeth','Oakwood','Pensans','Poltimore','Portreath','Porthleven',
  'Porthmeor','Porthtowan','Radnor','Relapse','Salisbury','Sith',
  'StIves','Tantines','Taunton','Trelawney','Trevellas','Truro',
  'Wadebridge','Wendon','Worcester','Yelverton','Aelass',
  'BrockenSpectre','Cancle','CarteBlanche','Dawl','Ely','Fen'
];

const FLAIRS = [
  'Synth Prophet','Analog Alchemist','Bass Diplomat','Noise Engineer',
  'Dubplate Dealer','Frequency Junkie','Wave Folder','Reverb Abuser',
  'Patch Nomad','Tape Warper','Signal Pirate','Filter Fiend',
  'LFO Cultivator','Beat Tinkerer','MIDI Monk','Track Architect',
  '808 Saint','Sidechain Sage','Groove Digger','Sample Shaman',
  'Threshold Guardian','Resonance Wrangler','Delay Architect','Chorus Monk',
  'Distortion Diplomat','Compression Keeper','EQ Visionary','Pan Pot Prince',
  'Mastering Maven','Mix Alchemist','Atmosphere Drifter',
  'Subspace Explorer','Rhythm Occultist','Noise Shaman','Sine Apostle',
  'Wavetable Runner','Phase Aligner','Harmonic Gatherer','Pulse Keeper',
  'Drift Surfer','Glitch Nomad','Ambient Farmer','Bleep Oracle',
  'Techno Hermit','IDM Gardener','Breakbeat Mechanic','Acid Pilgrim',
  'DnB Cartographer','Electro Scribe','Dub Archivist'
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function irnd(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }

async function seed() {
  console.log('Seeding users...');

  const existingThemes = db.prepare('SELECT id FROM themes').all();
  console.log(`  ${existingThemes.length} themes to distribute`);

  // Create users
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, email, password_hash, title) VALUES (?, ?, ?, ?)');
  const insertComment = db.prepare('INSERT INTO profile_comments (profile_username, author, message) VALUES (?, ?, ?)');
  const insertThemeComment = db.prepare('INSERT INTO comments (theme_id, author, message) VALUES (?, ?, ?)');
  const updateThemeAuthor = db.prepare('UPDATE themes SET author = ? WHERE id = ?');
  const updateLikes = db.prepare('UPDATE themes SET likes = ?, downloads = ? WHERE id = ?');

  const COMMENT_POOL = [
    'sick palette','using this on my next EP','too dark for my eyes lol',
    'finally a theme for night sessions','love the contrast','pattern editor reads so clean now',
    'is the accent a bit harsh on white? still great','my favourite this week',
    'the VU meter colors are perfect','thx for sharing 🙏','instant download',
    'goes hard with synthwave projects','soft on the eyes, exactly what i needed',
    'wish the highlight was a touch warmer','paired this with my OLED — chefs kiss',
    'underrated','feels like a fresh install','minimal and focused, love it',
    'cursor color could pop more','better than the official ones',
    'reminds me of my old amiga','comfy','the body bg is *perfect*',
  ];

  const PROFILE_COMMENTS = [
    'your themes are incredible!','love your style','big fan of your work 🙌',
    'keep making these','just discovered your page — amazing stuff',
    'the community needs more people like you','inspired by your palettes',
    'your dark themes got me through production hell lol',
    'cleanest theme designer out there','underrated artist',
    'been following your work for a while 🔥','respect the craft',
  ];

  const hash = await bcrypt.hash('temppass123', 10);
  let created = 0;

  for (const username of APHEX_USERNAMES.slice(0, 100)) {
    try {
      insertUser.run(username.toLowerCase(), `${username.toLowerCase()}@aphex.local`, hash, pick(FLAIRS));
      created++;
    } catch (e) {
      // skip duplicates
    }
  }
  console.log(`  Created ${created} users`);

  // Distribute themes across users
  const allUsers = db.prepare("SELECT username FROM users WHERE username NOT IN ('MENE')").all();
  const userList = allUsers.map(u => u.username);
  const realComments = ['testuser123','testuser456','testuser99','MENE'];

  let assigned = 0;
  for (const theme of existingThemes) {
    const author = pick(userList);
    updateThemeAuthor.run(author, theme.id);
    // Random likes/downloads
    const likes = irnd(10, 500);
    const downloads = irnd(50, 2000);
    updateLikes.run(likes, downloads, theme.id);
    // Add a few theme comments
    const numComments = irnd(1, 4);
    for (let i = 0; i < numComments; i++) {
      insertThemeComment.run(theme.id, pick(realComments), pick(COMMENT_POOL));
    }
    assigned++;
  }
  console.log(`  Distributed ${assigned} themes across ${userList.length} users`);

  // Seed profile comments between users
  const shuffled = [...userList].sort(() => Math.random() - 0.5);
  let profileComments = 0;
  for (const username of userList) {
    const commenters = shuffled.filter(u => u !== username).sort(() => Math.random() - 0.5).slice(0, irnd(2, 5));
    for (const commenter of commenters) {
      insertComment.run(username, commenter, pick(PROFILE_COMMENTS));
      profileComments++;
    }
  }
  console.log(`  Seeded ${profileComments} profile comments`);

  // Update theme counts for each user
  const updateCount = db.prepare('UPDATE users SET themes_uploaded = (SELECT COUNT(*) FROM themes WHERE author = users.username)');
  updateCount.run();
  const userCounts = db.prepare('SELECT username, themes_uploaded FROM users ORDER BY themes_uploaded DESC LIMIT 5').all();
  console.log('  Top 5 users by themes:', userCounts.map(u => `${u.username}(${u.themes_uploaded})`).join(', '));

  console.log('✅ Seed complete!');
  db.close();
}

seed().catch(console.error);
