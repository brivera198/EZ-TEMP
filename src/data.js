// Measurements, scripture references and comparison data.
// Every structural dimension used by the 3D builders lives here or is
// derived from the numbers here, so the model can be audited against the text.

// --- Units -----------------------------------------------------------------
// Ezek 40:5; 43:13 — "a cubit and a handbreadth": the long (royal) cubit of
// 7 handbreadths. 2 Chr 3:3 says Solomon's temple used "cubits of the first
// measure", generally taken to be the same older, longer cubit.
export const CUBIT = 0.525;          // metres (7 handbreadths x 7.5 cm)
export const REED = 6 * CUBIT;       // 3.15 m (Ezek 40:5)

// --- World placement --------------------------------------------------------
// World units are metres. x = east, z = south, y = up.
// The origin is the Foundation Stone (es-Sakhra) on the Temple Mount summit.
// y = elevation above sea level minus Y0.
export const Y0 = 600;
export const ROCK_ELEV = 743;        // m above sea level

// Both temples are placed so that the Most Holy Place sits over the rock.
// In Ezekiel's plan the Most Holy Place centre is 125 cubits west of the
// precinct centre, so the precinct centre is 125 cubits east of the rock.
export const EZ_CENTER_X = 125 * CUBIT;

// Terrace levels in cubits above the precinct's base ground.
// 7 steps to the outer court (40:22,26), 8 to the inner court (40:31,34,37),
// and a platform "a full reed of six great cubits" under the house (41:8),
// reached by 10 steps (LXX 40:49). A step rise of half a cubit is assumed.
export const STEP = 0.5;
export const LEVEL = { base: 0, outer: 7 * STEP, inner: 15 * STEP, house: 15 * STEP + 6 };
// House floor placed just above the rock (743 m) => base ground elevation.
export const BASE_Y = (ROCK_ELEV + 0.5 - Y0) - LEVEL.house * CUBIT;

// Shared Temple Mount podium: Ezekiel's 500-cubit square plus a 10-cubit
// apron for the gate steps. The Mishnah (Middot 2:1) gives the pre-Herodian
// Temple Mount as 500 x 500 cubits too. The 50-cubit open land of 45:2 is
// drawn as an outline on the ground around it.
export const PODIUM_HALF_C = 260;                 // cubits
export const PODIUM_HALF = PODIUM_HALF_C * CUBIT; // metres

// Solomon's palace terrace on the Ophel, south of the temple (1 Kgs 7:1-12).
export const PALACE_PAD = { x0: -45, x1: 105, z0: 166, z1: 335, y: 130 };

