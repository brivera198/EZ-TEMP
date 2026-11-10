// The stops of the guided tour, in the order of the text (Ezek 40–48).
// Each stop: where to stand, what to read, which measurements to draw
// (precinct cubits: u east, y up, v south) and how Solomon's temple compares.
// The wording paraphrases the text; verse numbers point to the source.

export function buildStops({ E, S, V, O, I, H, EYE }) {
  const BUILT = { period: 'ruin', vision: 'solid' };   // the vision standing on the ruined mount
  const OVER = { period: 'ruin', vision: 'glow' };     // the vision as light over the ruins
  const stops = [];

  stops.push({
    ref: '40:1–4', title: 'In visions of God', scene: OVER, hours: 7.3, dwell: 18,
    pos: E(150, 235, -560), target: E(0, 0, 20),
    text: 'Fourteen years after Jerusalem fell, the exile Ezekiel is set down on a very high mountain. To the south he sees something built like a city. A man who gleams like bronze waits in the gateway with a linen cord and a measuring reed, and tells him to look, listen and report everything to Israel.',
    facts: [
      ['Date', 'tenth day of the first month, 25th year of exile: spring 573 BC'],
      ['Guide', 'a man like bronze, with a linen cord and a reed'],
      ['Here', 'the vision is drawn as light over the mount as it lay in 573 BC'],
    ],
    solomon: 'His house stood on this hill for nearly four centuries. At the time of the vision it has been a burnt ruin for fourteen years, and Ezekiel is some 900 km to the east, by the Chebar canal in Babylonia.',
  });

  stops.push({
    ref: '40:5', title: 'The wall and the reed', scene: BUILT, hours: 8.2,
    pos: E(221, 18, -28), target: E(247, 7.5, -19),
    text: 'The measuring starts at the outside. A wall runs all around the temple area, and the guide lays his reed against it: one reed thick, one reed high. Every figure that follows is counted in this unit, the long cubit of seven handbreadths, six to the reed.',
    facts: [
      ['Reed', '6 long cubits = 3.15 m'],
      ['Long cubit', 'a cubit and a handbreadth, about 52.5 cm'],
      ['Wall', '1 reed thick, 1 reed high'],
    ],
    solomon: 'Kings gives the wall of his inner court by its build, three courses of hewn stone and one of cedar beams (1 Kgs 6:36), and no thickness or height.',
    dims: [
      { a: [244, O + 6.1, -19], b: [250, O + 6.1, -19], name: 'thickness', text: '<b>1</b> reed<span>6 cubits · 3.15 m</span>', off: [0, -16] },
      { a: [244, O, -16.5], b: [244, O + 6, -16.5], name: 'height', off: [-64, 0] },
    ],
  });

  stops.push({
    ref: '40:6–16; 44:1–3', title: 'The gate that faces east', scene: BUILT, hours: 8.6, labels: ['man'],
    pos: E(330, 55, 60), target: E(232, 8, 0),
    text: 'Seven steps lead up to the gate that faces east. It is a building in its own right, fifty cubits long and twenty-five broad. Later the prophet is brought back here and finds it shut, never to be opened, because the LORD has entered by it. Only the prince may sit inside to eat bread before the LORD.',
    facts: [
      ['Length', '50 cubits'],
      ['Breadth', '25 cubits'],
      ['Steps', '7, up from outside'],
      ['Door', 'shut: "the LORD has entered by it" (44:2)'],
    ],
    solomon: 'Kings describes no gate buildings for his courts. The plan itself was old: gates with three rooms a side guarded Gezer, Hazor and Megiddo in the time of the kings. Here a city gate guards a sanctuary.',
    dims: [
      { a: [250, 24, 13.5], b: [200, 24, 13.5], name: 'length', off: [0, -24] },
      { a: [251, 24, -12.5], b: [251, 24, 12.5], name: 'breadth', off: [56, -26] },
      { at: [254, 1.2, 10], text: '7 steps' },
    ],
  });

  stops.push({
    ref: '40:6–16', title: 'Inside the gate', scene: BUILT, hours: 9, labels: ['man'],
    pos: E(193, O + EYE + 3, 4), target: E(240, O + 3.5, -1.5),
    text: 'The guide measures as he walks. The threshold: one reed. Then three guard rooms on each side, each a reed square with a low barrier in front and five cubits of wall between them; then the vestibule at the inner end. Guard rooms belong to a fortress gate. Here they screen who may come near.',
    facts: [
      ['Thresholds', '1 reed deep, at each end'],
      ['Guard rooms', '3 a side, 6 × 6 cubits, 5 between'],
      ['Barrier', '1 cubit, before each room'],
      ['Gateway', '13 cubits; its opening 10'],
      ['Vestibule', '8 cubits; jambs 2'],
    ],
    solomon: 'The palm trees on the jambs (40:16) repeat his house, where palms, cherubim and open flowers were carved on the walls and doors (1 Kgs 6:29–35).',
    dims: [
      { a: [202, O + 0.15, 5.6], b: [210, O + 0.15, 5.6], name: 'vestibule' },
      { a: [213, O + 0.15, -6.5], b: [213, O + 0.15, 6.5], name: 'gateway' },
      { a: [216, O + 1.25, -6.5], b: [222, O + 1.25, -6.5], name: 'guard room' },
      { a: [222, O + 1.25, 6.5], b: [227, O + 1.25, 6.5], name: 'between' },
      { at: [247, O + 0.4, -3], text: 'threshold, 1 reed' },
    ],
  });

  stops.push({
    ref: '40:17–19', title: 'The outer court', scene: BUILT, hours: 9.6,
    pos: E(120, 60, 170), target: E(165, O, -40),
    text: 'Through the gate lies the outer court, where the people gather. A stone pavement runs along the wall, and thirty chambers open onto it. From the inner face of this gate to the gate opposite is a hundred cubits. The same hundred returns again and again.',
    facts: [
      ['Chambers', '30, on the pavement'],
      ['Pavement', 'beside the gates, as deep as they are long'],
      ['Gate to gate', '100 cubits'],
      ['Kitchens', '40 × 30 in each corner, for the people\'s sacrifices (46:21–24)'],
    ],
    solomon: 'His house had an inner court and a great court (1 Kgs 7:12). Rooms in them are known by their owners, such as Gemariah the scribe\'s (Jer 36:10), with no number and no plan.',
    dims: [
      { a: [200, O + 0.2, 0], b: [100, O + 0.2, 0], name: 'gate to gate' },
      { at: [234, 14, -45], text: '30 chambers on the pavement' },
    ],
  });

  stops.push({
    ref: '40:20–27; 46:9', title: 'North gate, south gate', scene: BUILT, hours: 10.2,
    pos: E(170, 95, -40), target: E(0, O, -175),
    text: 'He leads the prophet north, then south. Each time the report is the same: the same guard rooms, windows and palms, seven steps, fifty cubits by twenty-five. There are three outer gates and none on the west. On feast days whoever enters by the north gate leaves by the south, and the reverse. No one turns back.',
    facts: [
      ['North gate', '50 × 25, 7 steps'],
      ['South gate', 'the same'],
      ['To the inner gates', '100 cubits each'],
      ['West', 'no gate'],
    ],
    solomon: 'Kings gives his courts no gate plan. Later texts name an upper gate built by Jotham (2 Kgs 15:35), an upper Benjamin Gate (Jer 20:2) and a New Gate (Jer 26:10).',
    dims: [
      { a: [0, O + 0.2, -200], b: [0, O + 0.2, -100], name: 'gate to gate', off: [0, 18] },
      { a: [13.5, 24, -250], b: [13.5, 24, -200], name: 'the same length', off: [0, -30] },
    ],
  });

  stops.push({
    ref: '40:28–43', title: 'The inner gates and the tables', scene: BUILT, hours: 10.6,
    pos: E(34, O + EYE + 6, -128), target: E(2, O + 3, -102),
    text: 'Eight more steps climb to the inner court, through gates of the same measure turned the other way round: their vestibules face outward. At the north gate the vision turns practical. There are tables for slaughtering the offerings, four small ones of hewn stone for the knives, and a room where the burnt offering is washed.',
    facts: [
      ['Inner gates', 'south, east and north: 50 × 25, 8 steps'],
      ['Vestibules', 'toward the outer court'],
      ['Tables', '8 for slaughter, 4 of hewn stone'],
      ['Hewn tables', '1½ × 1½ × 1 cubit'],
    ],
    solomon: 'In his court ten bronze basins on wheeled stands were used to rinse the burnt offering (1 Kgs 7:27–39; 2 Chr 4:6). Ezekiel sees no basins, only tables.',
    dims: [
      { a: [19.25, O + 1.15, -110.75], b: [20.75, O + 1.15, -110.75], name: 'hewn stone table', off: [0, -18] },
      { at: [0, O + 6, -104], text: '8 steps' },
    ],
  });

  stops.push({
    ref: '40:47', title: 'The inner court', scene: BUILT, hours: 11.2,
    pos: E(78, 70, 92), target: E(-5, I, 0),
    text: 'He measures the court: a hundred cubits long and a hundred broad, a perfect square. The altar stands in front of the house, at the centre of the whole plan. Only the priests, the sons of Zadok, serve here.',
    facts: [
      ['Court', '100 × 100 cubits, square'],
      ['Altar', 'in front of the house'],
      ['Who', 'the priests, sons of Zadok (40:46)'],
    ],
    solomon: 'His inner court is known only by its wall (1 Kgs 6:36). No size is given. Ezekiel\'s is a square with the altar at its centre.',
    dims: [
      { a: [-50, I + 0.3, -44], b: [50, I + 0.3, -44], name: 'length' },
      { a: [44, I + 0.3, -50], b: [44, I + 0.3, 50], name: 'breadth' },
    ],
  });

  stops.push({
    ref: '40:48–49', title: 'The porch', scene: BUILT, hours: 11.6,
    pos: E(-8, I + EYE + 5, 24), target: E(-58, H + 9, 0),
    text: 'Steps rise to the porch of the house. It is twenty cubits broad, and two pillars stand by its jambs, one on each side. The house stands higher than everything around it: seven steps, then eight, then these.',
    facts: [
      ['Breadth', '20 cubits'],
      ['Depth', '12 cubits (Greek text; the Hebrew reads 11)'],
      ['Steps', '10 (Greek text)'],
      ['Pillars', 'one by each jamb'],
    ],
    solomon: 'His porch was 20 cubits by 10 (1 Kgs 6:3). Its two bronze pillars had names, Jachin and Boaz, and stood 18 cubits high (1 Kgs 7:15–22). Ezekiel gives his pillars no name and no height.',
    dims: [
      { a: [-55, H + 0.3, -10], b: [-55, H + 0.3, 10], name: 'breadth', along: 0.75 },
      { a: [-67, H + 0.3, -9.5], b: [-55, H + 0.3, -9.5], name: 'depth', off: [92, 24] },
      { at: [-42, I + 3.5, 9], text: '10 steps' },
      { at: [-48.5, H + 19, -11.5], text: 'pillars by the jambs' },
    ],
  });

  stops.push({
    ref: '41:1–2', title: 'The nave', scene: BUILT, hours: 12,
    pos: E(-71.5, H + EYE + 0.5, 2.5), target: E(-120, H + 6, -1),
    text: 'Inside, the great hall: forty cubits long and twenty broad. Its walls are panelled with wood and carved with cherubim and palm trees, each cherub with two faces, a man\'s and a young lion\'s. In front of the inner room stands something like an altar of wood. The guide says: "This is the table that is before the LORD."',
    facts: [
      ['Length', '40 cubits'],
      ['Breadth', '20 cubits'],
      ['Entrance', '10 cubits; jambs 6'],
      ['Table', 'wood, 3 cubits high, 2 long (41:22)'],
    ],
    solomon: 'The same 40 by 20 (1 Kgs 6:17). His was 30 cubits high. Ezekiel gives no height at all, so the model borrows Solomon\'s. His nave held ten lampstands, the incense altar and the table of the bread. Ezekiel names one wooden table.',
    dims: [
      { a: [-73, H + 0.3, 9], b: [-113, H + 0.3, 9], name: 'length' },
      { a: [-100, H + 0.3, -10], b: [-100, H + 0.3, 10], name: 'breadth' },
      { a: [-109, H, 1.3], b: [-109, H + 3, 1.3], name: 'table', off: [46, 0] },
    ],
  });

  stops.push({
    ref: '41:3–4', title: 'The Most Holy Place', scene: BUILT, hours: 12,
    pos: E(-99, H + EYE + 2.2, 1), target: E(-126, H + 4.6, 0),
    text: 'Here the guide goes in alone. Ezekiel is a priest, but he stays in the nave and hears the figures called out: the entrance six cubits, the room twenty by twenty. Then the guide says, "This is the Most Holy Place." Each doorway has been narrower than the last: ten, then six.',
    facts: [
      ['Room', '20 × 20 cubits'],
      ['Entrance', '6 cubits; jambs 2'],
      ['Furniture', 'none is mentioned'],
    ],
    solomon: 'The same 20 by 20 (1 Kgs 6:20). In his stood the ark, under two olive-wood cherubim ten cubits tall (1 Kgs 6:23–28). Ezekiel mentions no ark and no cherubim statues; compare Jer 3:16, where the ark is no longer remembered.',
    dims: [
      { a: [-113, H + 0.3, -3], b: [-113, H + 0.3, 3], name: 'entrance' },
      { a: [-135, H + 0.3, -10], b: [-135, H + 0.3, 10], name: 'breadth' },
      { a: [-115, H + 0.3, -9.6], b: [-135, H + 0.3, -9.6], name: 'length' },
    ],
  });

  stops.push({
    ref: '41:5–11', title: 'The side chambers', scene: BUILT, hours: 12.6,
    pos: E(-44, H + 34, -52), target: E(-86, H + 12, -20),
    text: 'Now the outside of the house. Its wall is six cubits thick. Against it stand side chambers in three storeys, thirty to a storey, growing wider as they rise. They rest on ledges and are not let into the wall of the house. An outer wall five cubits thick closes them in.',
    facts: [
      ['Wall of the house', '6 cubits'],
      ['Side chambers', '4 cubits; 3 storeys × 30'],
      ['Outer wall', '5 cubits'],
      ['Platform', 'a full reed high; free space 5 cubits'],
    ],
    solomon: 'His house had the same three storeys of side rooms, 5, 6 and 7 cubits wide, resting on offsets so that no beam entered the wall (1 Kgs 6:5–6).',
    dims: [
      { a: [-80, H + 19, -25], b: [-80, H + 19, -20], name: 'outer wall', off: [72, 30] },
      { a: [-80, H + 19, -20], b: [-80, H + 19, -16], name: 'chamber', off: [0, -40] },
      { a: [-80, H + 19, -16], b: [-80, H + 19, -10], name: 'wall of the house', off: [-66, 32] },
    ],
  });

  stops.push({
    ref: '41:12', title: 'The building to the west', scene: BUILT, hours: 13.2,
    pos: E(-205, 95, 105), target: E(-208, O + 8, 0),
    text: 'Behind the house, across a separate yard, stands a large building: seventy cubits by ninety inside walls five thick. The text gives its measure and nothing else. No door is described and no purpose is given.',
    facts: [
      ['Inside', '70 × 90 cubits'],
      ['Walls', '5 cubits, so 80 × 100 outside'],
      ['Purpose', 'not stated'],
    ],
    solomon: 'Nothing in Kings corresponds. Some compare the "parbar" on the west (1 Chr 26:18; cf. 2 Kgs 23:11), but the link is uncertain.',
    dims: [
      { a: [-245, O + 20.3, 45], b: [-175, O + 20.3, 45], name: 'breadth' },
      { a: [-175, O + 20.3, -45], b: [-175, O + 20.3, 45], name: 'length' },
    ],
  });

  stops.push({
    ref: '41:13–15', title: 'A hundred cubits', scene: BUILT, hours: 13.6,
    pos: E(-92, 410, 125), target: E(-100, 0, 0),
    text: 'Then he adds it up. The house: a hundred cubits long. The yard and the building behind it: a hundred. The east front of the house with its yard: a hundred. With the inner court, three squares of a hundred cubits lie in a row from east to west.',
    facts: [
      ['House', '100 cubits long'],
      ['Yard and building', '100 cubits'],
      ['East front', '100 cubits'],
      ['Inner court', '100 × 100 (40:47)'],
    ],
    solomon: 'His house was 60 cubits by 20 inside (1 Kgs 6:2). Ezekiel keeps the rooms and thickens what surrounds them, so that the outside comes to a round hundred by fifty.',
    dims: [
      { a: [-150, H + 31, 0], b: [-50, H + 31, 0], name: 'the house' },
      { a: [-250, H + 31, 0], b: [-150, H + 31, 0], name: 'yard and building' },
      { a: [-50, H + 31, 0], b: [50, H + 31, 0], name: 'inner court' },
      { a: [-50, I + 0.5, -50], b: [-50, I + 0.5, 50], name: 'east front', along: 0.85 },
      { a: [-252, O + 20, -50], b: [-252, O + 20, 50], name: 'behind', along: 0.85 },
    ],
  });

  stops.push({
    ref: '42:1–14', title: 'The priests\' chambers', scene: BUILT, hours: 14,
    pos: E(-20, 70, -150), target: E(-105, O + 6, -75),
    text: 'North and south of the house stand two blocks of chambers in three storeys, the upper ones set back. Here the priests who come near to the LORD eat the most holy offerings, and here they leave the vestments they served in before going out to the people.',
    facts: [
      ['Length', '100 cubits, facing the house'],
      ['Breadth', '50 cubits'],
      ['Walkway', '10 cubits wide, in front'],
      ['Outer row', '50 cubits long'],
    ],
    solomon: 'Chambers stood in his courts too: those of the sons of Hanan (Jer 35:4) and of Nathan-melech (2 Kgs 23:11). No text gives them a plan or a rule.',
    dims: [
      { a: [-150, O + 18.6, -70], b: [-50, O + 18.6, -70], name: 'length' },
      { a: [-50, O + 0.3, -100], b: [-50, O + 0.3, -50], name: 'breadth' },
      { a: [-150, O + 0.3, -100], b: [-100, O + 0.3, -100], name: 'outer row', along: 0.2 },
      { a: [-120, O + 0.3, -80], b: [-120, O + 0.3, -70], name: 'walkway', off: [-6, 52] },
    ],
  });

  stops.push({
    ref: '42:15–20', title: 'The whole', scene: OVER, hours: 14.6,
    pos: E(40, 720, 420), target: E(0, 0, 10),
    text: 'When the inside is finished he leads the prophet out by the east gate and measures all four sides: five hundred each. A wall goes all around it, "to make a separation between the holy and the common." The text says outright that this is the purpose of the plan.',
    facts: [
      ['Each side', '500 cubits = 262.5 m'],
      ['Shape', 'square'],
      ['The other reading', 'the Hebrew of 42:16 has "reeds", about 1.6 km a side; the Greek has cubits'],
      ['This model', 'cubits (cf. 45:2); the "500 reeds" layer shows the other'],
    ],
    solomon: 'Kings gives no size for his courts. The platform seen in Jerusalem today is Herod\'s, about 300 by 480 metres and not square.',
    dims: [
      { a: [-250, 10, 250], b: [250, 10, 250], name: 'south side' },
      { a: [250, 10, -250], b: [250, 10, 250], name: 'east side' },
    ],
  });

  stops.push({
    ref: '43:1–5', title: 'The glory returns', scene: BUILT, hours: 5.95, rise: 0.6, dwell: 40, glory: 'arrive',
    pos: E(120, 90, 300), target: E(275, 16, 0),
    text: 'Then he is brought to the gate that faces east. The glory of the God of Israel comes from the east. Its sound is like the sound of many waters, and the earth shines with it. It enters the house by the east gate, and the Spirit lifts the prophet into the inner court: the glory of the LORD fills the house.',
    facts: [
      ['From', 'the east, over the Mount of Olives'],
      ['By', 'the east gate'],
      ['Left by this way', '19 years earlier (10:18–19; 11:23)'],
      ['Here', 'drawn as light only; the text gives it no shape'],
    ],
    solomon: 'At his dedication a cloud filled the house so that the priests could not stand to minister (1 Kgs 8:10–11). Ezekiel had watched that glory leave by this gate and stop on the mountain east of the city. Now it returns by the same road.',
  });

  stops.push({
    ref: '43:6–9', title: 'Their threshold by my threshold', scene: { period: 'late', vision: 'glow' }, hours: 8.4,
    pos: S(330, 140, 620), target: S(80, 0, 260),
    text: 'A voice speaks from the house and names what was wrong with the old one. The kings set "their threshold by my threshold and their doorposts beside my doorposts, with only a wall between me and them." This is the city of the kings, with the palace against the temple. The vision, in light, has no palace.',
    facts: [
      ['Then', 'palace and temple share one hill and one wall'],
      ['In the vision', 'the house stands alone in its square'],
      ['The prince', 'his land lies outside the holy district (45:7; 48:21)'],
    ],
    solomon: 'He spent seven years on the house of the LORD and thirteen on his own (1 Kgs 6:38–7:1). The palace, the Hall of Pillars and the House of the Forest of Lebanon stood just south of the temple court.',
  });

  stops.push({
    ref: '43:13–17', title: 'The altar', scene: BUILT, hours: 9.2, glory: 'settled',
    pos: E(30, I + EYE + 8, 26), target: E(0, I + 6, 0),
    text: 'Only now, with the house filled, is the altar measured. It rises in stages: a base, a lower ledge, an upper ledge, and the hearth, twelve cubits square with four horns. Its steps face east, so the priest who climbs them faces the house.',
    facts: [
      ['Hearth', '12 × 12 cubits, 4 high, four horns'],
      ['Upper ledge', '14 × 14, 4 high'],
      ['Lower ledge', '2 high'],
      ['Base', '1 cubit high, 1 wide all round'],
    ],
    solomon: 'His bronze altar was 20 cubits square and 10 high (2 Chr 4:1). King Ahaz moved it aside for a copy of one he saw in Damascus (2 Kgs 16:10–15). An old law had forbidden steps to an altar (Exod 20:26); this one has them.',
    dims: [
      { a: [-6, I + 11.2, 6], b: [6, I + 11.2, 6], name: 'hearth', off: [0, -18] },
      { a: [-7, I + 7.1, 7], b: [7, I + 7.1, 7], name: 'ledge' },
      { a: [-9, I + 0.2, 9.4], b: [9, I + 0.2, 9.4], name: 'base, by addition', off: [0, 18] },
      { a: [9.6, I, 9.6], b: [9.6, I + 11, 9.6], name: 'height, without the horns', off: [78, 0] },
      { at: [15, I + 1.5, 0], text: 'steps on the east', off: [44, 30] },
    ],
  });

  stops.push({
    ref: '47:1–12', title: 'The river', scene: BUILT, hours: 10.5, glory: 'settled', layer: 'river', labels: ['river'],
    pos: V(200, 620, -560), target: V(140, 60, 650),
    text: 'Back at the door of the house, water is coming out from under the threshold. It runs south of the altar and out past the east gate. The guide measures a thousand cubits and it is ankle deep; another thousand, knee deep; another, to the waist; another, and it is a river that cannot be crossed. It runs down to the Dead Sea and makes it fresh.',
    facts: [
      ['1,000 cubits', 'ankle deep'],
      ['2,000', 'knee deep'],
      ['3,000', 'waist deep'],
      ['4,000', 'deep enough to swim, about 2.1 km out'],
      ['Banks', 'trees whose leaves do not wither, fruit every month'],
    ],
    solomon: 'The water of his temple stood still, in the bronze Sea, ten cubits across, where the priests washed (1 Kgs 7:23–26; 2 Chr 4:6). Jerusalem\'s one real spring, the Gihon, rises in this same valley.',
  });

  stops.push({
    ref: '48:30–35', title: 'The LORD is there', scene: BUILT, hours: 16.8, dwell: 22, layer: 'ezcity', labels: ['ezcity'],
    pos: V(2100, 2400, 0), target: V(65, 100, 3500),
    text: 'The vision ends with a city, set apart from the temple, to the south. It is square, with three gates on each side, one for each tribe of Israel. The last line of the book gives its name. It is no longer called Jerusalem: "the name of the city from that day shall be, The LORD is there."',
    facts: [
      ['Each side', '4,500 cubits, about 2.36 km'],
      ['Around', '18,000 cubits'],
      ['Gates', '12, named for the tribes'],
      ['Name', 'YHWH Shammah'],
    ],
    solomon: 'Even at its largest, under the later kings, Jerusalem covered well under one square kilometre. This square would cover about 5.6, and the temple stands outside it.',
  });

  return stops;
}