// --- Info cards -------------------------------------------------------------
// id -> { title, he (Hebrew term), dims: [], refs, note, mode }
export const INFO = {
  // Ezekiel ---------------------------------------------------------------
  'ez-wall': {
    mode: 'ez', title: 'Outer wall', he: 'חוֹמָה',
    dims: ['Thickness 1 reed = 6 cubits (3.15 m)', 'Height 1 reed = 6 cubits (3.15 m)', 'Encloses 500 × 500 cubits (262.5 m square)'],
    refs: 'Ezek 40:5; 42:15–20',
    note: 'The Hebrew text of 42:16–19 reads "500 reeds" (1,575 m a side). The Greek (LXX) reads "cubits". The inner measurements add up to exactly 500 cubits (50 + 100 + 50 + 100 + 100 + 100), so the model uses cubits. Turn on the "500 reeds" layer to see the alternative.'
  },
  'ez-migrash': {
    mode: 'ez', title: 'Open land around the sanctuary', he: 'מִגְרָשׁ',
    dims: ['50 cubits (26 m) wide on every side', 'Sanctuary + open land = 600 × 600 cubits'],
    refs: 'Ezek 45:2', note: 'A buffer that keeps the holy precinct apart from ordinary ground.'
  },
  'ez-gate-east': {
    mode: 'ez', title: 'Outer east gate (shut)', he: 'שַׁעַר הַקָּדִים',
    dims: ['50 × 25 cubits (26.3 × 13.1 m)', '3 guard rooms each side, 6 × 6 cubits, 5 cubits apart', 'Thresholds 6 cubits deep; vestibule 8; jambs 2', 'Entrance 10 cubits wide; passage 13', '7 steps up'],
    refs: 'Ezek 40:6–16; 43:1–5; 44:1–3',
    note: 'The glory of the LORD enters by this gate (43:4), after which it is shut for good. Only the prince may sit in its vestibule to eat bread (44:3). The height ("jambs of sixty cubits", 40:14) is obscure; the model uses 20 cubits.'
  },
  'ez-gate-outer': {
    mode: 'ez', title: 'Outer gate', he: 'שַׁעַר הֶחָצֵר הַחִיצוֹנָה',
    dims: ['50 × 25 cubits, same plan as the east gate', '3 guard rooms each side, 6 × 6 cubits', '7 steps up', 'Narrow windows; palm trees on the jambs'],
    refs: 'Ezek 40:20–27',
    note: 'No west gate is described. Each gate is 100 cubits from the inner gate opposite it.'
  },
  'ez-gate-inner': {
    mode: 'ez', title: 'Inner gate', he: 'שַׁעַר הֶחָצֵר הַפְּנִימִית',
    dims: ['50 × 25 cubits', '8 steps up', 'Vestibule faces the outer court'],
    refs: 'Ezek 40:28–37',
    note: 'Same plan as the outer gates but turned around, so the vestibule opens outward. The east inner gate opens on Sabbaths and new moons only (46:1).'
  },
  'ez-tables': {
    mode: 'ez', title: 'Tables for slaughter', he: 'שֻׁלְחָנוֹת',
    dims: ['8 tables: 4 inside the vestibule, 4 outside', '4 tables of hewn stone: 1½ × 1½ cubits, 1 cubit high', 'Hooks a handbreadth long'],
    refs: 'Ezek 40:38–43', note: 'Placed at the north inner gate, where burnt offerings were prepared.'
  },
  'ez-outer-court': {
    mode: 'ez', title: 'Outer court', he: 'הֶחָצֵר הַחִיצוֹנָה',
    dims: ['100 cubits (52.5 m) from each outer gate to the inner gate opposite', 'Pavement strip 50 cubits wide along the walls'],
    refs: 'Ezek 40:17–19, 23, 27', note: 'The people worship here. Floor finish is not described.'
  },
  'ez-pavement': {
    mode: 'ez', title: 'Lower pavement', he: 'רִצְפָה',
    dims: ['Width = length of the gates = 50 cubits'], refs: 'Ezek 40:17–18', note: ''
  },
  'ez-chambers30': {
    mode: 'ez', title: 'Thirty chambers on the pavement', he: 'לְשָׁכוֹת',
    dims: ['30 chambers (10 per side on N, E, S)', 'Size not given; modelled 30 × 20 cubits'],
    refs: 'Ezek 40:17', note: 'Their arrangement is not stated. The model puts five each side of every outer gate.'
  },
  'ez-kitchen': {
    mode: 'ez', title: 'Kitchen court (corner)', he: 'מְבַשְּׁלוֹת',
    dims: ['4 enclosed courts, one in each corner', '40 × 30 cubits (21 × 15.8 m) each', 'Hearths in rows around the walls'],
    refs: 'Ezek 46:21–24', note: 'Where the temple servants boiled the people\'s sacrifices.'
  },
  'ez-inner-court': {
    mode: 'ez', title: 'Inner court', he: 'הֶחָצֵר הַפְּנִימִית',
    dims: ['100 × 100 cubits square (52.5 m)', 'Raised 8 steps above the outer court'],
    refs: 'Ezek 40:47', note: 'The altar stands in front of the house, at the centre of the square.'
  },
  'ez-altar': {
    mode: 'ez', title: 'Altar of burnt offering', he: 'מִזְבֵּחַ · הַרְאֵל',
    dims: ['Base 18 × 18 cubits, 1 high, with a gutter 1 cubit and a rim of a span', 'Lower ledge 16 × 16, 2 high', 'Upper ledge 14 × 14, 4 high, rim ½ cubit', 'Hearth (har\'el) 12 × 12, 4 high, with 4 horns', 'Steps face east', 'Total ≈ 11 cubits (5.8 m) plus horns'],
    refs: 'Ezek 43:13–17',
    note: 'A stepped tower in three stages, like a ziggurat. Solomon\'s bronze altar was 20 × 20 × 10 cubits (2 Chr 4:1).'
  },
  'ez-singers': {
    mode: 'ez', title: 'Chambers for the priests on duty', he: 'לִשְׁכוֹת שָׁרִים',
    dims: ['One by the north gate facing south (keepers of the house)', 'One by the south gate facing north (keepers of the altar, sons of Zadok)', 'Size not given'],
    refs: 'Ezek 40:44–46', note: ''
  },
  'ez-platform': {
    mode: 'ez', title: 'Platform of the house', he: 'יְסֻדוֹת',
    dims: ['Height a full reed: 6 great cubits (3.15 m)', '10 steps up (LXX)', 'Open "place left" 5 cubits wide around the side chambers'],
    refs: 'Ezek 40:49; 41:8–11', note: ''
  },
  'ez-yard': {
    mode: 'ez', title: 'Open space beside the house', he: '',
    dims: ['20 cubits (10.5 m) wide, north and south of the house'],
    refs: 'Ezek 41:10; 42:3', note: ''
  },
  'ez-porch': {
    mode: 'ez', title: 'Porch', he: 'אוּלָם',
    dims: ['20 × 12 cubits (LXX; Hebrew text 11)', 'Jambs 5 cubits thick', 'Opening 14 cubits, 3-cubit returns each side', 'Two pillars by the jambs'],
    refs: 'Ezek 40:48–49; 41:25–26',
    note: 'A wooden canopy ("thick planks") covers the front. Solomon\'s porch was 20 × 10.'
  },
  'ez-pillars': {
    mode: 'ez', title: 'Pillars by the jambs', he: 'עַמֻּדִים',
    dims: ['One on each side', 'Size not given'], refs: 'Ezek 40:49',
    note: 'Ezekiel gives no names, sizes or bronze work, unlike Jachin and Boaz.'
  },
  'ez-nave': {
    mode: 'ez', title: 'Nave (Holy Place)', he: 'הֵיכָל',
    dims: ['40 × 20 cubits (21 × 10.5 m)', 'Entrance jambs 6 cubits thick', 'Door 10 cubits wide, side walls 5 each', 'Height not given (model: 30)'],
    refs: 'Ezek 41:1–2, 15–21, 23–26',
    note: 'Panelled in wood from floor to windows and carved with cherubim and palm trees in turn. Each cherub has two faces, a man\'s and a young lion\'s (41:18–19). Two double doors, each with two folding leaves.'
  },
  'ez-table': {
    mode: 'ez', title: 'Altar of wood: "the table before the LORD"', he: 'הַשֻּׁלְחָן',
    dims: ['3 cubits high', '2 cubits long (LXX: 2 wide)'], refs: 'Ezek 41:22',
    note: 'The only piece of furniture Ezekiel describes inside. No lampstand, ark, veil or incense altar is mentioned.'
  },
  'ez-hoh': {
    mode: 'ez', title: 'Most Holy Place', he: 'קֹדֶשׁ הַקֳּדָשִׁים',
    dims: ['20 × 20 cubits (10.5 m square)', 'Entrance jambs 2 cubits', 'Door 6 cubits, side walls 7 each'],
    refs: 'Ezek 41:3–4; 43:4–7',
    note: 'The guide alone goes in. The room is empty: no ark, no cherubim statues. The glory of the LORD fills the house (43:5).'
  },
  'ez-side': {
    mode: 'ez', title: 'Side chambers', he: 'צְלָעוֹת',
    dims: ['4 cubits wide', '3 storeys, 30 chambers per storey', 'House wall 6 cubits; outer wall 5', 'Wider on each storey going up'],
    refs: 'Ezek 41:5–9, 11', note: 'Doors open north and south onto the "place left".'
  },
  'ez-house': {
    mode: 'ez', title: 'The house (overall)', he: 'הַבַּיִת',
    dims: ['100 cubits long (52.5 m)', '50 cubits wide incl. side chambers; 100 with the open spaces', 'Front wall 5 + porch 12 + wall 6 + nave 40 + wall 2 + inner room 20 + wall 6 + chamber 4 + wall 5 = 100'],
    refs: 'Ezek 41:13–14', note: 'The text gives no height for the house. The model uses Solomon\'s 30 cubits.'
  },
  'ez-gizrah': {
    mode: 'ez', title: 'The separate place', he: 'גִּזְרָה',
    dims: ['20 cubits deep, between the house and the western building'],
    refs: 'Ezek 41:12–15; 42:1', note: 'A restricted yard behind the house.'
  },
  'ez-binyan': {
    mode: 'ez', title: 'Western building', he: 'בִּנְיָן',
    dims: ['Interior 70 × 90 cubits', 'Walls 5 cubits thick', 'Overall 80 × 100 cubits (42 × 52.5 m)'],
    refs: 'Ezek 41:12', note: 'Its purpose is not stated. Its height is not given (model: 20 cubits).'
  },
  'ez-priest-ch': {
    mode: 'ez', title: 'Priests\' chambers', he: 'לְשָׁכוֹת הַקֹּדֶשׁ',
    dims: ['Block 100 × 50 cubits, north and south of the house', 'Inner row 100 long; outer row 50 long', 'Walkway 10 cubits wide between', '3 storeys, stepped back as they rise (galleries)'],
    refs: 'Ezek 42:1–14',
    note: 'The priests eat the most holy offerings here and leave their holy garments before going out to the people (42:13–14).'
  },
  'ez-priest-kitchen': {
    mode: 'ez', title: 'Priests\' kitchen', he: '',
    dims: ['At the west end of the priests\' chambers', 'Size not given'],
    refs: 'Ezek 46:19–20', note: 'Holy offerings are boiled and baked here so they are not carried into the outer court.'
  },
  'ez-river': {
    mode: 'ez', title: 'River from the temple', he: 'נַחַל',
    dims: ['Rises under the threshold, south of the altar, flowing east', 'At 1,000 cubits (525 m): ankle-deep', 'At 2,000: knee-deep', 'At 3,000: waist-deep', 'At 4,000 (2.1 km): a river to swim in'],
    refs: 'Ezek 47:1–12',
    note: 'It flows down to the Arabah and heals the Dead Sea. Fruit trees line both banks and bear every month.'
  },
  'ez-reeds': {
    mode: 'ez', title: '"500 reeds" reading', he: 'חֲמֵשׁ מֵאוֹת קָנִים',
    dims: ['500 reeds = 3,000 cubits = 1,575 m a side'], refs: 'Ezek 42:16–20 (Hebrew text)',
    note: 'Read literally, the wall would cross the Kidron and enclose most of the city. Most commentators follow the Greek "500 cubits".'
  },
  'ez-city': {
    mode: 'ez', title: 'The city "The LORD is there"', he: 'יְהוָה שָׁמָּה',
    dims: ['4,500 cubits square (2.36 km)', '12 gates, 3 per side, named for the tribes', 'Circumference 18,000 cubits', 'Open land 250 cubits each side'],
    refs: 'Ezek 48:15–20, 30–35',
    note: 'Ezekiel puts the city in its own strip south of the priests\' land, not around the temple. If the units are cubits, its centre is about 3.9 km south of the sanctuary (shown to scale). If reeds, about 24 km.'
  },

  // Solomon --------------------------------------------------------------
  'so-house': {
    mode: 'so', title: 'Solomon\'s house of the LORD', he: 'בֵּית יְהוָה',
    dims: ['60 × 20 cubits inside, 30 high (31.5 × 10.5 × 15.8 m)', 'Built in 7 years (1 Kgs 6:37–38)', 'Stone dressed at the quarry'],
    refs: '1 Kgs 6:1–10; 2 Chr 3:3',
    note: 'Wall thicknesses are not given; the model uses 6 cubits, as in Ezekiel.'
  },
  'so-porch': {
    mode: 'so', title: 'Porch', he: 'אוּלָם',
    dims: ['20 × 10 cubits', 'Height: 120 cubits in 2 Chr 3:4 (probably a copying error); model uses the house height'],
    refs: '1 Kgs 6:3; 2 Chr 3:4', note: ''
  },
  'so-nave': {
    mode: 'so', title: 'Nave (Holy Place)', he: 'הֵיכָל',
    dims: ['40 × 20 cubits, 30 high', 'Cedar walls, cypress floor, all overlaid with gold', 'Carved gourds, open flowers, cherubim, palm trees', 'Cypress doors, two folding leaves each'],
    refs: '1 Kgs 6:15–18, 22, 29–35', note: ''
  },
  'so-lamps': {
    mode: 'so', title: 'Ten golden lampstands', he: 'מְנֹרוֹת',
    dims: ['5 on the south, 5 on the north, before the inner room'],
    refs: '1 Kgs 7:49; 2 Chr 4:7', note: 'Their form is not described; the model follows the tabernacle lampstand.'
  },
  'so-table': {
    mode: 'so', title: 'Table for the bread of the Presence', he: 'שֻׁלְחַן הַפָּנִים',
    dims: ['Gold; size per tabernacle table: 2 × 1 cubits, 1½ high'],
    refs: '1 Kgs 7:48; Exod 25:23', note: '2 Chr 4:8 says ten tables, five each side.'
  },
  'so-incense': {
    mode: 'so', title: 'Golden altar of incense', he: 'מִזְבַּח הַזָּהָב',
    dims: ['Cedar overlaid with gold, "by the inner room"', 'Tabernacle size: 1 × 1 cubit, 2 high'],
    refs: '1 Kgs 6:20–22; 7:48; Exod 30:1–3', note: ''
  },
  'so-hoh': {
    mode: 'so', title: 'Most Holy Place (inner room)', he: 'דְּבִיר',
    dims: ['20 × 20 × 20 cubits: a perfect cube', 'Overlaid with pure gold', 'Olive-wood doors with five-sided frames; a veil'],
    refs: '1 Kgs 6:16, 19–21, 31–32; 2 Chr 3:8–9, 14',
    note: 'The cube is 10 cubits lower than the nave, which leaves an upper room above it (2 Chr 3:9).'
  },
  'so-cherubim': {
    mode: 'so', title: 'Two cherubim', he: 'כְּרֻבִים',
    dims: ['Olive wood overlaid with gold', '10 cubits high', 'Each wing 5 cubits; 10 from tip to tip', 'Together the four wings span the room, 20 cubits'],
    refs: '1 Kgs 6:23–28; 2 Chr 3:10–13', note: ''
  },
  'so-ark': {
    mode: 'so', title: 'Ark of the covenant', he: 'אֲרוֹן הַבְּרִית',
    dims: ['2½ × 1½ × 1½ cubits (tabernacle measure)', 'Poles long enough to be seen from the Holy Place'],
    refs: '1 Kgs 8:6–9; Exod 25:10–22', note: 'Not in Ezekiel\'s temple.'
  },
  'so-side': {
    mode: 'so', title: 'Side chambers', he: 'יָצִיעַ · צְלָעוֹת',
    dims: ['3 storeys, each 5 cubits high', 'Bottom 5 cubits wide, middle 6, top 7', 'House wall steps in at each floor so no beams are set into it', 'Entrance on the south side; winding stair'],
    refs: '1 Kgs 6:5–10', note: 'Ezekiel\'s are 4 cubits wide and also widen upward (41:7).'
  },
  'so-pillars': {
    mode: 'so', title: 'Jachin and Boaz', he: 'יָכִין · בֹּעַז',
    dims: ['Cast bronze, 18 cubits high (9.5 m)', '12 cubits round (Ø ≈ 3.8 cubits, 2 m); hollow, 4 fingers thick', 'Capitals 5 cubits (2 Kgs 25:17: 3) with lily-work, network, chains', 'Two rows of pomegranates, 200 in all'],
    refs: '1 Kgs 7:15–22; Jer 52:21–23; 2 Chr 3:15–17',
    note: 'Jachin stood on the right (south), Boaz on the left (north).'
  },
  'so-sea': {
    mode: 'so', title: 'The bronze Sea', he: 'הַיָּם מוּצָק',
    dims: ['10 cubits across, brim to brim (5.25 m)', '5 cubits high; 30 cubits round', 'A handbreadth thick, lily-shaped brim', 'On 12 oxen, 3 facing each direction', 'Held 2,000 baths (2 Chr 4:5: 3,000)'],
    refs: '1 Kgs 7:23–26, 39; 2 Chr 4:2–6',
    note: 'Set at the south-east of the house. The priests washed in it.'
  },
  'so-lavers': {
    mode: 'so', title: 'Ten bronze stands with basins', he: 'מְכֹנוֹת · כִּיֹּרוֹת',
    dims: ['Each stand 4 × 4 cubits, 3 high', '4 wheels 1½ cubits high', 'Each basin 4 cubits, holding 40 baths', '5 on the south side, 5 on the north'],
    refs: '1 Kgs 7:27–39; 2 Chr 4:6', note: 'For washing the parts of the burnt offerings.'
  },
  'so-altar': {
    mode: 'so', title: 'Bronze altar', he: 'מִזְבַּח הַנְּחֹשֶׁת',
    dims: ['20 × 20 cubits, 10 high (10.5 × 10.5 × 5.25 m)'],
    refs: '2 Chr 4:1; 1 Kgs 8:64',
    note: 'How it was climbed is not stated. The model uses a ramp on the south (Exod 20:26 forbids steps).'
  },
  'so-inner-court': {
    mode: 'so', title: 'Inner court (court of the priests)', he: 'הֶחָצֵר הַפְּנִימִית',
    dims: ['Wall: 3 courses of dressed stone and 1 course of cedar beams', 'Size not given; modelled 200 × 100 cubits (twice the tabernacle court)'],
    refs: '1 Kgs 6:36; 2 Chr 4:9; Jer 36:10 ("upper court")', note: ''
  },
  'so-great-court': {
    mode: 'so', title: 'Great court', he: 'הֶחָצֵר הַגְּדוֹלָה',
    dims: ['Same construction as the inner court wall', 'Encloses temple and palace; size not given'],
    refs: '1 Kgs 7:9–12',
    note: 'The model uses the 500-cubit Temple Mount square (Mishnah, Middot 2:1). That square is probably later than Solomon.'
  },
  'so-forest': {
    mode: 'so', title: 'House of the Forest of Lebanon', he: 'בֵּית יַעַר הַלְּבָנוֹן',
    dims: ['100 × 50 cubits, 30 high (52.5 × 26 × 15.8 m)', '45 cedar pillars, 15 in a row', 'Windows in three rows'],
    refs: '1 Kgs 7:2–5; 10:17', note: 'Later used to store the golden shields.'
  },
  'so-hall': {
    mode: 'so', title: 'Hall of Pillars', he: 'אוּלָם הָעַמּוּדִים',
    dims: ['50 × 30 cubits', 'With its own porch and canopy'], refs: '1 Kgs 7:6', note: ''
  },
  'so-throne': {
    mode: 'so', title: 'Hall of the Throne (Hall of Judgment)', he: 'אוּלָם הַכִּסֵּא',
    dims: ['Cedar from floor to ceiling', 'Size not given'], refs: '1 Kgs 7:7; 10:18–20', note: ''
  },
  'so-palace': {
    mode: 'so', title: 'Solomon\'s house and the house of Pharaoh\'s daughter', he: 'בֵּית הַמֶּלֶךְ',
    dims: ['"Another court" inside the hall', 'Foundations of stones 8 and 10 cubits long', 'Size not given'],
    refs: '1 Kgs 7:8–12; 9:24',
    note: 'Ezekiel condemns exactly this closeness: "their threshold by my threshold … with only a wall between me and them" (Ezek 43:8).'
  },
  'so-podium': {
    mode: 'both', title: 'Temple Mount platform', he: 'הַר הַבַּיִת',
    dims: ['520 × 520 cubits in the model: the 500-cubit precinct plus an apron for the gate steps', 'Mishnah: the Temple Mount was 500 × 500 cubits'],
    refs: 'Ezek 45:2; Mishnah Middot 2:1', note: 'The retaining walls are a reconstruction.'
  },
};

// --- Comparison table --------------------------------------------------------
export const COMPARE = [
  ['Source', 'Ezek 40–48: a vision dated 573 BC, 14 years after the fall of the city (40:1)', '1 Kgs 6–7; 2 Chr 3–4. Built c. 966–959 BC, burned 586 BC'],
  ['Cubit', 'Long cubit: cubit + handbreadth = 52.5 cm (40:5; 43:13)', '"Cubits of the first measure" (2 Chr 3:3); same long cubit assumed'],
  ['Precinct', 'Walled square 500 × 500 cubits, plus 50 cubits open land (42:15–20; 45:2)', 'No overall size given; a "great court" encloses temple and palace (7:12)'],
  ['Courts', 'Outer and inner court on rising terraces: 7 steps, then 8', 'Inner court of 3 stone courses + cedar beam (6:36); sizes not given'],
  ['Gates', 'Six identical gate-buildings 50 × 25 with 3 guard rooms a side; no west gate; east gate shut (44:1–2)', 'Not described'],
  ['House, overall', '100 × 50 cubits incl. walls and side chambers (41:13–14)', 'Not given; about 72 × 48 cubits in the model'],
  ['Porch', '20 × 12 cubits (LXX; Hebrew 11) (40:48–49)', '20 × 10 cubits (6:3); "120 high" in 2 Chr 3:4'],
  ['Nave', '40 × 20 cubits (41:2)', '40 × 20 cubits (6:17)'],
  ['Most Holy Place', '20 × 20 cubits. Empty (41:4)', '20 × 20 × 20 cube with ark and two 10-cubit cherubim (6:20–28)'],
  ['Height', 'Not stated', '30 cubits (6:2)'],
  ['Walls', '6 cubits (41:5)', 'Not stated'],
  ['Side chambers', '4 cubits wide, 3 storeys, 30 per storey (41:5–6)', '5, 6 and 7 cubits wide by storey, each 5 high (6:5–10)'],
  ['Platform', '6 cubits high, 10 steps (41:8; 40:49 LXX)', 'Not stated'],
  ['Pillars', '"Pillars by the jambs", no detail (40:49)', 'Jachin and Boaz: bronze, 18 cubits + 5-cubit capitals (7:15–22)'],
  ['Altar', 'Stepped, 18 → 12 cubits square, ≈ 11 high, steps on the east (43:13–17)', 'Bronze, 20 × 20 × 10 cubits (2 Chr 4:1)'],
  ['Water', 'A river flows from under the threshold to the Dead Sea (47:1–12)', 'The bronze Sea on 12 oxen and 10 basins on wheeled stands (7:23–39)'],
  ['Furniture', 'One wooden altar-table, 3 high, 2 long (41:22)', 'Golden incense altar, table, 10 lampstands (7:48–49)'],
  ['Decoration', 'Wood panelling; two-faced cherubim (man and lion) alternating with palms (41:17–20)', 'Cedar carved with cherubim, palms, flowers, all overlaid with gold (6:29–35)'],
  ['Royal palace', 'Kept away: "their threshold by my threshold" defiled the house (43:7–9)', 'Palace complex directly south, inside the same great court (7:1–12)'],
  ['Priests', 'Chambers 100 × 50 north and south; kitchens (42:1–14; 46:19–24)', 'Not described'],
  ['City', 'A separate city 4,500 cubits square, south of the holy land (48:15–35)', 'The temple sits on the north edge of the City of David'],
];

// --- Jerusalem landmarks (late Iron Age II, before 586 BC) -------------------
export const LANDMARKS = [
  { name: 'Mount of Olives', x: 820, z: -40, lift: 30 },
  { name: 'Kidron Valley', x: 255, z: -260, lift: 12 },
  { name: 'City of David', x: 25, z: 560, lift: 26 },
  { name: 'Ophel', x: 30, z: 360, lift: 22, hideIn: 'so' },
  { name: 'Tyropoeon Valley', x: -190, z: 520, lift: 14 },
  { name: 'Western Hill (Mishneh)', x: -500, z: 470, lift: 26 },
  { name: 'Hinnom Valley', x: -560, z: 1010, lift: 14 },
  { name: 'Gihon Spring', x: 112, z: 500, lift: 6 },
  { name: 'Pool of Siloam', x: -100, z: 925, lift: 6 },
  { name: 'En-rogel', x: -40, z: 1325, lift: 6 },
  { name: 'Broad Wall', x: -370, z: 205, lift: 12 },
];

// Late Iron Age II city wall (approximate), from the Temple Mount round the
// Western Hill and the City of David back to the Temple Mount.
export const CITY_WALL = [
  [-92, 60], [-250, 120], [-380, 200], [-560, 185], [-735, 170], [-770, 400],
  [-730, 700], [-610, 900], [-420, 1010], [-230, 1070], [-125, 1005], [-40, 985],
  [20, 955], [70, 820], [95, 650], [100, 480], [115, 330], [140, 220], [175, 158],
];

// Ezekiel 48:31–34 — the city gates.
export const CITY_GATES = {
  north: ['Reuben', 'Judah', 'Levi'],
  east: ['Joseph', 'Benjamin', 'Dan'],
  south: ['Simeon', 'Issachar', 'Zebulun'],
  west: ['Gad', 'Asher', 'Naphtali'],
};
